# Plan: 4-Todo PR — Recall + Hang-Timeout + Outcome Flag + Model CRLF Guard

## Objective

Land 4 backlog todos in one PR: (1) pre-invoke recall directive in subagent shared-prefix, (2) researcher hang-timeout prose directive, (3) outcome-enum aggregator-skill flag expansion, (4) model-field CR/LF guard + stale example fix.

CWD = `packages/luca-mastracode/` for all `src/` and test paths.

## Context

Research surfaced scope shrinks: outcome enum already 6 values; subagents have no per-file model field. Real net-new = recall directive + timeout prose + security patch + 1 stale example. shared-prefix.ts injects to 9 subagents; plan-reviewer + shadow-scanner skip MCP — directive must hedge.

## Phases

### Phase 1: 4-todo-batch

#### Wave 1: Schema + Shared-Prefix (foundation)

- [ ] **Task 1.1.1**: Add CR/LF/tab regex to `model` field in `recordSubagentAction` schema (workflow-state.ts:339) AND flat inputSchema (workflow-state.ts:~656). Pattern: `.regex(/^[^\r\n\t]+$/)`.
  - Files: `src/tools/workflow-state.ts`
  - Verification: invalid `model: "x\ny"` → returned `{success:false}`. Valid `"anthropic/claude-opus-4-7"` accepted.
  - Dependencies: none

- [ ] **Task 1.1.2**: Insert `## Pre-Invoke Memory Recall` section in `SUBAGENT_SHARED_PREFIX` (shared-prefix.ts:~25) between `${MEMORY_TIER_DISCIPLINE}` and `## Luca Reminders`. ≤4 inline bullets. Hedge: "If MuninnDB MCP tools are available". Use canonical executor.ts:34 form.
  - Files: `src/subagents/shared-prefix.ts`
  - Verification: `SUBAGENT_SHARED_PREFIX` contains `'muninn_recall'` and `'If MuninnDB MCP tools are available'`. Section appears after MEMORY_TIER_DISCIPLINE and before Luca Reminders.
  - Dependencies: none

#### Wave 2: Instruction + Skill Prose

- [ ] **Task 1.2.1**: Add hang-timeout prose directive in `research.md` at spawn-batch step. Agent captures `const start = Date.now()`; if subagent returns after 60s OR fails to return, emit `outcome:'timeout'` on complete and proceed with partial results. Use `// →` inline directive form (not fenced).
  - Files: `src/instructions/research.md`
  - Verification: `research.md` contains substring `outcome: \"timeout\"` and `Date.now()` near the parallel batch spawn directive.
  - Dependencies: none

- [ ] **Task 1.2.2**: Update `skills/luca-telemetry-report/SKILL.md:122` Subagent Costs section. Expand flag list from `{crashed, killed}` to also flag `timeout`, `completed_no_usage`, `completed_partial_parse` as non-success terminal outcomes (group as "non-completed").
  - Files: `skills/luca-telemetry-report/SKILL.md`
  - Verification: SKILL.md contains the strings `timeout`, `completed_no_usage`, `completed_partial_parse` in the Subagent Costs section.
  - Dependencies: none

- [ ] **Task 1.2.3**: Fix stale model ID example in `execute.md:161`. Replace `"claude-opus-4-5"` with `"anthropic/claude-opus-4-7"` (canonical capable-tier ID per model-routing.ts).
  - Files: `src/instructions/execute.md`
  - Verification: `execute.md` no longer contains `"claude-opus-4-5"` and contains `"anthropic/claude-opus-4-7"`.
  - Dependencies: none

#### Wave 3: Tests + Changeset

- [ ] **Task 1.3.1**: Add regression test in `workflow-state-actions.test.ts` for `model` CR/LF rejection. Test (a) `model: "valid"` accepted, (b) `model: "x\ny"` rejected. Mirror existing role/correlationId pattern.
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Verification: Both new tests pass. `bun test workflow-state-actions` green.
  - Dependencies: 1.1.1

- [ ] **Task 1.3.2**: Add parametric test in `workflow-state-actions.test.ts` iterating all 6 valid outcome enum values. Guards against accidental enum-value removal.
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Verification: 6 sub-tests pass (one per outcome). `bun test workflow-state-actions` green.
  - Dependencies: none

- [ ] **Task 1.3.3**: Add prefix-size + recall-presence assertions in `memory-tier-prefix.test.ts`: `expect(SUBAGENT_SHARED_PREFIX.length).toBeLessThan(4000)` + `.toContain('muninn_recall')` + `.toContain('Pre-Invoke Memory Recall')`.
  - Files: `src/__tests__/memory-tier-prefix.test.ts`
  - Verification: 3 new assertions pass. `bun test memory-tier-prefix` green.
  - Dependencies: 1.1.2

- [ ] **Task 1.3.4**: Add prose presence test in `subagent-telemetry-prose.test.ts` for research.md timeout directive: assert research.md contains `outcome: "timeout"` and `Date.now()` substrings near spawn site.
  - Files: `src/__tests__/subagent-telemetry-prose.test.ts`
  - Verification: New test passes. `bun test subagent-telemetry-prose` green.
  - Dependencies: 1.2.1

- [ ] **Task 1.3.5**: Add changeset `.changeset/recall-timeout-outcome-flag-model-crlf.md` (`"@alecsibilia/luca-mastracode": patch`). Describe all 4 todo deliverables.
  - Files: `.changeset/recall-timeout-outcome-flag-model-crlf.md`
  - Verification: changeset file exists and references the 4 deliverables.
  - Dependencies: all prior tasks

## Verification Criteria

- All Wave 3 tests pass. Full test suite green (currently ~406 tests).
- `bun run typecheck` clean.
- `bun run lint` no new errors.
- Build clean.
- shared-prefix.ts length < 4000 chars.
- MEMORY_TIER_DISCIPLINE.length still < 1600.

## Risks & Mitigations

- **Prefix bloat exceeds budget**: new size guard at 4000 chars catches it (1.3.3).
- **`outcome:'timeout'` enum value missing**: already in enum since alpha.7 — confirmed by research.
- **Dead-weight directive for plan-reviewer/shadow-scanner**: hedge prose "if MuninnDB tools available" makes it a no-op.
- **Test imports drift**: tests added next to existing test files reuse same import paths.
