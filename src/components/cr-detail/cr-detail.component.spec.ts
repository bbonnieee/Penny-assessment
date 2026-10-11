import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { CrDetail, ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

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
});
