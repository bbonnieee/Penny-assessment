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
});
