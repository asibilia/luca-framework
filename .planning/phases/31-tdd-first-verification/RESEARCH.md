# Phase 31 Research: TDD-First Verification Pattern

## 1. Current Architecture

### Agent Definition Pattern

- Agents use `AgentConfig` with frontmatter + sections, extending `BaseAgentImpl`
- Registered in `src/agents/index.ts` as factory functions
- 26 agents total across `luca/` and `general/` subdirectories

### lu-executor (Current)

- **File**: `src/agents/luca/lu-executor.agent.ts`
- Already has TDD stub: checks `task.tdd="true"` attribute but no implementation
- Flow: load_plan → determine_execution_pattern → execute_tasks → commit
- Spawned by phase-execute skill via Task()

### lu-verifier (Current)

- **File**: `src/agents/general/lu-verifier.agent.ts`
- Steps 0-10: Load context → verify truths/artifacts/links → requirements coverage → status
- Step 6.5: Incorporate harness results (test/typecheck/lint)
- Goal-backward objective check at Step 9.5
- No explicit T1/T3 signal naming — uses artifact verification as primary, goal-backward as secondary

### Harness System

- **Runner**: `src/harness/runner.ts` — executes checks, returns `HarnessResult`
- **Parsers**: `src/harness/parsers/` (bun-test.ts, tsc.ts, eslint.ts, generic.ts)
- **Types**: `HarnessResult { status, checks[], totalErrors, totalWarnings, duration }`
- Already integrated with phase-execute (Step 6.5)

### PLAN.md Format

- YAML frontmatter: id, title, phase, wave, depends_on, must_haves (truths/artifacts/key_links)
- Verification criteria as checklist items per task
- Already supports `tdd: true` flag in frontmatter (documented but not implemented)

## 2. Integration Points

### Where TDD Logic Fits

1. **lu-test-writer** (NEW agent): Receives plan verification criteria → outputs `.test.ts` file
2. **lu-executor** (MODIFIED): For `task.tdd=true`: generate tests → confirm RED → implement → confirm GREEN
3. **lu-verifier** (MODIFIED): Check harness test results FIRST as primary signal
4. **phase-execute** (MODIFIED): Pass TDD context through to executor, handle red/green phases

### Key Files to Create/Modify

| Action | File                                                            |
| ------ | --------------------------------------------------------------- |
| CREATE | `src/agents/general/lu-test-writer.agent.ts`                    |
| MODIFY | `src/agents/luca/lu-executor.agent.ts`                          |
| MODIFY | `src/agents/general/lu-verifier.agent.ts`                       |
| MODIFY | `src/agents/index.ts` (register lu-test-writer)                 |
| MODIFY | `src/skills/general/phase-execute.skill.ts` (TDD orchestration) |
| CREATE | `__tests__/agents/lu-test-writer.test.ts`                       |
| CREATE | `__tests__/agents/lu-executor-tdd.test.ts`                      |

## 3. Design Decisions

### Test Generation Approach

- lu-test-writer is an LLM agent (not deterministic code gen)
- It reads plan verification criteria and writes test files
- Tests should use `bun:test` (describe/test/expect)
- Tests are written to `__tests__/` directory matching the plan structure

### TDD Cycle in Executor

1. Before implementation: spawn lu-test-writer → get test file → run `bun test {file}` → confirm FAIL
2. Implement task normally
3. After implementation: run `bun test {file}` → confirm PASS
4. If tests still fail: retry implementation (up to harness fix iterations)

### Verifier Signal Priority

- **T1 (Primary)**: Test pass/fail from harness — deterministic, fast
- **T3 (Secondary)**: Goal-backward objective check — semantic, thorough
- If no tests exist: fall back to T3 (goal-backward) as primary

### Non-Testable Fallback (TDD-06)

- Docs, config, research tasks: skip TDD cycle
- Use `testable: false` flag in plan frontmatter or auto-detect by task type
- Fall back to lu-verifier goal-backward analysis

## 4. Risks and Mitigations

| Risk                              | Mitigation                                                     |
| --------------------------------- | -------------------------------------------------------------- |
| LLM-generated tests may be flawed | lu-test-writer includes test methodology guidance              |
| RED phase may not fail correctly  | Executor validates test runs report failures before proceeding |
| Tests may be too tightly coupled  | Agent guidance emphasizes behavior-based testing               |
| Non-testable work gets blocked    | Explicit fallback path with `testable: false`                  |

## 5. Complexity Assessment

- **Files to create**: 2 (agent + tests)
- **Files to modify**: 4 (executor, verifier, registry, phase-execute skill)
- **Scope**: Cross-cutting (agent + skill + harness)
- **Risk**: MEDIUM (modifying core execution flow)
- **Complexity**: COMPLEX (confirmed)
