import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	// TODO: add validation so the form is invalid until a reason is entered.
	rejectControl = new FormControl('', { nonNullable: true });

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
		this.submitting = false;
		this.actionError = undefined;
		this.rejectControl.reset();
	}

	get detail(): CrDetail | null {
		return this.state.data;
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
		// TODO: perform the approve action through the API and reflect the outcome in the view.
		throw new Error('approve() not implemented');
	}

	async reject(): Promise<void> {
		// TODO: require a valid rejectControl, then perform the reject action through the API and
		//       reflect the outcome in the view.
		throw new Error('reject() not implemented');
	}
}
