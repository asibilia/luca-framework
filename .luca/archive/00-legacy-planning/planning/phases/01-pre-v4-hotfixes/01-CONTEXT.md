# Phase 1 Context — Pre-v4 Hotfixes

## Decisions

### #97 — MuninnDB Orphan Ratio Fix

1. **Link strategy** [from-todo]: After each `muninn_remember` call in lu-learner, recall related existing memories for the concept just stored, link top 2-3 semantic matches using `muninn_link`
2. **Relation types** [from-todo]: Use `learned_from` to connect to producing phase/session, `relates_to` for same-domain patterns/decisions/pitfalls
3. **Linking gate in workflow-save** [from-todo]: Hard gate — "Do NOT proceed to Step 6 until links are created." Minimum link count = number of memories stored. Include concrete `muninn_link` tool call examples.

### #98 — Compaction-Resilient Orchestrators

1. **Wave journal format** [from-todo]: Append-only JSONL at `.planning/phases/NN/.wave-progress.jsonl`. One line per wave/review/harness event.
2. **Review persistence** [from-todo]: Write `.planning/phases/NN/REVIEW.md` with aggregated reviewer findings after code review step.
3. **Context budget check** [from-todo]: Check transcript size between waves. If HIGH/CRITICAL: write journal, write `.continue-here.md`, tell user to start fresh session. Converts compaction crash to graceful handoff.

## Scope Guardrail

Both todos are prompt-level modifications only. No TypeScript source changes. Files:

- `src/agents/general/lu-learner.agent.ts` (add `link_memories` step)
- `src/skills/general/workflow-save.skill.ts` (harden Step 5 linking gate)
- `src/skills/general/phase-execute.skill.ts` (add journal/review/budget instructions)

## Build Note

These are `src/` files that compile to `.claude/` and `.cursor/`. After implementation, `bun run build:all` must be run by the developer outside Claude Code (crashes session per MEMORY.md).
