# Research Capture — Scope

**Subagent**: researcher
**Perspective**: scope
**Timestamp**: 2026-05-15T17:10:00Z

## Findings

**KEY PREMISE CORRECTIONS:**
- Todo 3 outcome enum: already 6 values not 3 (`completed`, `completed_no_usage`, `completed_partial_parse`, `crashed`, `killed`, `timeout`) at workflow-state.ts:347-357. shared-prefix.ts:28 already lists all 6.
- Real Todo 3 gap: `luca-telemetry-report/SKILL.md:122` flags `{crashed, killed}` only — missing `timeout`.
- Todo 4 model IDs: subagent .ts files have NO `model:` field. Model is pinned at MODE level via `model-routing.ts:15-19`. Stale ID found at execute.md:161 (`claude-opus-4-5` vs canonical `anthropic/claude-opus-4-7`).
- Todo 2 hang-timeout: `HarnessSubagent` has no `timeoutMs` — only `maxSteps`. Prose-level fast-fail needed in research.md.

**Files touched:**
| Todo | File | Change |
|------|------|--------|
| 1 | src/subagents/shared-prefix.ts | Insert pre-invoke recall section between MEMORY_TIER_DISCIPLINE and Luca Reminders |
| 1 | src/__tests__/memory-tier-prefix.test.ts | Add recall presence + size budget assertion |
| 2 | src/instructions/research.md | Prose timeout directive — `outcome:'timeout'` if subagent slow |
| 3 | skills/luca-telemetry-report/SKILL.md:122 | Add `timeout` to flagged outcomes |
| 4 | src/instructions/execute.md:161 | Fix `claude-opus-4-5` → `anthropic/claude-opus-4-7` |
| 4 | src/integration/model-routing.ts:15-19 | Audit + pin canonical aliases |

**Tests with blast radius:**
- workflow-state-actions.test.ts (outcome enum already covered)
- subagent-telemetry-prose.test.ts (research.md timeout prose)
- memory-tier-prefix.test.ts (shared-prefix recall + size guard)
- aggregator-skill-presence.test.ts (SKILL.md changes)

**Fan-in:**
- shared-prefix.ts → all 9 subagents via launch.ts:222
- workflow-state.ts record-subagent → all 5 mode files
- model-routing.ts → all 10 mode files
