---
"@alecsibilia/luca": patch
---

Fix the orchestrator-owns-memory-I/O boundary so the learner (and every subagent) stops silently failing to persist.

Subagents have no MuninnDB/MCP access, yet several subagent bodies still instructed them to call `mcp__muninn__*` and run `luca retro postmortem`. Those calls silently no-op'd: the learner produced excellent structured learnings but never reached MuninnDB, and `learn.md` was never written because the body deferred persistence to a tool the subagent can't reach.

The fix establishes a single rule — **memory I/O belongs to the orchestrator** — and rewires the artifacts accordingly:

- `shared-prefix.ts`: replaced the "Pre-Invoke Memory Recall" section with "Memory I/O Is the Orchestrator's Job" — subagents never call `mcp__muninn__*`; prior context is supplied in the prompt, and insights are RETURNED for the orchestrator to persist. Also added a Core Operating Rule forbidding state-mutating `luca` commands from subagents.
- `learner.ts`: drops the MuninnDB/postmortem invocations; now (1) writes `learn.md` via the Write tool and (2) returns a machine-parseable `TO_PERSIST` block annotated with each entry's target vault.
- `shadow-scanner.ts`: the orchestrator now supplies the kept-list (`shadow-debt:kept`) and pending backlog; the scanner returns a `metric` block for the orchestrator to persist.
- `discussion.ts`, `executor.ts`: historical context is now orchestrator-supplied rather than self-recalled.
- `lu` (skill + command), `phase-execute`, `repo-cleanup` (skill + command): the orchestrator now persists the learner's `TO_PERSIST` learnings via `muninn_remember_batch` (routed per entry vault) and the shadow-scanner's scan metric, and recalls + supplies the kept-list before spawning the scanner.

Also fixes a stale-rename collision: `commands/phase-plan.ts` referenced the dropped legacy planner as `architect` (self-contradicting the live architect mode-agent); restored to `lu-planner`.
