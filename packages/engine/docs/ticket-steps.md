# @luca/engine: a ticket's steps, fix loops, and bad tests

This page goes on from [How a run moves](how-a-run-moves.md) and
[The prepare command](prepare-and-tests.md). It goes on in
[The feature map](ticket-feature-map.md) and
[Failed tries and the ticket review](ticket-review.md).

**Cleaning up.** Once the PR is open, every ticket's worktree and the run
branch's are removed (`git worktree remove --force`, then `git worktree
prune`). After a `stop` reply, only the worktrees of the tickets that pushed
are removed; the rest stay for later. Branches and the journal always stay.

Each agent turn (`launch_agent` or `follow_up_agent`) may also journal
`agent_session` (the launcher's summary), `agent_failed` (a failed turn, with
how it failed), `shared_git_changed` (something else changed the shared
`.git` during the turn; see Guards), or `run_stopped` (see Guards). Once
nothing can send an agent a follow-up, its session's close is journaled as
`agent_session_closed`. Any step may be preceded by a
limit wait or a billing stop, and a finished ticket and the run's end by
`usage_recorded` (see Plan limits and billing). The scheduler wraps every
step but a wait in `step_started` and `step_ended`, and a restarted engine
may append `run_resumed` (see Crash recovery).

While a test-writer or implementer works, it may send **agent messages**
(`agent_message`), and each tool call it makes may hand it messages waiting
for it (`agent_message_delivered`). Neither changes a ticket's progress; see
"Agent messages" below.

A refactor ticket (labelled `refactor`) skips the test-writer, the red check,
and the red commit: its implementer may follow renames into test files, but
must not change what a test checks.

**Already done (#484).** A test-writer that finds the ticket's work already
on the base branch answers `already_done`, with its evidence: in `done_by`,
the commits that did the work (`{ sha, title }`), and in `criteria`, the
tests that already cover each criterion. It may only say so when every
criterion is met and tested; an `already_done` with no commit or no tests is
a failed try.

The engine checks the evidence before it believes it (#495):
`check_already_done` runs in the ticket's worktree, on the commit the
worktree started from (its base). Each commit must be in the repo and on
the base. Each criterion must name a test. Each named test file must exist,
be a test file, and have no changes in the worktree. The engine runs just
those files (the config's bun test commands with the files added, after the
prepare command if there is one), and each named test must pass. It
journals `already_done_checked` with what did not check out. If anything
did not, that is a failed try for the test-writer: it gets the list in its
session, and can fix its answer or write the tests instead. After 3 failed
tries the ticket is stuck (`agent_failed`), with the list.

Once the evidence checks out, the ticket is done, not stuck, and nobody has
to reply:
`mark_already_done` comments on the spec issue with the commits and the
tests, and journals `ticket_already_done`. Tickets that wait on it start as
if it had pushed. The run's PR closes it, listed as
`Closes #11: Add sum (already done before this run, by 3559c25)`. A run
with no PR closes it itself: a comment on the ticket naming the commits,
then `closeIssue` (`ticket_closed`). If every ticket was already done, the
run ends with nothing to do (`finish_nothing_to_do` ──> `nothing_to_do`
with `already_done`, exit 0).

