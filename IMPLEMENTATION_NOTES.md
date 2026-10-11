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

## 4. Testing strategy
<!-- What you tested (component/DOM vs pure) and why; what you deliberately skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the requirements left room for interpretation, the calls you made and why. -->

-

## 6. Where I used AI
-

## 7. What I'd improve with more time
-
