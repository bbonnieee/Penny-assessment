import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { CrDetail, ReqUser } from '../../models/cr.models';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Hosts the detail page the way the app shell does, so `[id]` changes go through ngOnChanges. */
@Component({
	standalone: true,
	imports: [CrDetailComponent],
	template: '<app-cr-detail [id]="id"></app-cr-detail>',
})
class HostComponent {
	id = 'CR-1';
}

async function renderHost(user: ReqUser): Promise<ComponentFixture<HostComponent>> {
	TestBed.configureTestingModule({
		imports: [HostComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(HostComponent);
	fixture.detectChanges();
	await flush();
	fixture.detectChanges();
	return fixture;
}

const title = (fixture: ComponentFixture<unknown>): string | undefined =>
	fixture.nativeElement.querySelector('.cr-detail__header h2')?.textContent;

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	describe('diff panel and totals', () => {
		it('renders one row per SKU with its change kind and before/after values', async () => {
			const fixture = await render(users.approver, 'CR-1'); // SKU-A 10 -> 11, SKU-B untouched
			const rows = Array.from(fixture.nativeElement.querySelectorAll('.cr-diff__row') as NodeListOf<HTMLElement>);

			expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['changed', 'unchanged']);
			const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent);
			expect(cells).toEqual(['SKU-A', 'changed', '10 × USD 500.00', '11 × USD 500.00']);
		});

		it('marks a description-only change (supplier swap) as changed', async () => {
			const fixture = await render(users.approver, 'CR-2');
			expect(fixture.nativeElement.querySelector('.cr-diff__row').getAttribute('data-kind')).toBe('changed');
		});

		it('shows baseline → new totals and the delta as money', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const totals = fixture.nativeElement.querySelector('.cr-detail__totals').textContent.replace(/\s+/g, ' ').trim();
			expect(totals).toBe('USD 8,000.00 → USD 8,500.00 (Δ USD 500.00)');
		});
	});

	describe('timeline', () => {
		const actions = (fixture: ComponentFixture<CrDetailComponent>): string[] =>
			Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action') as NodeListOf<HTMLElement>).map(
				(el) => el.textContent ?? '',
			);

		it('renders entries oldest-first even when the API returns them newest-first', async () => {
			const fixture = await render(users.approver, 'CR-1'); // fixture audit is stored newest-first
			expect(actions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
		});

		it('keeps an already-chronological history in order', async () => {
			const fixture = await render(users.approver, 'CR-2');
			expect(actions(fixture)).toEqual(['CREATE', 'APPROVE', 'APPLY']);
		});

		it('does not reorder the loaded audit data', async () => {
			const fixture = await render(users.approver, 'CR-1');
			expect(fixture.componentInstance.detail?.audit.map((e) => e.action)).toEqual(['SEND_FOR_APPROVAL', 'SUBMIT', 'CREATE']);
		});

		it('shows timestamps formatted in UTC, with the raw ISO value in datetime', async () => {
			const fixture = await render(users.approver, 'CR-3');
			const time: HTMLElement = fixture.nativeElement.querySelector('.cr-timeline__at');
			expect(time.textContent).toBe('Mar 3, 2026, 11:00:00 AM UTC');
			expect(time.getAttribute('datetime')).toBe('2026-03-03T11:00:00.000Z');
		});

		it('shows an empty-history message instead of a blank list', async () => {
			const fixture = await render(users.approver, 'CR-3');
			const cmp = fixture.componentInstance;
			const loaded = cmp.detail as CrDetail;
			cmp.state = { status: 'loaded', data: { ...loaded, audit: [] } };
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('.cr-timeline__empty')).not.toBeNull();
			expect(fixture.nativeElement.querySelector('.cr-timeline__list')).toBeNull();
		});
	});

	describe('switching to another CR', () => {
		it('reloads and renders the new CR when the id input changes', async () => {
			const fixture = await renderHost(users.approver);
			expect(title(fixture)).toBe('Add 1 unit of SKU-A');

			fixture.componentInstance.id = 'CR-2';
			fixture.detectChanges(); // ngOnChanges -> load()
			expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
			await flush();
			fixture.detectChanges();
			expect(title(fixture)).toBe('Replace SKU-B supplier');
		});

		it('ignores a slow response for a CR that is no longer selected', async () => {
			const fixture = await renderHost(users.approver);
			const api = TestBed.inject(CrApiService);

			api.latencyMs = 50; // CR-2 request is slow...
			fixture.componentInstance.id = 'CR-2';
			fixture.detectChanges();
			api.latencyMs = 0; // ...and the user moves on to CR-3, which answers first
			fixture.componentInstance.id = 'CR-3';
			fixture.detectChanges();

			await flush(80); // both responses have now arrived, CR-2 last
			fixture.detectChanges();
			expect(title(fixture)).toBe('Extend agreement term');
		});

		it('clears a half-typed reject reason from the previous CR', async () => {
			const fixture = await renderHost(users.approver);
			const detail = fixture.debugElement.children[0].componentInstance as CrDetailComponent;
			detail.rejectControl.setValue('typed for CR-1');

			fixture.componentInstance.id = 'CR-3';
			fixture.detectChanges();
			expect(detail.rejectControl.value).toBe('');
		});
	});

	describe('reject reason validation', () => {
		it('keeps Reject disabled until the reason has real text', async () => {
			const fixture = await render(users.approver, 'CR-1');
			expect(rejectBtn(fixture).disabled).toBe(true);

			typeReason(fixture, '   \n ');
			expect(rejectBtn(fixture).disabled).toBe(true);

			typeReason(fixture, 'Price too high');
			expect(rejectBtn(fixture).disabled).toBe(false);
		});

		it('shows "Please enter a reason." once the empty field has been left', async () => {
			const fixture = await render(users.approver, 'CR-1');
			expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).toBeNull(); // not before touching

			reasonBox(fixture).dispatchEvent(new Event('blur'));
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('.cr-actions__reason-error').textContent).toContain('Please enter a reason.');
		});

		it('blocks a reason longer than the limit with its own message', async () => {
			const fixture = await render(users.approver, 'CR-1');
			typeReason(fixture, 'x'.repeat(501));
			reasonBox(fixture).dispatchEvent(new Event('blur'));
			fixture.detectChanges();
			expect(rejectBtn(fixture).disabled).toBe(true);
			expect(fixture.nativeElement.querySelector('.cr-actions__reason-error').textContent).toContain('500 characters or fewer');
		});

		it('does not call the API when reject() runs with an invalid reason', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const spy = jest.spyOn(TestBed.inject(CrApiService), 'reject');
			await fixture.componentInstance.reject();
			expect(spy).not.toHaveBeenCalled();
			expect(fixture.componentInstance.rejectControl.touched).toBe(true);
		});
	});

	describe('approve / reject actions', () => {
		it('approves: shows the new status, adds the timeline entry, and removes the actions', async () => {
			const fixture = await render(users.approver, 'CR-1');
			approveBtn(fixture).click();
			await settle(fixture);

			expect(statusText(fixture)).toBe('APPROVED');
			expect(approveBtn(fixture).disabled).toBe(true);
			expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
			const last = lastTimelineEntry(fixture);
			expect(last.querySelector('.cr-timeline__action')?.textContent).toBe('APPROVE');
			expect(last.querySelector('.cr-timeline__by')?.textContent).toBe('mona');
		});

		it('rejects with the trimmed reason and shows it in the timeline', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const spy = jest.spyOn(TestBed.inject(CrApiService), 'reject');
			typeReason(fixture, '  Price too high  ');
			rejectBtn(fixture).click();
			await settle(fixture);

			expect(spy).toHaveBeenCalledWith(users.approver, 'CR-1', expect.any(String), 'Price too high');
			expect(statusText(fixture)).toBe('REJECTED');
			expect(lastTimelineEntry(fixture).querySelector('.cr-timeline__note')?.textContent).toBe('“Price too high”');
		});

		it('locks every control during a slow request and sends only one request on a double click', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const api = TestBed.inject(CrApiService);
			const spy = jest.spyOn(api, 'approve');
			api.latencyMs = 50;

			approveBtn(fixture).click();
			fixture.detectChanges();
			expect(approveBtn(fixture).disabled).toBe(true);
			expect(approveBtn(fixture).textContent?.trim()).toBe('Approving…');
			expect(rejectBtn(fixture).disabled).toBe(true);
			expect(reasonBox(fixture).disabled).toBe(true);
			expect(fixture.nativeElement.querySelector('.cr-actions').getAttribute('aria-busy')).toBe('true');

			approveBtn(fixture).click(); // ignored: the button is disabled
			await fixture.componentInstance.approve(); // ignored: the component guard
			expect(spy).toHaveBeenCalledTimes(1);

			await settle(fixture, 80);
			expect(statusText(fixture)).toBe('APPROVED');
		});

		it('on a real failure keeps the CR on screen, explains, and lets the user try again', async () => {
			const fixture = await render(users.approver, 'CR-1');
			jest.spyOn(TestBed.inject(CrApiService), 'approve').mockImplementationOnce(() => failsLater('Server unavailable'));
			approveBtn(fixture).click();
			await settle(fixture, 10);

			expect(errorText(fixture)).toBe("Couldn't approve this change request: Server unavailable. Please try again.");
			expect(title(fixture)).toBe('Add 1 unit of SKU-A');
			expect(statusText(fixture)).toBe('PENDING_APPROVAL');
			expect(approveBtn(fixture).disabled).toBe(false);
		});

		it('when the request errors but the server applied it anyway, shows the real status', async () => {
			const fixture = await render(users.approver, 'CR-1');
			TestBed.inject(CrApiService).failNext = true; // the mock saves the change, then reports a network error
			approveBtn(fixture).click();
			await settle(fixture, 10);

			expect(errorText(fixture)).toContain('the change request is now APPROVED');
			expect(statusText(fixture)).toBe('APPROVED');
			expect(approveBtn(fixture).disabled).toBe(true);
		});

		it('keeps the last known CR if both the action and the re-read fail', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const api = TestBed.inject(CrApiService);
			jest.spyOn(api, 'approve').mockImplementationOnce(() => failsLater('Server unavailable'));
			jest.spyOn(api, 'getChangeRequest').mockImplementationOnce(() => failsLater('Network error'));
			approveBtn(fixture).click();
			await settle(fixture, 10);

			expect(errorText(fixture)).toContain("Couldn't approve");
			expect(title(fixture)).toBe('Add 1 unit of SKU-A');
			expect(approveBtn(fixture).disabled).toBe(false);
		});

		it('never calls the API for a read-only user, even if approve() is invoked directly', async () => {
			const fixture = await render(users.viewer, 'CR-1');
			const spy = jest.spyOn(TestBed.inject(CrApiService), 'approve');
			await fixture.componentInstance.approve();
			expect(spy).not.toHaveBeenCalled();
		});

		it('ignores the result of an approve that finishes after the user switched CRs', async () => {
			const fixture = await renderHost(users.approver);
			const api = TestBed.inject(CrApiService);
			const detail = fixture.debugElement.children[0].componentInstance as CrDetailComponent;
			api.latencyMs = 50;
			approveBtn(fixture).click(); // slow approve on CR-1

			api.latencyMs = 0;
			fixture.componentInstance.id = 'CR-3';
			fixture.detectChanges();
			await settle(fixture, 80);

			expect(title(fixture)).toBe('Extend agreement term');
			expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
			expect(detail.pendingAction).toBeNull();
		});

		it('emits (changed) with the updated CR after a successful action', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const emitted: CrDetail[] = [];
			fixture.componentInstance.changed.subscribe((cr) => emitted.push(cr));
			approveBtn(fixture).click();
			await settle(fixture);
			expect(emitted.map((cr) => cr.status)).toEqual(['APPROVED']);
		});

		it('emits (changed) when a failed request was applied anyway, but not when nothing changed', async () => {
			const fixture = await render(users.approver, 'CR-1');
			const api = TestBed.inject(CrApiService);
			const emitted: CrDetail[] = [];
			fixture.componentInstance.changed.subscribe((cr) => emitted.push(cr));

			jest.spyOn(api, 'approve').mockImplementationOnce(() => failsLater('Server unavailable'));
			approveBtn(fixture).click();
			await settle(fixture, 10);
			expect(emitted).toEqual([]);

			api.failNext = true;
			approveBtn(fixture).click();
			await settle(fixture, 10);
			expect(emitted.map((cr) => cr.status)).toEqual(['APPROVED']);
		});
	});

	describe('read-only and explanatory states', () => {
		it('tells a read-only user why they cannot act, and offers no reject form', async () => {
			const fixture = await render(users.viewer, 'CR-1');
			expect(hintText(fixture)).toBe('You have read-only access, so you can’t approve or reject change requests.');
			expect(approveBtn(fixture).disabled).toBe(true);
			expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
		});

		it('explains that only pending CRs can be acted on', async () => {
			const fixture = await render(users.approver, 'CR-2'); // APPLIED
			expect(hintText(fixture)).toBe('This change request is APPLIED. Only change requests pending approval can be approved or rejected.');
			expect(approveBtn(fixture).disabled).toBe(true);
			expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
		});

		it('shows no hint when the user can act', async () => {
			const fixture = await render(users.approver, 'CR-1');
			expect(fixture.nativeElement.querySelector('.cr-actions__hint')).toBeNull();
			expect(approveBtn(fixture).disabled).toBe(false);
		});

		it('replaces the actions with the hint once the CR has been approved', async () => {
			const fixture = await render(users.approver, 'CR-1');
			approveBtn(fixture).click();
			await settle(fixture);
			expect(hintText(fixture)).toContain('This change request is APPROVED.');
		});

		it('shows an error with Retry for a CR outside the user’s org, and Retry reloads', async () => {
			const fixture = await render(users.approver, 'CR-9'); // org-beta CR, user is org-alpha
			expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Not found');
			expect(fixture.nativeElement.querySelector('.cr-detail__header')).toBeNull();

			fixture.componentInstance.id = 'CR-1';
			(fixture.nativeElement.querySelector('.cr-detail__error button') as HTMLButtonElement).click();
			await settle(fixture);
			expect(title(fixture)).toBe('Add 1 unit of SKU-A');
		});

		it('shows a placeholder instead of a blank panel before anything is loaded', async () => {
			const fixture = await render(users.approver, 'CR-1');
			fixture.componentInstance.state = { status: 'idle', data: null };
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('.cr-detail__idle').textContent).toContain('Select a change request');
		});
	});
});

