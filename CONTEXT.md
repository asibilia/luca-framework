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

**Blocked**:
A ticket that waits on another ticket that isn't done yet.
_Avoid_: stuck, waiting

### Running the work

**Run**:
One trip of the engine through a spec's tickets, ending in a pull request.
_Avoid_: build, pipeline, session

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

**Guard**:
The rules that block an agent's action when its role doesn't allow it.
_Avoid_: stage-gate, permission

**Stuck**:
The state of a run when the engine can't safely pick the next step by itself.
_Avoid_: blocked, halted

**Escalation**:
A stuck run asking a person, or a stronger model, for help.
_Avoid_: halt

### Seeing the work

**Journal**:
The record of everything that happened in a run, step by step.
_Avoid_: ledger, telemetry, log

**Board**:
The live view of a run: its tickets, its agents, and what each one is doing.
_Avoid_: dashboard, statusline
