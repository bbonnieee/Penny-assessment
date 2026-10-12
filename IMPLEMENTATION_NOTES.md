# Implementation Notes

> Fill this in as part of your submission. 1–2 pages, bullet points are fine. Delete these
> instructions before submitting.

## 1. What I changed
<!-- Grouped by task: bugs fixed and features implemented (component + template). -->

**Task 0: Orient**
- Read the README, models, fixtures, mock API and both templates; wrote the screen/state summary in
  section 2.

**Task 1: Fixed the two failing tests at the root cause**
- **Diff misclassified a changed line** (`src/components/diff.util.ts`). `computeDiff` decided
  "changed" vs "unchanged" by comparing only `unitPrice`, so a quantity-only change (CR-1: SKU-A 10 → 11)
  was reported as unchanged. I added an `itemChanged(a, b)` helper that compares every field the
  reviewer sees — `quantity`, `unitPrice` and `description` — and used it in place of the price-only
  check. Description counts as a change because CR-2 ("Replace SKU-B supplier") changes only the
  description; otherwise that CR would show no changes at all.
- **Approve was enabled for a read-only user** (`src/components/cr-detail/cr-detail.component.ts`).
  `canApprove` / `canReject` checked only that the CR was `PENDING_APPROVAL` and ignored the user's
  policies. I added one private `canAct` getter used by both: the CR is pending **and** belongs to the
  user's org **and** the user holds an approve policy (`canApprovePolicy` from
  `src/common/permissions.ts`). Approve and Reject share one rule so they can't drift apart; there is no
  separate reject policy in the convention, so rejecting needs the same approve permission.
- Result: all 7 provided tests pass (`npm test`).

**Task 2: Change Request list** (`src/components/cr-list/`)
- **Status filter.** `visibleRows` returns every row for `ALL`, otherwise only rows whose status matches
  `statusFilter`. It uses `filter`, so the loaded `state.data` is never changed and switching back to
  `ALL` needs no reload.
- **"No matches" state.** A `hasNoMatches` getter (loaded, but the filter leaves zero rows) hides the
  table and shows "No change requests with status X" with a **Show all** button (`clearFilter()`).
  This is separate from the existing `empty` state, which means the org has no CRs at all.
- **Dropdown kept in sync.** Each `<option>` binds `[selected]="s === statusFilter"`, so the select
  shows `ALL` again after **Show all** resets the filter from code.
- **Formatted delta.** The Delta column uses `formatMoney` with the CR's currency (`USD 500.00`)
  instead of a raw number.
- The existing loading / error (with Retry) / empty states are unchanged.

