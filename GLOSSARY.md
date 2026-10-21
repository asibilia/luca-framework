# Luca

Luca turns planned work into a reviewed pull request by running a team of AI agents under strict, code-driven control.

## Language

### Planned work

**Spec**:
A written description of one feature: the problem, the solution, and how it will be tested.
_Avoid_: PRD, plan

**Ticket**:
One thin slice of a spec that can be built, tested, and shown working on its own. Not the same as a wayfinder decision ticket.
_Avoid_: task, todo, phase, increment

**Refactor ticket**:
A ticket that changes how the code is shaped but not what it does, so no new test can fail first.
_Avoid_: chore, cleanup

**Blocked**:
A ticket that waits on another ticket that isn't done yet.
_Avoid_: stuck, waiting

**Ticket for a person**:
A ticket only a person can do, labeled `ready-for-human`. A run leaves it out, along with the tickets that wait on it, and builds the rest.
_Avoid_: human task, manual ticket

### Running the work

**Run**:
One trip of the engine through a spec's tickets, ending in a pull request.
_Avoid_: build, pipeline, session

**Run branch**:
The branch a run's finished tickets join one at a time, and that its one pull request is opened from.
_Avoid_: integration branch, feature branch

**Intake**:
The check, before a run starts, that a spec and all its open tickets are ready to build. It also checks that acceptance criteria hold no placeholders or untestable asks, and none describe behaviour that doesn't change. If anything fails, the run does not start. Tickets for a person are left out, not checked.
_Avoid_: preflight, validation

**Engine**:
The plain code that drives a run and picks every next step.
_Avoid_: orchestrator

**Release**:
A published npm version of Luca. Every run uses the installed one, including runs on Luca itself.
_Avoid_: deploy, install

**Agent**:
One model session doing one role on one ticket.
_Avoid_: subagent, worker

**Helper**:
A read-only Haiku session an agent starts to search the repo; not an agent.
_Avoid_: subagent, searcher agent

**Role**:
The job an agent does in a run, such as test-writer, implementer, or reviewer.
_Avoid_: mode, persona

**Gate**:
A check the engine runs itself, such as the tests or the type checker, that must pass before the run moves on.
_Avoid_: hook, checks

**Slow tests**:
End-to-end tests a repo names in `checks.slow_test`. Luca leaves them out of every ticket's runs, apart from the slow test files that ticket names or changes, and runs them all at the final review.
_Avoid_: e2e gate, long tests

**Test slots**:
The cap a repo sets with `test_concurrency` on how many test runs go at once across a run, so tests that share ports, files, or a database don't collide. A test run waits for a free slot, and the wait never counts toward its time limit.
_Avoid_: test queue, test lock

**Lone rerun**:
The engine's rerun of a ticket's failed red check or gates while no other test run is going, holding every test slot. It comes before any fix round when each old test that failed also failed in another ticket within 10 minutes, so a collision between tickets costs one rerun, not a fix round. A check gets one per ticket.
_Avoid_: exclusive retry, solo run

**Feature map**:
A markdown file (or a folder of markdown pages, one per area) a repo names in `feature_map` that lists each feature and the test files that prove it. The red check refuses a new test file the map doesn't list, so tickets add tests to a feature's files instead of scattering new ones.
_Avoid_: test index, test registry

**Red check**:
The gate that proves a ticket's new tests fail, and every old test still passes, before any code is written. It also refuses more than three tests for one criterion, and any new test the test-writer's criterion mapping doesn't name.
_Avoid_: fail-first check

**Fix loop**:
The capped rounds in which an agent fixes what a gate or a reviewer reported. Reaching the cap makes the run stuck.
_Avoid_: retry loop

**Environment failure**:
A failed red check or failed gates that a test-writer or implementer says are not its ticket's fault, such as a port already in use. It answers `environment` with its evidence, and the engine reruns the check once without using a fix round. A rerun that fails the same way makes the ticket stuck as `environment_failed`.
_Avoid_: flaky failure, infra error

**Leftover scan**:
The gate that stops files an agent left behind, such as scratch scripts or stray notes, from being committed.
_Avoid_: shadow scan, cleanliness check

**Ticket review**:
A fresh reviewer's check that one ticket's committed diff really meets its acceptance criteria, with honest tests.
_Avoid_: code review, self-review

**Final review**:
The review of a whole run's branch through several lenses, before the pull request opens.
_Avoid_: whole-branch review, audit

**Fresh pass**:
The final review's last read before the pull request, in which every lens reads the whole branch again, without earlier findings, after the last fix round.
_Avoid_: re-review, second review

**Lens**:
The single angle a reviewer judges code from, such as security, architecture, or the repo's rules.
_Avoid_: perspective, reviewer type

**Finding**:
One problem a reviewer reports, tagged as a blocker, a should-fix, or a nit.
_Avoid_: issue, comment

**Assumption**:
A call an agent made by itself when something was unclear, listed in the pull request for a person to check.
_Avoid_: guess, open question

