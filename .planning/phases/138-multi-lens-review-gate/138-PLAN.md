# Phase 138: Multi-Lens Review Gate

## Goal

Add pre-mortem-aware review criteria, 2 additional focused review lenses (Architecture + Data), a gate condition on pre-mortem signal rate, and risk multiplier for complexity classification.

## Context

Phase-execute already spawns 5 reviewers in parallel with verdict split detection at COMPLEX+. Todo #107 specifies a conditional expansion: only activate multi-lens review if pre-mortem signal rate >10% over 20 runs. Since #100 (pre-mortem) and #101 (process data) shipped in v4.0.0, the gate condition code can be implemented but won't activate until sufficient data accumulates.

**Depends on:** Phase 137 (tribunal consensus model)

## Tasks

### Task 1: Add multi-lens review schemas

**File:** `src/skills/__schemas/` or `src/shared/__schemas/`

Create `multi-lens-review.schemas.ts`:

- `ReviewLensSchema`: `name`, `focus_areas` (string[]), `model_routing_preset`, `prompt_template`
- `MultiLensGateSchema`: `enabled`, `gate_metric` (string), `gate_threshold` (number), `min_samples` (number, default 20)
- `RiskMultiplierSchema`: `domain_patterns` (Record<string, number>), `base_weight` (number)

### Task 2: Add gate condition checker

**File:** `src/skills/__helpers/multi-lens-gate.ts`

Create `checkMultiLensGate(): { gate_met: boolean, signal_rate: number, sample_count: number }` that:

1. Queries MuninnDB for `metric:signal-rate-aggregate` engrams
2. Checks if signal rate >10% over 20+ runs
3. Returns gate status with metadata

### Task 3: Define Architecture and Data review lenses

**File:** `src/skills/__helpers/multi-lens-gate.ts`

Define 2 lens configurations:

- **Architecture lens**: structural integrity, dependency direction, module boundaries, tier compliance
- **Data lens**: data flow, state management, schema consistency, validation patterns

### Task 4: Add risk multiplier helper

**File:** `src/skills/__helpers/multi-lens-gate.ts`

Create `computeRiskMultiplier(changedFiles: string[]): number` that:

1. Matches files against high-risk domain patterns (state machine, shared schemas, context assembly, harness)
2. Returns a multiplier (1.0 = normal, up to 2.0 for high-risk)
3. Used by lu-router to adjust complexity classification

### Task 5: Wire gate check into phase-execute review section

**File:** `src/skills/general/phase-execute.skill.ts`

In the code review step (Step 8):

1. Call `checkMultiLensGate()` before spawning reviewers
2. If gate met: spawn 2 additional lens reviewers alongside existing 5
3. Pass pre-mortem mitigations (from phase discussion) as additional review criteria to all reviewers

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Gate checker returns correct status when metric data is missing (graceful degradation)
- [ ] Lens configurations define proper focus areas
- [ ] Risk multiplier correctly identifies high-risk domains
