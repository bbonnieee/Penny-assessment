import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function render(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	const fixture = await create(user);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return fixture;
}

/** Creates the component without rendering, so a test can set up the mock API (latency, failure) first. */
async function create(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	return TestBed.createComponent(CrListComponent);
}

const rowIds = (fixture: ComponentFixture<CrListComponent>): string[] =>
	Array.from(fixture.nativeElement.querySelectorAll('.cr-list__row td:first-child') as NodeListOf<HTMLElement>).map(
		(td) => td.textContent ?? '',
	);
const query = (fixture: ComponentFixture<CrListComponent>, selector: string): HTMLElement | null =>
	fixture.nativeElement.querySelector(selector);

function chooseStatus(fixture: ComponentFixture<CrListComponent>, status: string): void {
	const select = query(fixture, '.cr-list__filter') as HTMLSelectElement;
	select.value = status;
	select.dispatchEvent(new Event('change'));
	fixture.detectChanges();
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('only shows change requests from the user’s own org', async () => {
		const fixture = await render(users.otherOrg);
		expect(rowIds(fixture)).toEqual(['CR-9']);
	});

	describe('loading and error states', () => {
		it('shows a loading message (and no table) while the request is in flight', async () => {
			const fixture = await create(users.approver);
			TestBed.inject(CrApiService).latencyMs = 50;
			fixture.detectChanges();

			expect(query(fixture, '.cr-list__loading')?.textContent).toContain('Loading change requests');
			expect(query(fixture, '.cr-list__table')).toBeNull();

			await flush(80);
			fixture.detectChanges();
			expect(query(fixture, '.cr-list__loading')).toBeNull();
			expect(rowIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
		});

		it('shows the error with Retry when loading fails, and Retry recovers', async () => {
			const fixture = await create(users.approver);
			TestBed.inject(CrApiService).failNext = true;
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(query(fixture, '.cr-list__error')?.textContent).toContain('Network error');
			expect(query(fixture, '.cr-list__table')).toBeNull();
			expect(query(fixture, '.cr-list__empty')).toBeNull();

			(query(fixture, '.cr-list__error button') as HTMLButtonElement).click();
			fixture.detectChanges();
			expect(query(fixture, '.cr-list__loading')).not.toBeNull();
			await flush();
			fixture.detectChanges();
			expect(query(fixture, '.cr-list__error')).toBeNull();
			expect(rowIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
		});
	});

	describe('status filter', () => {
		it('narrows the rendered rows and visibleRows to the chosen status', async () => {
			const fixture = await render(users.approver);
			chooseStatus(fixture, 'PENDING_APPROVAL');
			expect(rowIds(fixture)).toEqual(['CR-1']);
			expect(fixture.componentInstance.visibleRows.map((r) => r.id)).toEqual(['CR-1']);

			chooseStatus(fixture, 'DRAFT');
			expect(rowIds(fixture)).toEqual(['CR-3']);
		});

		it('restores every row on ALL without reloading or changing the loaded data', async () => {
			const fixture = await render(users.approver);
			const spy = jest.spyOn(TestBed.inject(CrApiService), 'listChangeRequests');
			chooseStatus(fixture, 'APPLIED');
			chooseStatus(fixture, 'ALL');

			expect(rowIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
			expect(fixture.componentInstance.state.data?.length).toBe(3);
			expect(spy).not.toHaveBeenCalled();
		});

		it('shows a "no matches" message (not the empty state) when the filter matches nothing', async () => {
			const fixture = await render(users.approver);
			chooseStatus(fixture, 'REJECTED');

			expect(query(fixture, '.cr-list__no-matches')?.textContent).toContain('No change requests with status REJECTED.');
			expect(query(fixture, '.cr-list__table')).toBeNull();
			expect(query(fixture, '.cr-list__empty')).toBeNull();
		});

		it('"Show all" clears the filter, restores the rows, and resets the dropdown', async () => {
			const fixture = await render(users.approver);
			chooseStatus(fixture, 'REJECTED');

			(query(fixture, '.cr-list__no-matches button') as HTMLButtonElement).click();
			fixture.detectChanges();

			expect(rowIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
			expect((query(fixture, '.cr-list__filter') as HTMLSelectElement).value).toBe('ALL');
			expect(query(fixture, '.cr-list__no-matches')).toBeNull();
		});
	});

	describe('rows', () => {
		it('formats the delta as money in the CR currency', async () => {
			const fixture = await render(users.approver);
			const firstRowCells = fixture.nativeElement.querySelectorAll('.cr-list__row')[0].querySelectorAll('td');
			expect(firstRowCells[3].textContent).toBe('USD 500.00');
		});

		it('emits the CR id when a row is clicked', async () => {
			const fixture = await render(users.approver);
			const selected: string[] = [];
			fixture.componentInstance.select.subscribe((id) => selected.push(id));

			(fixture.nativeElement.querySelectorAll('.cr-list__row')[1] as HTMLElement).click();
			expect(selected).toEqual(['CR-2']);
		});
	});
});
