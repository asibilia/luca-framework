# Level 2 briefs

A **control total** is a source value or relationship the result should satisfy (printed total, count, test), not a file hash. It can miss shared misreads or canceling errors. State its limits, or state that none exists.

## Send the same brief to Agents A and B

Change only the agent ID and output path. Give each agent the same original source in a separate clean context and workspace; use a different model for B where available. Neither sees the other's work until both first passes are complete and accepted under the [Level 1 contract](level-1-dispatch.md). Record each first-pass artifact's digest before reconciliation.

```text
Agent: <A or B>
Source: <original source paths>
Task and scope: <identical extraction/analysis request>
Schema and source pointers: <fields, ordering, page/row or file/line>
Control total: <source value, calculation/sign convention, limits; or NONE>
Output: <this agent's named artifact>

Read the source yourself. Cover the full scope and point consequential facts
back to it. Mark unreadable entries unresolved; do not guess. Compute the
first-pass total and show the arithmetic, even if it disagrees with the
source. Never add a plug value or omit an entry to make it match. Say what the
total cannot catch. Follow the attached Level 1 contract for the artifact.
```

A first-pass total mismatch is **recorded**, not an L1 failure: the source total may be wrong. Do not make matching it an L1 passing criterion. If a first-pass artifact fails L1 for another reason, redispatch that side once to a new agent; a second failure goes to the human.

## Give the reconciler the original source and both frozen artifacts

```text
Compare every row or claim, including omissions and extras. For every
difference, reread the original source and log the decision, source pointer,
and remaining uncertainty. Check the dispatcher-selected agreements too.
Do not choose a value only because both agents agree or to force a total.
Recompute any control total from the reconciled result. If a full reread of
disputed regions changes nothing, stop and name the residual, including
"source total disagrees with its own line items" when supported. Deliver the
reconciled artifact and log under Level 1; flag unresolved points for a human.
```

Before reconciliation, select **all high-impact and boundary agreements**, then a seeded random sample from the rest: at least `max(20, ceil(5% of all agreements))`, capped by what remains (so small jobs check every agreement). Record seed and selected IDs. Without a control total, use at least `max(40, ceil(10% of all agreements))` and require human review before calling the result verified.
As an independent-draw approximation, a 20-item sample has about a 95% chance to catch at least one error only when about 14% of entries have that error (`1 − 0.86^20 ≈ 0.95`). Rarer or shared errors call for a larger check, a relevant control total, or human review.

| Item | A | B | Source pointer and observation | Decision and reason | Status |
| --- | --- | --- | --- | --- | --- |
| `<ID>` | `<value/missing>` | `<value/missing>` | `<page:row or file:line>` | `<value and why>` | `resolved/unresolved` |

Log both first-pass totals, the reconciled total and calculation, sample seed and IDs, checked agreements, and every residual. Two agents can share the same source misread; directly review ambiguous scans and high-impact labels even if totals match.