**Not in this run (#484).** Just before it opens the PR, the engine reads
the spec's sub-issues again. An open one that isn't in the run (reopened
while the run went, or closed at intake and reopened since) is named in the
PR, under "Not in this run", with its number and title. The PR doesn't close
it. Tickets left out for a person (below) aren't listed there again.

**Tickets for a person (#499).** A spec can mix agent work and work only a
person can do, such as renaming the repo or shipping after a hands-on check.
Label those tickets `ready-for-human`. Intake leaves them out of the run: no
checks, no comment, no relabel. A `ready-for-agent` ticket blocked by one,
directly or through other tickets, is left out too, since it can't be built
yet. The rest builds. A ticket for a person blocked by agent tickets is fine:
it just stays open for the person. What was left out, and why, is in the
`spec_snapshot` record's `left_out` (older journals have none). The PR lists
them under "For a person" and "Waiting on a person"
(`- #13 Link the store: waits on #12, which is for a person`). If nothing is
left to build, the run ends with nothing to do (`nothing_to_do` with
`left_out`), and says why.

**Fix loops.** A failed red check goes back to the same test-writer session,
and failed gates to the same implementer session, with their output
(`follow_up_agent` ──> `agent_started` with `follow_up_of`, then
`agent_finished`). Each gets `MAX_FIX_ROUNDS` (3) follow-ups after its first
try; a failure after the last one is stuck. The rounds are counted from the
order of journal records (a test-writer result after a red check is an
answered round), so a crashed run counts them the same way, and a follow-up
that started but never finished is sent again, not counted.

**A bad test** (the implementer answers `bad_test`) throws away the
implementer's uncommitted work (`git reset --hard` and `git clean -fd`,
ignored files kept) and sends the ticket to a fresh test-writer, told which
test was bad and why. Its tests get their own red check and their own red
commit (`test: replace a bad test for ...`), then a fresh implementer builds.
The second bad test (`MAX_BAD_TEST_BOUNCES` is 1) is stuck, and so is any bad
test on a refactor ticket. A bad-test stuck detail, and so the spec comment,
names the test's file and name and, for a test the implementer sent back,
quotes its reason, clipped like other outputs (#490). It says "no reason
given" only when the implementer gave none. A test the engine sent back (see
below) names the test and says it runs no `expect()`. The "Why" line is the
same whoever sent it back; the detail says who sent each of the two bounces.

**The cap and unmapped tests (#581).** A test-writer may map at most
`MAX_TESTS_PER_CRITERION` (3, in `core/loop-caps.ts`) tests to a criterion; a
fourth is the red check problem "AC1 has 4 tests; write at most 3 per
criterion". Every test the ticket adds must be in the map too. The red check
reads each test file the ticket changed as it was at the ticket's base and as
it is now (`addedTestNames` in `gates/new-tests.ts`: the plain string names
of its `test(` and `it(` calls, not a `test.each` or a template name), and a
name only the new text has is a new test. One that no mapped name equals, or
ends with after " > ", is the problem `"extra" in src/sum.test.ts: a new test
the map doesn't name (map it to a criterion, or remove it)`. The names come
from a text scan, so the red check trusts them only as far as it can check
them. In a file that ran (it has results in the red run), a name counts as a
new test only if a test of that name ran, so a `test('x', ...)` inside a
template-string fixture is not one. A file that doesn't load yet (its code
isn't written) has no results, so every `test(` in its text counts, even one
inside a string or a comment; the problem then adds "The file does not load
yet, so every test( in its text counts, even one inside a string or a
comment".

**Timings (#518).** The journal records how long things took. A gate check
has `duration_ms`, how long its command ran, and the `prepare` check also
`wait_ms`, how long it waited for a prepare slot. A test case in a test run
has `duration_ms` (from bun's JUnit `time`) and `assertions` (its `expect()`
count, #581). All of them are optional: a journal written before they existed
has none, and nothing that reads them needs them.

**A test that checks nothing** (#581). A ticket's gates journal `cases` in
`gates_run`: the test cases of the ticket's red test files, from the fast runs
and the run of its own slow test files, each with its `expect()` count (join
and final gates leave them out). Once the gates pass, a mapped test that
passed with `assertions` of 0 sends the ticket back the way a bad test does:
`reset_ticket_worktree` journals `worktree_reset` with a `bad_test` (the
file, the name, and why), and a fresh test-writer is told "The engine found
this test checks nothing". It counts toward the same cap
(`MAX_BAD_TEST_BOUNCES`), so a second empty test, or one after the implementer
already sent a test back (or the other way round), is stuck (`bad_test`). Replay
keeps who sent each bounce, oldest first, as `bad_test_sources`, so the stuck
detail words both ("The implementer sent a test back as bad, and then, after a
fresh test-writer, the engine found a mapped test that checks nothing", say).
A mapped test the gates did not run or that did not pass is left to the other
checks, an older journal's
cases carry no count so nothing is sent back, and a refactor ticket (no map)
or a ticket rejoining after a rebase (its code is already reviewed) is not
checked. A review fix's gates are not checked either: their tests are not
red-checked. The latest bounce's source also words the fresh test-writer's
prompt ("The engine found this test checks nothing", or "The implementer says
this test is wrong"). Replay keeps it as `bad_test_source`, beside `bad_test`:
a `retry` clears `bad_test_sources` with the bounce count, but keeps the bad
test and who sent it, so a test-writer started again after a retry is told the
same thing.
