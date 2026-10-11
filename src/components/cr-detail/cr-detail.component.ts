import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

export const REJECT_REASON_MAX = 500;

/** A reason made only of spaces/newlines is as good as no reason. */
const notBlank: ValidatorFn = (control) => (((control.value as string | null) ?? '').trim() ? null : { blank: true });

export type CrAction = 'approve' | 'reject';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions that stay safe on slow or failing responses.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges {
	@Input() id!: string;

	readonly reasonMax = REJECT_REASON_MAX;

	state: ViewState<CrDetail> = idle();
	/** The action whose request is in flight, or null. The single source of truth for "busy". */
	pendingAction: CrAction | null = null;
	actionError?: string;
	rejectControl = new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(REJECT_REASON_MAX)] });

	/** Bumped on every load; a response is only applied if no newer load has started since. */
	private requestSeq = 0;

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	/** The shell reuses this component when another CR is selected, so reload on later `id` changes. */
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['id'] && !changes['id'].firstChange) {
			this.resetForNewCr();
			void this.load();
		}
	}

	async load(): Promise<void> {
		const seq = ++this.requestSeq;
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			if (seq !== this.requestSeq) return; // a newer load started; drop this stale response
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			if (seq !== this.requestSeq) return;
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	/** Clear state that belongs to the previous CR (a typed reason, an error, an in-flight flag). */
	private resetForNewCr(): void {
		this.pendingAction = null;
		this.actionError = undefined;
		this.rejectControl.reset();
		this.rejectControl.enable();
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	/** True while an Approve/Reject request is in flight; every action control is disabled meanwhile. */
	get submitting(): boolean {
		return this.pendingAction !== null;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. Sorts a copy so the loaded CR data is never changed. */
	get timeline(): TimelineEntry[] {
		return [...(this.detail?.audit ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	/** Shared gate: CR is pending, belongs to the user's org, and the user's role allows approval. */
	private get canAct(): boolean {
		const cr = this.detail;
		const user = this.session.user;
		return !!cr && cr.status === 'PENDING_APPROVAL' && cr.orgCode === user.orgCode && canApprovePolicy(user);
	}

	/** Whether the current user may approve the loaded CR. */
	get canApprove(): boolean {
		return this.canAct;
	}

	/** Whether the current user may reject the loaded CR. */
	get canReject(): boolean {
		return this.canAct;
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		await this.runAction('approve', (at) => this.api.approve(this.session.user, this.id, at));
	}

	async reject(): Promise<void> {
		this.rejectControl.markAsTouched(); // surface the validation message if Reject is reached while invalid
		if (this.rejectControl.invalid) return;
		const reason = this.rejectControl.value.trim();
		await this.runAction('reject', (at) => this.api.reject(this.session.user, this.id, at, reason));
	}

	/**
	 * Shared Approve/Reject flow. Refuses when the user can't act or a request is already in flight (so a
	 * double click sends one request), locks the controls while waiting, and ignores the outcome if the user
	 * has switched to another CR in the meantime.
	 */
	private async runAction(action: CrAction, call: (at: string) => Promise<CrDetail>): Promise<void> {
		if (!this.canAct || this.submitting) return;
		const seq = this.requestSeq;
		const statusBefore = this.detail?.status;
		this.pendingAction = action;
		this.actionError = undefined;
		this.rejectControl.disable();
		try {
			const updated = await call(new Date().toISOString());
			if (seq !== this.requestSeq) return;
			this.state = { status: 'loaded', data: updated };
			this.rejectControl.reset();
		} catch (err) {
			if (seq !== this.requestSeq) return;
			// The request failed, but it may still have been applied on the server, so re-read the CR
			// before telling the user what happened. Controls stay locked until we know.
			const latest = await this.fetchLatest();
			if (seq !== this.requestSeq) return;
			if (latest) this.state = { status: 'loaded', data: latest };
			const message = (err as Error).message;
			this.actionError =
				latest && latest.status !== statusBefore
					? `The ${action} request reported an error (${message}), but the change request is now ${latest.status}.`
					: `Couldn't ${action} this change request: ${message}. Please try again.`;
		} finally {
			if (seq === this.requestSeq) {
				this.pendingAction = null;
				this.rejectControl.enable();
			}
		}
	}

	/** Re-read the current CR without switching the view to its loading state; null if that fails too. */
	private async fetchLatest(): Promise<CrDetail | null> {
		try {
			return await this.api.getChangeRequest(this.session.user, this.id);
		} catch {
			return null;
		}
	}
}
