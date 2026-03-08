# Plan 11-05: MODEL_ROUTING_TABLE Preset Consolidation

## Frontmatter

- **ID**: 11-05
- **Title**: MODEL_ROUTING_TABLE Preset Consolidation
- **Phase**: 11 (Hooks)
- **Wave**: 1 (parallel with 04)
- **Depends on**: None
- **Delivers**: Roadmap item "Extract MODEL_ROUTING_TABLE to named presets" (DRY extraction only)

## Objective

Consolidate the 343-line `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts` from 37 individual agent entries to ~7 named presets (~120 lines). This plan handles the DRY extraction only — the dual-source frontmatter cleanup is in Plan 07.

## Context

- `src/complexity/__helpers/model-routing.ts` -- The 343-line MODEL_ROUTING_TABLE with 37 agent entries. Analysis shows 7 unique row patterns across all agents.
- `src/rules/general/complexity-gating.rule.ts` -- Source rule file for the complexity-gating documentation.

### Seven Unique Routing Patterns

Analysis of the 37 entries in MODEL_ROUTING_TABLE reveals exactly 7 distinct row patterns:

| Preset Name      | Pattern (T/S/M/Co/Cr)                     | Agent Count | Examples                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALWAYS_FAST`    | fast/fast/fast/fast/fast                  | 1           | lu-cognition                                                                                                                                                                                                                                                                                                                                               |
| `FAST_PROMOTED`  | fast/fast/fast/fast/balanced              | 3           | lu-learner, lu-router-fast, lu-verifier-fast                                                                                                                                                                                                                                                                                                               |
| `ROUTER`         | fast/fast/balanced/balanced/balanced      | 1           | lu-router                                                                                                                                                                                                                                                                                                                                                  |
| `ORCHESTRATOR`   | fast/balanced/balanced/capable/capable    | 19          | lu-executor, lu-planner, lu-pm-planner, lu-plan-checker, lu-test-writer, lu-pr-reviewer, lu-discuss-researcher, lu-research-synthesizer, lu-codebase-mapper, lu-phase-researcher, lu-project-researcher, lu-repo-architect, lu-roadmapper, lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-qa, lu-roadmap-synthesizer, product, qa-plan-generator |
| `DEEP_ANALYSIS`  | fast/balanced/capable/capable/capable     | 10          | lu-verifier, lu-integration-checker, code-architect, dx-advocate, code-simplifier, security-auditor, performance-auditor, code-developer, ui, ux                                                                                                                                                                                                           |
| `DEBUGGER`       | balanced/balanced/capable/capable/capable | 1           | lu-debugger                                                                                                                                                                                                                                                                                                                                                |
| `ALWAYS_CAPABLE` | capable/capable/capable/capable/capable   | 1           | lu-executor-capable                                                                                                                                                                                                                                                                                                                                        |

## Tasks

### 1. Define named routing presets

**Type:** auto
**TDD:** false
**Depends on:** None

Add 7 named preset constants to `src/complexity/__helpers/model-routing.ts`, each defining a `ModelRoutingRow`:

```typescript
const ALWAYS_FAST: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "fast",
  COMPLEX: "fast",
  CRITICAL: "fast",
};
const FAST_PROMOTED: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "fast",
  COMPLEX: "fast",
  CRITICAL: "balanced",
};
const ROUTER: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "balanced",
  COMPLEX: "balanced",
  CRITICAL: "balanced",
};
const ORCHESTRATOR: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "balanced",
  MODERATE: "balanced",
  COMPLEX: "capable",
  CRITICAL: "capable",
};
const DEEP_ANALYSIS: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "balanced",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};
const DEBUGGER_PRESET: ModelRoutingRow = {
  TRIVIAL: "balanced",
  SIMPLE: "balanced",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};
const ALWAYS_CAPABLE: ModelRoutingRow = {
  TRIVIAL: "capable",
  SIMPLE: "capable",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};
```

Also export a `ROUTING_PRESETS` record so presets can be referenced in documentation and observability.

**Files to edit:**

- `src/complexity/__helpers/model-routing.ts`

**Verification:**

- 7 preset constants defined with correct tier mappings
- `bunx --bun tsc --noEmit` passes

### 2. Refactor MODEL_ROUTING_TABLE to use presets

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the 37 individual agent entries (each 5 lines + key) in `MODEL_ROUTING_TABLE` with single-line references to presets:

```typescript
export const MODEL_ROUTING_TABLE: ModelRoutingTable = {
  // Classifiers (always fast)
  "lu-cognition": ALWAYS_FAST,

  // Fast with CRITICAL promotion
  "lu-learner": FAST_PROMOTED,
  "lu-router-fast": FAST_PROMOTED,
  "lu-verifier-fast": FAST_PROMOTED,

  // Router (balanced at MODERATE+)
  "lu-router": ROUTER,

  // Orchestrators (fast -> balanced -> capable ramp)
  "lu-executor": ORCHESTRATOR,
  "lu-planner": ORCHESTRATOR,
  // ... 17 more orchestrators

  // Deep analysis (capable at MODERATE+)
  "lu-verifier": DEEP_ANALYSIS,
  // ... 9 more deep analysis agents

  // Debugger (balanced floor)
  "lu-debugger": DEBUGGER_PRESET,

  // Always capable
  "lu-executor-capable": ALWAYS_CAPABLE,
};
```

Target: reduce MODEL_ROUTING_TABLE from ~260 lines to ~50 lines (37 single-line entries + comments).

**Files to edit:**

- `src/complexity/__helpers/model-routing.ts`

**Verification:**

- All 37 agents still present in the table
- Each agent maps to the correct preset (verify by comparing old and new output of `resolveModelForAgent` for all agents at all 5 complexity levels)
- Total file reduced from ~393 lines to ~200 lines
- `bunx --bun tsc --noEmit` passes

### 3. Update complexity-gating rule documentation

**Type:** auto
**TDD:** false
**Depends on:** 2

Update `src/rules/general/complexity-gating.rule.ts` to:

- Reference the 7 named presets instead of the per-agent table
- Update the model routing table summary to show preset groupings
- Note that frontmatter override removal is coming in Plan 07

**Files to edit:**

- `src/rules/general/complexity-gating.rule.ts`

**Verification:**

- Rule content references preset names (ALWAYS_FAST, ORCHESTRATOR, DEEP_ANALYSIS, etc.)
- `bunx --bun tsc --noEmit` passes

## Verification

1. `MODEL_ROUTING_TABLE` uses named presets, file is under ~200 lines (down from ~393)
2. All 37 agents resolve to the same models as before (behavioral equivalence)
3. `bunx --bun tsc --noEmit` passes
4. Complexity-gating rule documentation reflects new preset-based structure

## Success Criteria

- MODEL_ROUTING_TABLE reduced from ~260 lines to ~50 lines via 7 named presets
- Zero behavioral change in model selection for any agent at any complexity level
- Documentation updated to reflect preset-based structure

## Output Specification

- `src/complexity/__helpers/model-routing.ts` (refactored: presets + compact table)
- `src/rules/general/complexity-gating.rule.ts` (updated documentation)
