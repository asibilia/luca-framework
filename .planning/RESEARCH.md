# Research: Prompt Engineering Hardening & Context Window Architecture Milestone

## Summary

This milestone touches 18 todos across `packages/luca-mastracode` — a self-contained CLI binary with zero cross-package dependencies. The changes span 10 instruction `.md` files (hot-reloadable, no compilation), 9 subagent `.ts` files (inline instructions, require recompilation), 1 core orchestration file (`index.ts`, 969 lines), 10 tool definitions, and ~5 new TypeScript files. The instruction assembly is a simple string concatenation pipeline (`md_file + state_block + constraints`) with a lazy-cached constraint singleton. There are ZERO automated tests, no drift detection, and no existing token management infrastructure. The highest risks are behavioral regression from constraint relocation and the lazy cache footgun for mid-conversation injection.

## Scope

### Files Affected

**Instruction Files (10 — prompt engineering targets, hot-reloadable):**

| File | Lines | Notes |
|------|-------|-------|
| `src/instructions/build.md` | 63 | Simple; no state injection |
| `src/instructions/plan.md` | 45 | Simple; no state injection |
| `src/instructions/fast.md` | 31 | Minimal; no state injection |
| `src/instructions/discuss.md` | 42 | Simple; no state injection |
| `src/instructions/triage.md` | ~155 | Complex; has CRITICAL CONSTRAINT block |
| `src/instructions/research.md` | ~280 | Complex; has quality thresholds |
| `src/instructions/architect.md` | ~320 | Complex; WSJF, discussion, plan review |
| `src/instructions/execute.md` | ~405 | Largest; full execution loop |
| `src/instructions/review.md` | ~275 | Complex; parallel review |
| `src/instructions/finalize.md` | ~315 | Complex; milestone, shadow scan |

Loading mechanism: Each mode's `buildInstructions()` calls `readFileSync(join(__dirname, '..', 'instructions', '<name>.md'), 'utf-8')` — changes to `.md` files take effect immediately without recompilation.

**Subagent Files (9 — shared prefix + anti-sycophancy targets, require recompilation):**

| File | Lines | Has MCP tools |
|------|-------|---------------|
| `src/subagents/researcher.ts` | 31 | No |
| `src/subagents/planner.ts` | 51 | No |
| `src/subagents/plan-reviewer.ts` | 74 | No |
| `src/subagents/executor.ts` | 40 | No |
| `src/subagents/verifier.ts` | 76 | No |
| `src/subagents/reviewer.ts` | 95 | No |
| `src/subagents/learner.ts` | 96 | Yes (MuninnDB) |
| `src/subagents/discussion.ts` | 101 | Yes (MuninnDB) |
| `src/subagents/shadow-scanner.ts` | ~275 | Yes (MuninnDB) |

Critical: Subagent instructions are inline string literals — no shared prefix mechanism exists today.

**Core Assembly (`src/index.ts` — 969 lines, highest-risk single file):**
- `HARD_CONSTRAINTS` constant: lines 157-163 (3 bullets)
- `getAgentConstraints()`: lines 228-236 (lazy singleton, cached after first call)
- `createStaticAgent()`: lines 238-277 (instruction + tool assembly)
- `buildContinuationMessage()`: lines 353-457 (mid-conversation injection point)
- MCP injection: lines 664-675 (3 subagents get MCP tools mutated in)
- Subagent registration: lines 614-624
- Harness events: lines 765-914 (5 subscribers)

**Tool Files (10 — behavioral guidance enrichment targets):**
- `src/tools/workflow-state.ts` (570 lines, most complex)
- `src/tools/manage-todos.ts`, `manage-roadmap.ts`, `classify-complexity.ts`
- `src/tools/run-checks.ts` (12KB), `pipeline-lock.ts`, `session-ledger.ts`
- `src/tools/verification-result.ts`, `repo-cleanup.ts`, `write-planning-file.ts`

**New Files (context-window architecture):**

| Proposed File | Purpose |
|---------------|---------|
| `src/subagents/shared-prefix.ts` | Shared ~300-400 token prefix for all subagents |
| `src/token-budget.ts` | Token budget monitoring with threshold interventions |
| `src/context-refresher.ts` | Mid-conversation injection / luca-reminder system |
| `src/context-pipeline.ts` | Progressive 3-level context compaction |

### Blast Radius

