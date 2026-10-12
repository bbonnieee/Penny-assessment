# Implementation Notes

## 1. What I changed

**Task 1: Fixed the two failing tests at the root cause**
- **Diff** (`diff.util.ts`): a line was "changed" only if its unit price changed, so CR-1's quantity change
  (10 → 11) showed as unchanged. A new `itemChanged()` compares quantity, unit price and description.
- **Permissions** (`cr-detail.component.ts`): Approve/Reject only checked that the CR was pending. One
  `canAct` rule now also requires the user's org and an approve policy (`canApprovePolicy`).

**Task 2: List** (`cr-list/`)
- Status filter: `visibleRows` filters the loaded rows without changing them.
- "No change requests with status X" message with a **Show all** button when the filter matches nothing.
- Delta formatted as money (`USD 500.00`).

**Task 3: Detail** (`cr-detail/`)
- Timeline sorted oldest-first, with readable UTC times and an empty-history message.
- Diff panel and totals/delta rendered from the loaded CR.
- **Bug fix:** selecting another CR didn't reload the detail (`load()` only ran in `ngOnInit`). It now
  reloads in `ngOnChanges`, and a `requestSeq` counter drops responses for a CR the user has already left.
- Reject reason must contain real text (not just spaces), max 500 characters, and is sent trimmed.
- Approve/Reject share one `runAction()` flow:
  - It runs only if the user can act and nothing else is in flight, so a double click sends one request.
  - While waiting, the controls are locked and the button reads "Approving…" / "Rejecting…".
  - On success, the CR returned by the API replaces the loaded one (status, timeline and actions update).
  - On failure, it re-reads the CR before showing the error, because the change may have been saved anyway.
    The last known CR stays on screen.

**Task 4: Read-only and UX states**
- A hint explains why actions are unavailable (read-only access, other org, or not pending).
- Idle messages, so no panel is ever blank.
- The detail emits `(changed)` after an action, and the app shell reloads the list.
- Demo controls in the app shell (demo glue only): "Slow network" and "Fail next request".

**Task 5: Tests:** 7 → 52 (list 2 → 11, diff 3 → 8, detail 2 → 33). See section 4.

Also: `.DS_Store` added to `.gitignore`, and changed files kept Prettier-clean.

## 2. Component & state model

- **List:** loads the user's org CRs into one `ViewState` (`idle` / `loading` / `loaded` / `empty` /
  `error`) plus `statusFilter`. `visibleRows` and `hasNoMatches` are derived from those two fields.
- **Detail:** loads one CR into its own `ViewState`. Everything shown is derived from it with getters: the
  diff, the sorted timeline, `canApprove` / `canReject` (status + org + policy) and the hint.
- **Action state:** `pendingAction` (`'approve' | 'reject' | null`), `actionError`, and the reject-reason
  form control. `submitting` is derived from `pendingAction`, so they can't disagree.
- **Flow:** the shell passes `id` → the detail loads it → an action returns the updated CR → the detail
  replaces its state and emits `(changed)` → the shell reloads the list.

## 3. Invariants I keep

| Invariant | Where |
|---|---|
| Loaded data is never mutated by the view | `visibleRows` filters, `timeline` sorts a copy |
| Actions are enabled only for a pending CR, in the user's org, with an approve policy | `canAct` |
| At most one action request in flight | `runAction()` guard + buttons disabled while `submitting` |
| Reject is never sent without a valid, trimmed reason | validators + `reject()` re-checks and trims |
| The screen shows what the server has after an action | returned CR on success; re-read on failure |
| The detail always shows the selected CR, and nothing carries over between CRs | `ngOnChanges`, `requestSeq`, `resetForNewCr()` |
| Every state renders something, and disabled actions come with a reason | idle/loading/empty/error/no-matches elements; `actionHint` |

## 4. Testing strategy

- **Rendered-DOM tests** through TestBed: they act like a user (choose a filter, type, click) and check what
  is on screen (rows, disabled buttons, messages, timeline order), so they pin behavior, not implementation.
- **Unit tests** only for the pure `computeDiff`, where edge cases are easier to list.
- **No real delays:** slow and failing responses use the mock's `latencyMs` / `failNext`. Specific failures
  use Jest spies that reject on a timer, like a real network error (Zone.js reports an already-rejected
  promise as uncaught).
- **CR switching** is tested through a small host component, so `[id]` changes go through `ngOnChanges` as
  in the app.
- **Tests can fail:** for each safeguard and feature I temporarily broke the code and confirmed a test failed.
- **Not tested:** the demo app shell, styling, and accessibility beyond the ARIA attributes being present.

## 5. Assumptions

- A description-only change counts as "changed": CR-2 (supplier swap) changes only the description.
- Reject needs the same permission as Approve; the policy convention has no separate reject action.
- Any `cr_a_*` policy allows approving; `cr_a_u` / `cr_a_w` scopes can't be checked without creator or
  workspace data on the CR.
- "No CRs match this filter" is shown separately from "no CRs at all".
- Filtering is client-side, because the mock returns the whole org list in one call.
- Timeline times are shown in UTC, so the display and tests are the same on every machine.
- A failed action means "outcome unknown", so the CR is re-read before the error is shown, instead of
  inviting a blind retry.
- Reject reasons are limited to 500 characters (my choice; the API has no limit).
- Read-only users see a disabled Approve button (the provided test expects it) but no reject form.

## 6. Where I used AI
 I used AI to help plan the logic implementation, so I could tackle the tasks in a clear, logical order. After planning, I rewrote parts of the code myself to fix the existing errors, then reviewed the formatting and tested the code to confirm it works and produces the expected output.

## 7. What I'd improve with more time
- Safer Approve/Reject: prevent duplicate requests and handle a CR that someone else already approved or rejected.
- Cleaner request handling: use Observables to cancel outdated requests instead of the manual counter.
- Proper routing: give each CR its own URL so it can be linked to, the back button works, and filters live in the URL.
- Full approval rules: support the “own CRs” and “workspace” approval scopes, which needs more data on each CR.
- Server-side filtering and paging for large lists.
- Local time zone for the timeline, with tests that fix the time zone.
- Accessibility: keyboard-friendly rows, a highlighted selected row, and focus moved to results or errors after an action.
- End-to-end tests in a real browser for the main flows.