**Guard**:
The rules that block an agent's action when its role doesn't allow it.
_Avoid_: stage-gate, permission

**Stuck**:
The state of a ticket, or of the final review, when the engine can't safely pick its next step by itself. The rest of the run keeps going.
_Avoid_: blocked, halted

**Escalation**:
Stuck work asking a person for help.
_Avoid_: halt

**Already-done ticket**:
A ticket whose work is already on the base branch when its run reaches it. It counts as done, not stuck, and the run's pull request closes it.
_Avoid_: stale ticket, duplicate

**Skipped ticket**:
A ticket you chose to leave out of a run after it got stuck. It stays open for a later run, along with the tickets that wait on it.
_Avoid_: dropped, abandoned

**Limit wait**:
A pause until a plan window resets, either because the plan's own limit was hit or because Luca's use reached the usage line. The run carries on by itself afterwards, so it isn't stuck.
_Avoid_: stuck, throttled

**Usage line**:
The share of a plan window, such as the weekly or the 5-hour window, that Luca may use across all its runs before they pause in a limit wait.
_Avoid_: quota, threshold, cap

**Repo wait**:
A pause before intake while an earlier run on the same repo is still going, so two runs on one repo don't slow each other down. The run tells its spec issue once which run it waits for, goes on by itself once that run ends or stops, and is stuck after 24 hours. A run started with `luca-run --alongside` never waits.
_Avoid_: queue, lock

**Run budget**:
The token cap for one run. A run that uses it all is stuck until a person says whether to keep going. A `retry` adds more tokens (half a budget, or the amount named, such as `retry +3M`), not a whole new budget.
_Avoid_: quota, token limit

**Config reload**:
What a resumed run does with the repo's `.luca/config.json`: it takes the new build fields (the prepare command, its time limit, and how many may run at once) and keeps everything else, such as the checks, as the run started with it. A config it can't use leaves the run's own in place.
_Avoid_: hot reload, config refresh

**Agent message**:
A one-way heads-up one agent sends another during a run, handed over by the engine at the receiver's next tool call.
_Avoid_: chat, ping, prompt

**Run note**:
A short fact about the repo that an agent learned during a run, handed to later agents in the same run.
_Avoid_: scratchpad, shared context

**Memory**:
A lesson that outlives a run, such as a pattern or a pitfall, kept for future runs to find.
_Avoid_: engram, note, learning

**Recall point**:
A fixed moment in a run when the engine searches memory and hands the results to an agent.
_Avoid_: pre-flight, lookup

**Shadow mode**:
A trial setup for the decision model: the engine asks it every time and records its answer in the journal, but acts on a fixed choice until the journal shows the answers are right. The model pick for a role with a model floor below Opus is the one exception: it takes effect when the decision model is sure enough. With no credentials, or credentials Cloudflare turns down, the decision model is off for the run and nothing is asked.
_Avoid_: dry run, trial mode

**Decision model**:
The model the engine asks which choice it would make: which ticket next, which model, which skills, what kind of failure, how severe a finding is. Its model pick for a role with a floor below Opus takes effect when it clears the confidence bar; every other job stays in shadow mode. Today it is Cloudflare's Clef; before, it was TypeSafe's Jev, so the journal's records for it are still named `jev_asked`, `jev_answered`, and `jev_failed`. Its credentials live in Luca's own env file, `~/.config/luca/.env`, never in a repo's `.env`.
_Avoid_: labeling model, Jev (except for the record names)

**Model floor**:
The cheapest model a role may run on, set per role in a repo's config: the decision model picks that model or a stronger one. Only the test-writer, the implementer and the learner have one; a role left out runs Opus, and reviewers have none, since every reviewer and lens always runs Opus.
_Avoid_: minimum model, model tier

**Confidence bar**:
How sure the decision model must be before the engine uses its model pick, 0.8 unless the config says otherwise. Below it, or with no confidence given, the agent runs Opus.
_Avoid_: threshold, cutoff

**Effort**:
How hard an agent thinks before it acts: low, medium, high, xhigh or max. Each role has one; reviewers always run at xhigh.
_Avoid_: thinking budget, reasoning level

### Seeing the work

**Journal**:
The record of everything that happened in a run, step by step. It only ever grows, and it is the one source of truth for where a run stands.
_Avoid_: ledger, telemetry, log

**Checkpoint**:
A step whose finish is written in the journal: its records, then its end. A restarted run picks up each ticket from its last checkpoint and redoes any step that was only half done, without repeating what that step already did outside the engine (a comment, a commit, the PR). A step cut off by three crashes in a row is not redone: its ticket is stuck.
_Avoid_: savepoint, snapshot

**Board**:
The live view of a run: its tickets, its agents, and what each one is doing.
_Avoid_: dashboard, statusline

**Live file**:
A small file the engine keeps in the run folder with what each agent in a turn is doing now, for the board to show between journal records. Each write replaces it whole; it is never part of the journal and never replayed.
_Avoid_: status file, live journal