- `src/index.ts` — fan-in: 0 (entrypoint), changes affect entire runtime
- `src/luca-store.ts` — fan-in: 10+ (highest of any utility module)
- `src/refs.ts` — fan-in: 3 (new refs needed for token budget)
- `src/tools/mode-permissions.ts` — fan-in: 2 (new tool registrations)
- Instruction `.md` files — fan-in: 1 each (loaded by one mode each)
- Subagent `.ts` files — fan-in: 1 each (imported only by index.ts)
- Exception: `shadow-scanner.ts` has fan-in 2 (also imported by `repo-cleanup.ts`)

### Cross-Package Dependencies
None. `luca-mastracode` is a standalone CLI binary. No other packages in the monorepo import from it.

## Architecture

### Instruction Assembly Pipeline

```
Mode .md file (readFileSync at request time)
  + Dynamic state block (readLucaState() -> luca-state.json)
  + getAgentConstraints() [lazy singleton]:
      "\n\n---\n"
      + HARD_CONSTRAINTS (3 bullets, lines 157-163)
      + loadAlwaysApplyRules() (.mastracode/rules/*.md with alwaysApply: true)
= Final instructions string
```

Key architectural facts:
1. `instructions` callback in `createStaticAgent()` is called per-request — state changes always reflected
2. `getAgentConstraints()` is a lazy singleton — computed once, never invalidated
3. Instruction `.md` files are hot-reloadable (no compilation)
4. Subagent instructions are inline template literals (require TypeScript recompilation)
5. `HARD_CONSTRAINTS` only applied to mode agents, NOT subagents

### Mid-Conversation Injection Points

Two mechanisms already exist:
1. `harness.sendMessage({ content })` — injects a new user turn (used for auto-continuation)
2. `harness.followUp({ content })` — appends to current turn (used by pipeline guard)
3. `wrapInSystemReminder()` — wraps content in `<system-reminder>` tags

### MCP Integration

- MCP tools merged at request time for mode agents: `{ ...tools, ...mcpManagerRef.current?.getTools() }`
- MCP tools mutated into 3 subagents at startup: discussion, learner, shadow-scanner
- No mode-based MCP filtering exists — all MCP tools injected into all modes uniformly
- Conditional MCP loading would save ~15K tokens when MuninnDB not needed

### Harness Event System

5 event subscribers on `harness.subscribe`:
1. Read-only mode enforcement (`mode_changed`)
2. Permission rules (`mode_changed`)
3. Pipeline guard redirect (`mode_changed`)
4. Auto-continuation message injection (`mode_changed`)
5. Pipeline enforcement watchdog (`tool_start`, `tool_end`, `agent_end`)

## Patterns

### Instruction File Structure
All 10 `.md` files follow canonical structure: H1 title → Blockquote subtitle → `## Role` → `---` separators → `## Pipeline Orchestration` always last

### Mode Module Pattern
Exports: `build<Name>Instructions()`, `resolve<Name>Model()`, `<name>Mode`

### Subagent Definition Pattern
Plain `HarnessSubagent` object literals with inline template literal instructions

### TypeScript Conventions
Named exports only, `.js` extensions, `SCREAMING_SNAKE_CASE` constants, mutable refs pattern

## Risks

### 1. Zero Test Coverage — HIGH
No test files exist. All behavioral validation is manual.

### 2. Behavioral Regression from Constraint Relocation — HIGH
Three collision points: heading duplication, recency displacement, quantified limit conflicts.

### 3. Lazy Cache Footgun — MEDIUM
Mid-conversation injection cannot use instruction assembly path — must use event system.

### 4. Sprint Dependency Order — MEDIUM
Sprint 4 depends on Sprint 2's luca-reminder convention. Sprint 5 depends on Sprint 4.

### 5. Mastra API Uncertainty — MEDIUM
Cache boundary requires array-form system prompts (unknown support). Progressive compaction requires tool result interception (unknown support).

### 6. Token Budget Spike — LOW (net positive)
Net with MuninnDB absent: -10,500 tokens. Net with MuninnDB present: +4,500 tokens.

## Recommendations

### Implementation Order
1. Sprint 1-2: Prompt engineering (all 12 items, zero Mastra API risk)
2. Sprint 3: Shared subagent prefix
3. Sprint 4: Mid-conversation injection
4. Sprint 5: Context window architecture (token budget, conditional MCP, cache boundary)
