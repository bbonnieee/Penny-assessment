# Implementation Notes

> Fill this in as part of your submission. 1–2 pages, bullet points are fine. Delete these
> instructions before submitting.

## 1. What I changed
<!-- Grouped by task: bugs fixed and features implemented (component + template). -->

-

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
