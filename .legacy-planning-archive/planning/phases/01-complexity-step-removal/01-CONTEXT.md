# Phase 01 Context — Complexity Step Removal

## Phase Goal

Remove all effective step-gating so every workflow step runs meaningfully at every complexity level. Align /lu and /autopilot to share the same mandatory pipeline.

## Key Finding: Skills Already Compliant

A comprehensive audit of all skills and agents found **zero complexity-based step-skipping conditionals** in the codebase. The `complexity-gating.md` rule already states "ALL workflow steps run at every complexity level" and the skill implementations match. This was likely achieved during the v3.0.0 model routing redesign.

## Remaining Issues (What This Phase Actually Fixes)

### 1. Config Complexity Matrix — Zero-Value Parameters

The `.planning/config.json` complexity matrix has parameters set to `0` that effectively eliminate the substance of steps:

```json
"TRIVIAL": {
  "planVerificationIterations": 0,   // Plan verification runs but does nothing
  "verifyFixIterations": 0,          // Verify fix step is hollow
  "recallDepth": 0                   // NO memory recall — contradicts memory-driven optimization
},
"SIMPLE": {
  "planVerificationIterations": 0,   // Same issue
  "recallDepth": 0                   // Same issue
}
```

**Decision:** Set minimum values of 1 for all iteration counts and recall depths. No parameter should be 0. Scaling is fine (1 → 2 → 3), but floor is 1.

### 2. /lu Gate Routing vs Autopilot Mandatory Steps

The `/lu` skill checks config gates for research and discussion:

```
1. Check `research` gate (if required/optional): phase-research
2. Check `discussion` gate (if required/optional/run): phase-discuss
3. Always plan
4. Always execute
```

Autopilot marks ALL steps as "MANDATORY — No Exceptions."

**Decision:** Update /lu to match autopilot — all steps are mandatory. Remove the conditional gate checks for research and discussion. The only way to skip a step is explicit `--skip-*` flags.

### 3. Complexity Matrix Schema Alignment

The complexity schemas in `src/complexity/` may encode the zero-value parameters. Update schema defaults so no parameter can be 0.

**Decision:** Update complexity schemas with minimum value constraints (z.number().min(1) for iteration counts, z.number().min(1) for recall depth).

## Scope Boundaries

- **In scope:** Config matrix fixes, /lu gate alignment, schema constraints, rule update
- **Out of scope:** Model routing table changes (already correct), adding new workflow steps, memory optimization (Phase 03/04)
- **Out of scope:** Changing how `--skip-*` flags work (these remain as explicit user overrides)

## Decisions

| Decision                | Choice                                                                           | Rationale                                                              |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Minimum iteration count | 1 (never 0)                                                                      | Every step should do meaningful work                                   |
| Minimum recall depth    | 1                                                                                | Memory-driven context is the optimization lever, not step omission     |
| /lu step routing        | All mandatory, matching autopilot                                                | Unified pipeline regardless of entry point                             |
| Skip mechanism          | Only explicit `--skip-*` flags                                                   | User control, not automatic gating                                     |
| Config gate behavior    | Gates control WHICH checks run (test, lint, build), not WHICH workflow steps run | config.json `workflow.*` fields should not disable core pipeline steps |
