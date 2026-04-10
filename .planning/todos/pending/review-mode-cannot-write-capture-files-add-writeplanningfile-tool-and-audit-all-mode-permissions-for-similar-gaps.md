---
title: "Review mode cannot write capture files — add writePlanningFile tool and audit all mode permissions for similar gaps"
area: admin
created: 2026-04-10
priority: high
source: triage
---

## Task

Review mode cannot write capture files — add writePlanningFile tool and audit all mode permissions for similar gaps

## Problem

The `luca:5-review` mode instructions tell the agent to write capture files (`.planning/review-capture-{perspective}-{wave}.md`) and use `sessionLedger` for skip logging, but the mode has **no filesystem write capability and no session_ledger permission**. This causes `ToolNotFoundError` at runtime, then the agent spirals trying workarounds (spawning executor subagents to write files, which also fail), getting stuck in review indefinitely.

### Root Cause

Mode instructions were written assuming ambient Claude Code tool access (`write_file`, `execute_command`), but Mastra harness agents only get tools explicitly granted in `MODE_PERMISSIONS`. The review mode's permission set is:
- `workflowState` (read/save-review-results/switch-mode)
- `runChecks` (*)
- `verificationResult` (read/read-history/aggregate)
- `repoCleanup` (scan/parse-report/summary)

No file write. No session ledger. No shell.

### Proposed Fix

1. **Add a `writePlanningFile` tool** — accepts `filename` (validated to `.planning/` prefix) + `content`. Safe, scoped, reusable across modes.
2. **Add to `luca:5-review` permissions** — so review can persist capture files and the REVIEW-{wave}.md report.
3. **Add `session_ledger: ['append']` to review mode** — instructions reference it for MuninnDB skip logging.
4. **Update `review.md` Step 4.5** — replace shell heredoc pattern with `writePlanningFile()` tool calls.

### Broader Audit Scope

This is likely not the only mode with instruction/permission mismatches. **Audit ALL custom modes** for:

#### Permission Gaps (instructions reference tools the mode doesn't have)
- For each mode, diff the tools referenced in `src/instructions/{mode}.md` against the mode's entry in `MODE_PERMISSIONS`
- Check subagent spawning: do instructions tell the mode to spawn subagents that need tools the mode can't provide?
- Check file I/O: do instructions assume `write_file`/`execute_command` that aren't available?

#### Instruction Staleness
- Are instructions referencing tool actions that don't exist (renamed, removed)?
- Do instructions reference workflow state fields that have changed shape?
- Are step numbers / cross-references consistent?

#### Tool Action Gaps
- Do any modes have tools but are missing actions they need? (e.g., `verificationResult` without `write` in review — was this intentional or an oversight?)
- Are there tools in `TOOL_REGISTRY` that no mode uses?

#### Subagent Capability Mismatches
- Do subagent `allowedWorkspaceTools` lists match what their instructions tell them to do?
- The `reviewer` subagent has read-only tools (correct), but the review mode tries to use executor subagents to write files (incorrect delegation)

### Modes to Audit
1. `luca:1-triage` — check: can it read todos? (related: separate todo permissions ticket)
2. `luca:2-research` — check: does it need more than `workflow_state` + `manage_todos`?
3. `luca:3-architect` — check: can it write PLAN.md and ROADMAP.md?
4. `luca:4-execute` — check: does it have all tools its instructions reference?
5. `luca:5-review` — **known broken** (this ticket's primary fix)
6. `luca:6-finalize` — check: can it write SESSION-FINAL.md, cleanup artifacts?
7. `luca:discuss` — check: permissions match discussion flow
8. `build` / `fast` / `plan` — check: non-pipeline modes consistent

### Deliverables
- [ ] `writePlanningFile` tool implementation
- [ ] Updated `MODE_PERMISSIONS` for all modes with identified gaps
- [ ] Updated instruction files where tool references are wrong
- [ ] Audit report documenting every mismatch found and resolution
- [ ] Subagent capability audit (allowedWorkspaceTools vs instructions)
