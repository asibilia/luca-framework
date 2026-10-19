# @luca/engine: failed tries and the ticket review

This page goes on from [A ticket's steps, fix loops, and bad tests](ticket-steps.md)
and [The feature map](ticket-feature-map.md).

**Failed tries.** A failed agent turn is journaled once as `agent_failed`
with its `failure` kind and session; the decision step picks what comes next,
so a crashed run decides the same way again. An `agent` (an error result, a
timeout), `result` (no structured output, or output that misfits the role's
schema), or `guard` failure uses up one of the role's tries on the ticket
(`MAX_FIX_ROUNDS`, 3, in all): the test-writer or implementer gets a
follow-up in the same session saying what failed, the error, and that the
disallowed changes were undone (`failedTryMessage`); a reviewer, or an agent
with no session, gets a fresh launch. The last try's failure is stuck. An
`engine` failure (the SDK crashed, or a follow-up's session is gone) starts a
fresh agent of that role without using up a try; three in a row
(`MAX_ENGINE_FAILURES`) are stuck. A failed `already_done_checked` is an
`evidence` failure for the test-writer (#495): it uses up a try the same
way, but its follow-up asks the test-writer to fix its evidence or write
the tests. A retry that finishes flows on like any
result: it can set the role's first result, or answer a fix round and rerun
the red check or the gates.

**The ticket review.** After the green commit, a fresh, read-only
reviewer gets the ticket's committed diff (`git diff <base>..<green>` and the
files it changes), the engine's gate results, and the acceptance criteria.
On a refactor ticket it also checks that behavior didn't change. Each
**finding** is a `blocker`, a `should_fix`, or a `nit`, and a `code` or a
`test` finding. The verdict must match the findings (`changes_requested`
exactly when one is a blocker or should-fix); one that doesn't is a failed
try (`result`), and a fresh reviewer tries again.

Blockers and should-fixes open a **review fix round**. Test findings go
first, to a fresh test-writer (who may edit only tests); then code findings
go to a fresh implementer (the first one's session closed with the green
commit; the implementer's session is followed up only if it is still open).
Each fixer answers every finding it got in `finding_responses`: `fixed`,
`wont_fix` with a reason, or `other_role` with a reason when the other writer
role must fix it, or must fix it too (a code fix that needs a test, or a test
that needs a non-test helper). Once both fixers answered, the `other_role`
findings go to a fresh agent of the other role, with only those findings,
before the gates (#616). Its answer is final: a second `other_role` counts as
`wont_fix`. The fixes must pass the gates (with the usual gate
fix loop, counted afresh each round), get their own commit
(`fix: review round <n> for ...`; nothing changed means no commit, and the
journal notes the current commit), and then a fresh reviewer sees **only the
new changes** (`git diff <last reviewed>..<fix>`) plus the earlier findings
with each fixer's answer. It rules on each "won't fix" in `rulings`:
`accepted` declines the finding, `rejected` keeps it open (and it lists it
again). A "won't fix" with no ruling that isn't listed again counts as
declined. A review that still asks for changes after `MAX_FIX_ROUNDS` (3)
fix rounds is stuck (`changes_requested`). An implementer that answers
`bad_test` while fixing review findings is stuck (`bad_test`).

Nits never go back. They stay in the reviewers' `agent_finished` records,
and the PR description lists every nit (one per id) and every declined
finding with the fixer's and the reviewer's reasons.

Anything else that fails (the leftover scan, a join after its last rebase),
a fix loop or failed tries at their cap, a second bad test, a test-writer
with nothing new to test (a ticket that changes no behavior, but has no
`refactor` label), or an agent that needs a test setup file changed
becomes `mark_stuck` ──> `ticket_stuck` with its reason. What happens next
is in "Stuck work" below.

`runEngine` reads the journal before every step, so it can resume a journal
left by a crashed engine. A snapshot cut short by a crash is taken again; replay
keeps the latest snapshot of each ticket. The rest is in "Crash recovery".
