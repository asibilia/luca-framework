# Integration Assessment

How the skill-to-agent migration interacts with each Luca subsystem. Identifies required changes, dependency ordering, and gaps not covered in `architecture.md`.

## Subsystem Analysis

### 1. Enforcement Hook Factory — HIGH Risk

**File:** `src/hooks/__helpers/enforcement-hook-factory.ts`

**Current:** Line 173 filters on `toolName !== "Skill"`. Extracts skill name via `toolInput.skill` (exact match). Performs exact set lookup against `subSkills.has(matchedSkill)`.

**Required changes:**

1. Tool name filter: `toolName !== "Skill"` must become `toolName !== "Skill" && toolName !== "Agent"`
2. Name extraction: When `toolName === "Agent"`, extract identity from `tool_input.name` or `tool_input.subagent_type`
3. **Critical design gap:** The `subSkills` set uses exact name matching. Agent names in the architecture use dynamic suffixes (`execute-{NN}`, `verify-{NN}`). Exact set lookup (`subSkills.has(skillName)`) **cannot match dynamic names**. Needs prefix-matching or regex strategy.

**Integration risk:** HIGH — the Agent() `tool_input` schema is validated by hook-agent-compatibility-verification.md, but the naming convention shift from fixed sub-skill names to dynamic Agent names breaks the enforcement lookup pattern.

### 2. Hook Registry — LOW Risk

**File:** `src/hooks/__helpers/hook-registry.ts`

All 5 pre-step hooks plus `pre-step-enforcement` use `tool_filter: "Skill"`. Change to `"Skill|Agent"`. The pipe-separated matcher syntax is already used elsewhere (`"Edit|Write"`), so this is proven.

**Required:** 6 registry entries updated (5 with `"Skill"` + 1 with `"Bash|Skill"`, string change only).

### 3. State Machine Layer — LOW Risk

**Files:** `src/workflow/__helpers/skill-state-machine.ts`, `src/workflow/__helpers/phase-pipeline.ts`, `src/workflow/__helpers/pr-address-dag.ts`

State machines are already decoupled from Skill() semantics. Runtime enforcement happens via `current_state` in context files, not XState actors. The DAG definitions need handler name updates but structure is identical. `createSkillStateMachine()` itself needs no changes.

### 4. Context CLI — MEDIUM Risk

**File:** `src/skills/__schemas/context-cli.ts`

The CLI mechanism needs no code changes, but the **data flow reverses direction**. Currently sub-skills write typed output sections (`PrFetchOutputSchema`, `LuRouteOutputSchema`) to context files. After migration, the orchestrator must parse Agent() text responses and write these fields — going from Zod-validated sub-skill writes to LLM-output-parsed orchestrator writes.

The architecture's `output_contract` (`STATUS: success|failure, RESULT: {...}`) is much less structured than the current Zod schemas.

### 5. Skill Registry — LOW Risk

**File:** `src/skills/__helpers/build-skill-registry.ts`

Mechanical deletion: remove 22 import statements and registry entries. The build pipeline uses the registry to generate `.claude/skills/{name}/SKILL.md` files — removing entries automatically prevents generation.

### 6. Skill Compiler — MEDIUM Risk

**Files:** `src/compilers/__helpers/compile.ts`, `src/adapters/claude/skill-emitter.ts`

The compiler needs no code changes, but compiled output size of orchestrators will grow 3-5x:

| Orchestrator  | Current SKILL.md | Sub-skills absorbed                                                       | Projected size     |
| ------------- | ---------------- | ------------------------------------------------------------------------- | ------------------ |
| lu            | 160 lines        | lu-route (148), lu-configure (174), lu-backlog (214), lu-phase-loop (708) | ~1,200-1,400 lines |
| pr-address    | 310 lines        | 6 sub-skills totaling 1,122 lines                                         | ~1,000-1,200 lines |
| phase-execute | 496 lines        | 3 sub-skills                                                              | ~800-1,000 lines   |

The 800-line quality degradation threshold is a real concern for lu. Prompt templates evaluated at build time help source maintenance but NOT compiled output size.

### 7. Gate Enforcement — LOW Risk