**Task 3: Change Request detail** (`src/components/cr-detail/`)
- **Chronological timeline.** `timeline` sorts a copy of `audit` oldest-first by `Date.parse(at)`
  (CR-1's history arrives newest-first from the API). Sorting a copy keeps the loaded data untouched;
  JavaScript's sort is stable, so entries with the same timestamp keep the API's order.
- **Readable timestamps.** Each entry renders as `<time datetime="…">` formatted with the `date` pipe in
  UTC (e.g. "Mar 2, 2026, 9:00:00 AM UTC"); the raw ISO value stays in `datetime`.
- **Empty history.** A CR with no audit entries shows "No history recorded yet." instead of an empty list.
- Tests: oldest-first order (CR-1), already-ordered history unchanged (CR-2), loaded data not reordered,
  UTC formatting + `datetime`, empty-history message.
- **Bug found: selecting another CR didn't reload the detail.** The app shell keeps the same
  `<app-cr-detail>` instance and only changes its `id` input, but `load()` ran only in `ngOnInit`, so the
  old CR stayed on screen. `ngOnChanges` now reloads on any later `id` change and first clears state that
  belonged to the previous CR (typed reject reason, action error, `submitting`).
- **Stale responses are dropped.** Each `load()` takes a number from `requestSeq`; when a response
  arrives, it is applied only if no newer load has started since. A slow answer for a CR the user has
  already left can't overwrite the CR they are looking at now.
- Tests (through a small host component, so `[id]` changes go through `ngOnChanges` as in the app):
  switching ids reloads and shows the loading state, a slow older response is ignored, a half-typed
  reason is cleared. I checked that these fail when the reload or the stale-response guard is removed.
- **Reject reason validation.** `rejectControl` has two validators: `notBlank` (a reason of only spaces or
  newlines is no reason) and `maxLength(500)`. Reject stays disabled while the reason is invalid; once the
  field has been left, the matching message shows ("Please enter a reason." / "Keep the reason to 500
  characters or fewer."). `reject()` also checks validity itself and sends the **trimmed** reason.
- **Approve / Reject actions.** Both go through one `runAction()`:
  1. It refuses to run if the user can't act (`canAct`) or a request is already in flight, so a double
     click, or a call that bypasses the disabled button, sends exactly one request.
  2. `pendingAction` ('approve' | 'reject' | null) records what is in flight; `submitting` is derived from
     it, so the two can't disagree. While it is set, both buttons and the reason box are disabled, the
     button reads "Approving…" / "Rejecting…", and the actions section has `aria-busy="true"`.
  3. On success, the CR returned by the API replaces the loaded one, so the status badge, timeline and
     action availability all update from the same data (an approved/rejected CR has no enabled actions).
  4. On failure, it **re-reads the CR before reporting**, because the request may have been applied even
     though the response failed (the mock does exactly this with `failNext`). If the status changed, the
     message says so ("…but the change request is now APPROVED"); otherwise it says "Couldn't approve…
     Please try again." and the actions are available again. If the re-read fails too, the last known CR
     stays on screen. The page never blanks out on an action error.
  5. If the user switched to another CR while the request was in flight, the result is ignored (same
     `requestSeq` check as loading).
- Tests: blank / whitespace / too-long reasons, the message appearing only after the field is touched,
  `reject()` not calling the API when invalid, approve success (status, timeline entry, actions gone),
  reject with trimmed reason shown in the timeline, a slow request locking every control and a double
  click sending one request, a real failure, a failure the server applied anyway, a failure whose re-read
  also fails, a read-only user calling `approve()` directly, and an approve finishing after a CR switch.
  For each safeguard I temporarily removed it and confirmed at least one of these tests fails.

**Task 4: Read-only and UX states**
- **Why the actions are unavailable.** An `actionHint` getter explains it in one line under the actions:
  read-only access, a CR from another organization, or a CR that isn't `PENDING_APPROVAL` (it names the
  current status). It is `null` whenever the user can act, so the hint and enabled actions never show together.
- **No blank panels.** Both components now render their `idle` state ("Change requests will appear here." /
  "Select a change request to review it."). Together with the existing loading, empty, error (with Retry)
  and no-matches states, every `ViewState` has visible output.
- **List stays in sync after an action.** The detail emits `(changed)` with the updated CR after a
  successful action, or after a failed one the server applied anyway. The app shell reloads the list on
  that event so its Status column matches the detail.
- **Demo controls in the app shell** (`src/app/`, demo glue only): a "Slow network" checkbox
  (`latencyMs = 1500`) and a "Fail next request" button (`failNext = true`), so slow and failing responses
  can be shown in the browser without editing code.
- Tests: the read-only hint and no reject form for the viewer, the "only pending" hint on an APPLIED CR, no
  hint when the user can act, the hint appearing after approving, `(changed)` emitted on success and on an
  applied-anyway failure but not on a plain failure, the not-found error with Retry, and the idle placeholder.

**Repo hygiene**
- Added `.DS_Store` to `.gitignore` and removed it from tracking (it was in the initial commit).
- Kept the changed files Prettier-clean to match the project style (`printWidth: 140`).

## 2. Component & state model
<!-- The screens, the view-state each component exposes, and how data flows from the mock API into the
template. -->

**Orientation (Task 0).** The app has two screens for an approver: a **list** of the Change Requests
in the current user's org, and a **detail** view of one selected CR. The list loads summaries from the
mock `CrApiService` into a single `ViewState` (`loading` / `loaded` / `empty` / `error`) and derives the
rendered rows from it via a status filter, without changing the loaded data. The detail view loads one CR
into its own `ViewState` and derives everything it shows from that data: the baseline-vs-proposed
line-item diff with totals and delta, the approval timeline sorted oldest-first, and whether Approve/Reject
are enabled, which depends on both the CR's status (`PENDING_APPROVAL`) and the current user's
`cr_a_*` policies from `SessionService`. The only other state on the detail view is the action flow
itself — a `submitting` flag, an `actionError` message, and the reject-reason form control — so every
rendered state can be traced back to a small, explicit set of fields.

-

## 3. Invariants I keep
<!-- Which properties the UI guarantees, and where in the component/template each is enforced. -->

| Invariant | How / where |
|---|---|
| Loaded API data is never changed by the view | `visibleRows` (list) and `timeline` (detail) return new arrays (`filter`, sort on a copy) |
| The timeline always reads oldest → newest, whatever order the API sends | `timeline` getter in `cr-detail.component.ts` |
| Approve/Reject are only enabled for a pending CR in the user's org, for a user with an approve policy | `canAct` getter, bound to `[disabled]` / `*ngIf` in `cr-detail.component.html` |
| The detail always shows the CR whose `id` is currently selected | `ngOnChanges` reloads on `id` change; `requestSeq` check in `load()` drops out-of-date responses |
| Nothing typed or shown for one CR carries over to another | `resetForNewCr()` clears the reason, `actionError` and `pendingAction` before the new load |
| At most one Approve/Reject request is in flight | `runAction()` returns early while `pendingAction` is set; buttons bind `[disabled]` to `submitting` |
| Reject never reaches the API without a valid, trimmed reason | `notBlank` + `maxLength` validators; `reject()` re-checks validity and trims |
| After an action, the screen shows what the server actually has | success uses the returned CR; failure re-reads the CR before showing the error |
| An action error never blanks the page | errors go to `actionError`; `state` keeps the last known CR |
| Disabled actions always come with a reason | `actionHint` is non-null exactly when a CR is loaded and `canAct` is false |
| Every view state renders something | `idle`, `loading`, `empty`, `error` and no-matches each have their own element in the templates |

## 4. Testing strategy
<!-- What you tested (component/DOM vs pure) and why; what you deliberately skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the requirements left room for interpretation, the calls you made and why. -->

- **A description-only change counts as "changed" in the diff.** CR-2 ("Replace SKU-B supplier")
  only changes the description; treating it as unchanged would hide the whole point of that CR.
- **Reject uses the same permission as Approve.** The policy convention has no separate reject action,
  and rejecting is part of the approval decision.
- **"No CRs match this filter" is shown separately from "no CRs at all".** An empty table after filtering
  would look like a broken page; a message plus a one-click reset tells the user why and how to recover.
- **The filter is client-side.** The mock API returns the whole org list in one call, so filtering the
  loaded rows is enough; with a paged real API this would move to a query parameter.
- **Timeline times are shown in UTC.** This makes the display, and the tests, the same on every machine.
  A production app would show the reviewer's local time zone instead.
- **A failed action is treated as "outcome unknown", not "nothing happened".** A response can fail after the
  server has applied the change, so the CR is re-read before the error is shown, instead of letting the user
  retry blindly and risk a second APPROVE/REJECT entry.
- **Reject reason limit of 500 characters.** The API contract has no limit; 500 is my choice to keep audit
  notes readable. I show a message rather than silently stopping input at the limit, so the user knows why.
- **Read-only users still see a disabled Approve button** (the provided test expects it), while the reject
  form is hidden for them, because a reason box they can never submit would only invite typing.

## 6. Where I used AI
-

## 7. What I'd improve with more time
-
