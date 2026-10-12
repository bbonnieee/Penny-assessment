import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrListComponent } from '../components/cr-list/cr-list.component';
import { CrDetailComponent } from '../components/cr-detail/cr-detail.component';
import { SessionService } from '../session/session.service';
import { CrApiService } from '../api/cr-api.service';
import { users } from '../api/fixtures';

/** Latency used by the "Slow network" demo toggle. */
const SLOW_NETWORK_MS = 1500;

/**
 * Demo app shell that hosts the list + detail screens so you can click through the UI in a browser
 * (run `npm start`). The "Acting as" switcher changes the current user via SessionService and reloads
 * both panes — handy for demoing permission-aware action states in your walkthrough video. The
 * "Slow network" / "Fail next request" controls drive the mock API's `latencyMs` / `failNext`.
 *
 * This shell is just glue for the demo; the exercise is the list/detail components and their templates.
 */
@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, CrListComponent, CrDetailComponent],
	templateUrl: './app.component.html',
})
export class AppComponent {
	readonly users = users;
	readonly userKeys = Object.keys(users);
	selectedId: string | null = 'CR-1';
	show = true;

	@ViewChild(CrListComponent) private list?: CrListComponent;

	constructor(public readonly session: SessionService, public readonly api: CrApiService) {}

	switchUser(key: string): void {
		this.session.user = users[key];
		this.reload();
	}

	onSelect(id: string): void {
		this.selectedId = id;
	}

	/** An approve/reject changed a CR: refresh the list so its status column matches the detail. */
	onCrChanged(): void {
		void this.list?.load();
	}

	setSlowNetwork(slow: boolean): void {
		this.api.latencyMs = slow ? SLOW_NETWORK_MS : 0;
	}

	failNextRequest(): void {
		this.api.failNext = true;
	}

	/** Destroy + recreate the panes so they re-load as the newly selected user. */
	private reload(): void {
		this.show = false;
		setTimeout(() => (this.show = true));
	}
}
