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

### Running the work

**Run**:
One trip of the engine through a spec's tickets, ending in a pull request.
_Avoid_: build, pipeline, session

**Run branch**:
The branch a run's finished tickets join one at a time, and that its one pull request is opened from.
_Avoid_: integration branch, feature branch

**Intake**:
The check, before a run starts, that a spec and all its open tickets are ready to build. If anything fails, the run does not start.
_Avoid_: preflight, validation

**Engine**:
The plain code that drives a run and picks every next step.
_Avoid_: orchestrator

**Agent**:
One model session doing one role on one ticket.
_Avoid_: subagent, worker

**Role**:
The job an agent does in a run, such as test-writer, implementer, or reviewer.
_Avoid_: mode, persona

**Gate**:
A check the engine runs itself, such as the tests or the type checker, that must pass before the run moves on.
_Avoid_: hook, checks

**Red check**:
The gate that proves a ticket's new tests fail, and every old test still passes, before any code is written.
_Avoid_: fail-first check

**Fix loop**:
The capped rounds in which an agent fixes what a gate or a reviewer reported. Reaching the cap makes the run stuck.
_Avoid_: retry loop

**Leftover scan**:
The gate that stops files an agent left behind, such as scratch scripts or stray notes, from being committed.
_Avoid_: shadow scan, cleanliness check

**Ticket review**:
A fresh reviewer's check that one ticket's committed diff really meets its acceptance criteria, with honest tests.
_Avoid_: code review, self-review

**Final review**:
The review of a whole run's branch through several lenses, before the pull request opens.
_Avoid_: whole-branch review, audit

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

**Skipped ticket**:
A ticket you chose to leave out of a run after it got stuck. It stays open for a later run, along with the tickets that wait on it.
_Avoid_: dropped, abandoned

**Limit wait**:
A pause while the plan's usage limit resets. The run carries on by itself afterwards, so it isn't stuck.
_Avoid_: stuck, throttled

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
A trial setup for a labeling model: the engine asks it every time and records its answer in the journal, but acts on a fixed choice until the journal shows the labels are right.
_Avoid_: dry run, trial mode

### Seeing the work

**Journal**:
The record of everything that happened in a run, step by step. It only ever grows, and it is the one source of truth for where a run stands.
_Avoid_: ledger, telemetry, log

**Checkpoint**:
A step whose finish is written in the journal. A restarted run picks up each ticket from its last checkpoint and redoes any step that was only half done.
_Avoid_: savepoint, snapshot

**Board**:
The live view of a run: its tickets, its agents, and what each one is doing.
_Avoid_: dashboard, statusline