Gate enforcement actually becomes **simpler**. The orchestrator resolves gates and conditionally includes/excludes Agent() calls. No flags need to pass through a delegation layer. The orchestrator simply does not include gate-related steps in the Agent() prompt if the gate is disabled.

### 8. Bridge CLI — LOW Risk

No code changes needed. Usage narrows from "orchestrators + sub-skills" to "orchestrators only." Some sub-skills currently call `luca-bridge transition` — all transitions must be hoisted to the orchestrator.

---

## Dependency Order

```
Phase 0: Empirical validation (MUST be first)
  |-- Validate Agent() tool_input schema for PreToolUse hook stdin
  |-- Confirm sub-agents can read /tmp/ context files
  |-- Confirm sub-agents have MCP tool access (MuninnDB)
  |
Phase 1: Hook infrastructure (blocks all orchestrator migrations)
  |-- Update enforcement-hook-factory.ts: tool name filter + name extraction
  |-- Update hook-registry.ts: tool_filter from "Skill" to "Skill|Agent"
  |-- Resolve dynamic agent name matching strategy (exact vs. prefix)
  |
Phase 2: Per-orchestrator migration (in order from architecture.md)
  |-- For each orchestrator:
  |   |-- Rewrite skill source (replace Skill() with Agent())
  |   |-- Update pre-step-{orchestrator}.ts subSkills + validStates
  |   |-- Update context schema (remove/repurpose sub-skill output sections)
  |   |-- Remove sub-skill registry entries + source files
  |   |-- Rebuild (bun run build:all, manually outside Claude Code)
  |   |-- Run check:drift
  |
Phase 3: Cleanup
  |-- Delete orphaned context schema sub-skill output types
  |-- Update DAG handler references
  |-- Update contract definitions for renamed steps
```

---

## Gaps Not in architecture.md

1. **Dynamic Agent name matching**: Enforcement hook factory uses exact-match (`subSkills.has()`). Agent names with phase suffixes (`execute-230`) break this. Needs prefix/regex matching — a design change not covered.

2. **Context schema output sections**: Architecture says "context files written by orchestrator only" but doesn't address the typed output sections (`PrFetchOutputSchema`, etc.) that sub-skills currently write. Orchestrator must parse Agent() text into these schemas (lossy) or simplify context files.

3. **Contract-hook adapter**: `src/workflow/__helpers/contract-hook-adapter.ts` assumes step names match contract step IDs. If Agent names differ from contract step names, needs a mapping layer.

4. **Gap detector DAG handlers**: `pr-address-dag.ts` and `phase-pipeline.ts` have `handler` fields matching sub-skill names. Must be updated to Agent step names.

5. **Advisory enforcement hook**: `pre-step-enforcement.ts` checks `toolName === "Skill"` on line 99 and heuristics like `command.includes("lu-")`. Needs updating for Agent() semantics.

6. **build:all session interruptions**: Each orchestrator migration requires `bun run build:all` (crashes Claude Code sessions). The architecture notes "user runs manually" but doesn't call out 5 mandatory session interruptions as a workflow friction point.

7. **Compiled lu SKILL.md token budget**: No concrete token count target. 160 lines growing to 1,200+ lines. Quality degradation threshold depends on actual token count (code blocks are token-dense), not line count.

---

## Sources

- `src/hooks/__helpers/enforcement-hook-factory.ts` — Line 173: `toolName !== "Skill"` gate
- `src/hooks/__helpers/hook-registry.ts` — 6 hook entries with `tool_filter: "Skill"`
- `src/skills/__schemas/context-cli.ts` — Context file CLI
- `src/skills/__schemas/lu-context.schemas.ts` — lu context schema with sub-skill output sections
- `src/skills/__helpers/build-skill-registry.ts` — Skill registry (22 sub-skill imports)
- `src/adapters/claude/skill-emitter.ts` — Skill markdown emitter
- `src/workflow/__helpers/contract-hook-adapter.ts` — Contract precondition checker
- `src/workflow/__helpers/gap-detector.ts` — Post-execution gap detector
- `.planning/research/hook-agent-compatibility-verification.md` — Hook compatibility verification