const hintText = (f: ComponentFixture<unknown>) => el(f, '.cr-actions__hint')?.textContent;

async function settle(fixture: ComponentFixture<unknown>, ms = 0): Promise<void> {
	await flush(ms);
	fixture.detectChanges();
}

function el<T extends HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T {
	return fixture.nativeElement.querySelector(selector) as T;
}

const approveBtn = (f: ComponentFixture<unknown>) => el<HTMLButtonElement>(f, '.cr-actions__approve');
const rejectBtn = (f: ComponentFixture<unknown>) => el<HTMLButtonElement>(f, '.cr-actions__reject-btn');
const reasonBox = (f: ComponentFixture<unknown>) => el<HTMLTextAreaElement>(f, '.cr-actions__reason');
const statusText = (f: ComponentFixture<unknown>) => el(f, '.cr-detail__header .cr-status').textContent;
const errorText = (f: ComponentFixture<unknown>) => el(f, '.cr-actions__error')?.textContent;
const lastTimelineEntry = (f: ComponentFixture<unknown>): HTMLElement => {
	const entries = f.nativeElement.querySelectorAll('.cr-timeline__entry');
	return entries[entries.length - 1];
};

function typeReason(fixture: ComponentFixture<unknown>, text: string): void {
	const box = reasonBox(fixture);
	box.value = text;
	box.dispatchEvent(new Event('input'));
	fixture.detectChanges();
}

/** A rejection that arrives asynchronously, like a real network error (and like the mock API's own failures). */
function failsLater<T>(message: string): Promise<T> {
	return new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 0));
}
