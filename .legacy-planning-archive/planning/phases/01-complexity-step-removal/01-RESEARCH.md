# Phase 01: Complexity Step Removal - Research

**Researched:** 2026-03-12
**Domain:** Complexity gating configuration, schema constraints, workflow routing alignment
**Confidence:** HIGH

## Summary

This phase fixes three issues that create a gap between the stated policy ("all steps run at every complexity level") and the actual runtime behavior. Skills themselves have no complexity-based step-skipping conditionals -- that was confirmed by the CONTEXT.md audit. The real problems are:

1. **config.json has zero-value iteration parameters** that effectively hollow out steps at TRIVIAL/SIMPLE levels, contradicting the "always-on" policy.
2. **The /lu skill uses conditional gate checks** for research and discussion, while the autopilot skill treats them as mandatory.
3. **The Zod schema allows zero values** for `planVerificationIterations` and `verifyFixIterations`, and does not include `recallDepth` at all.

**Primary recommendation:** Change `.nonnegative()` to `.positive()` in the schema, update config.json to floor all iterations at 1, add `recallDepth` to the schema with `.min(1).nullable()`, update /lu skill to make research and discussion mandatory, and fix all fallback matrices in session-init scripts.

## Standard Stack

Not applicable -- this phase modifies existing TypeScript source, JSON config, and agent prompt text. No new libraries.

### Core

| Library | Version    | Purpose                                    | Why Standard                                                     |
| ------- | ---------- | ------------------------------------------ | ---------------------------------------------------------------- |
| zod     | (existing) | Schema validation for ComplexityGateSchema | Already in use, provides `.positive()` and `.min(1)` constraints |

## Architecture Patterns

### Files That Need Changes (Exact Locations)

The changes span three categories: schema constraints, config/default values, and /lu routing text.

### Category 1: Schema Constraint (1 file)

**File:** `src/complexity/__schemas/complexity.schemas.ts`

| Line  | Current                                                      | Target                                                       | Reason                                                        |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| 120   | `planVerificationIterations: z.number().int().nonnegative()` | `planVerificationIterations: z.number().int().positive()`    | `.nonnegative()` allows 0; `.positive()` enforces >= 1        |
| 124   | `verifyFixIterations: z.number().int().nonnegative()`        | `verifyFixIterations: z.number().int().positive()`           | Same reason                                                   |
| (new) | (not present)                                                | `recallDepth: z.number().int().min(1).nullable().optional()` | Add recallDepth to schema so config.json values are validated |

Note: `harnessFixIterations` at line 122 already uses `.positive()` -- no change needed.

### Category 2: Config/Default Value Fixes (4 files)

**File 1:** `.planning/config.json` -- the runtime config
| Path | Current | Target |
|------|---------|--------|
| `complexity.matrix.TRIVIAL.planVerificationIterations` | 0 | 1 |
| `complexity.matrix.TRIVIAL.verifyFixIterations` | 0 | 1 |
| `complexity.matrix.TRIVIAL.recallDepth` | 0 | 1 |
| `complexity.matrix.SIMPLE.planVerificationIterations` | 0 | 1 |
| `complexity.matrix.SIMPLE.recallDepth` | 0 | 1 |

**File 2:** `src/complexity/__helpers/defaults.ts` -- the TypeScript defaults
Already correct! `DEFAULT_COMPLEXITY_MATRIX` has all iterations >= 1. No `recallDepth` field exists here. After adding `recallDepth` to the schema, add it here too:
| Level | recallDepth |
|-------|-------------|
| TRIVIAL | 1 |
| SIMPLE | 1 |
| MODERATE | 3 |
| COMPLEX | null (unlimited, use tier-scaled) |
| CRITICAL | null (unlimited, use tier-scaled) |

**File 3:** `src/hooks/scripts/session-start.sh` (line 265-269) -- shell fallback matrix
| Level | Current planVerificationIterations | Target | Current verifyFixIterations | Target |
|-------|------------------------------------|--------|-----------------------------|--------|
| TRIVIAL | 0 | 1 | 0 | 1 |
| SIMPLE | 0 | 1 | (already 1) | 1 |

**File 4:** `src/hooks/pi-extensions/__helpers/session-init.ts` (lines 328-362) -- pi extension fallback matrix
| Level | Current planVerificationIterations | Target | Current verifyFixIterations | Target |
|-------|------------------------------------|--------|-----------------------------|--------|
| TRIVIAL | 0 | 1 | 0 | 1 |
| SIMPLE | 0 | 1 | (already 1) | 1 |

### Category 3: /lu Skill Routing Text (1 file)

**File:** `src/skills/luca/lu.skill.ts` (lines 128-136)

Current text (conditional gate checks):

```
**Task routing (via state machine or gate checks):**

For phase work, query the state machine or use `luca_gate_check` to determine which steps should run based on the classified complexity:

1. Check `research` gate (if required/optional): `Skill(skill: "phase-research")`
2. Check `discussion` gate (if required/optional/run): `Skill(skill: "phase-discuss")`
3. Always plan (if no plans exist): `Skill(skill: "phase-plan")`
4. Always execute: `Skill(skill: "phase-execute")`
```

Target text (all mandatory, matching autopilot):

```
**Task routing (all steps mandatory):**

For phase work, execute ALL steps in order. Every step runs at every complexity level — the only way to skip is explicit `--skip-*` flags:

1. Always discuss: `Skill(skill: "phase-discuss", args: "{phase_number}")`
2. Always plan (spawns research internally): `Skill(skill: "phase-plan", args: "{phase_number}")`
3. Always execute: `Skill(skill: "phase-execute", args: "{phase_number}")`
```

Key changes:

- Remove gate checks for research and discussion
- Make all steps unconditionally mandatory
- Note: `phase-research` is not called separately -- `phase-plan` spawns `lu-phase-researcher` internally (confirmed in phase-plan.skill.ts lines 197-244). The `/lu` skill does not need to call `phase-research` directly.
- Note: The `--skip-research` and `--skip-*` flags remain as explicit user overrides within individual skills.

### Category 4: lu-cognition Agent Text (1 file)

**File:** `src/agents/general/lu-cognition.agent.ts` (lines 396-400)

Current text:

```
1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth == 0: skip recall entirely (lite mode handles TRIVIAL/SIMPLE)
3. IF recallDepth is a number (e.g., 3): cap entries at recallDepth regardless of tier
4. IF recallDepth is null: use tier-scaled defaults below
```

Target text (remove the skip-on-zero branch since recallDepth minimum is now 1):

```
1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth is a number (e.g., 1 for TRIVIAL, 3 for MODERATE): cap entries at recallDepth regardless of tier
3. IF recallDepth is null (COMPLEX/CRITICAL): use tier-scaled defaults below
```

### Category 5: Complexity Gating Rule (1 file)

**File:** `src/rules/general/complexity-gating.rule.ts` (lines 75-81)

The Iteration Count Scaling table already shows the correct values (all 1s for TRIVIAL). However, two things should be updated:

- Remove any mention of `--skip-research` and `--skip-uat` from the override section (lines 91, 103-104) if they no longer apply. Actually, on review, these remain valid as explicit user-level overrides. No change needed here.
- The table values are already correct. No change needed.

## Don't Hand-Roll

| Problem                          | Don't Build             | Use Instead                          | Why                                    |
| -------------------------------- | ----------------------- | ------------------------------------ | -------------------------------------- |
| Schema validation for min values | Custom validation logic | Zod `.positive()` or `.min(1)`       | Already using Zod, built-in constraint |
| recallDepth nullable + min       | Custom null check       | `z.number().int().min(1).nullable()` | Zod handles nullable with min cleanly  |

## Common Pitfalls

### Pitfall 1: Forgetting Fallback Matrices

**What goes wrong:** Fixing config.json and defaults.ts but missing the session-start.sh and session-init.ts fallback matrices. New projects initialized by session-start would still get zeros.
**Why it happens:** There are 4 separate locations defining the complexity matrix (config.json, defaults.ts, session-start.sh, session-init.ts).
**How to avoid:** Grep for all occurrences of `planVerificationIterations: 0` and `verifyFixIterations: 0` across the entire repo before considering done.
**Warning signs:** `grep -r "planVerificationIterations: 0\|verifyFixIterations: 0" src/ .planning/`

### Pitfall 2: Breaking the Nullable recallDepth Semantics

**What goes wrong:** Setting recallDepth minimum to 1 but forgetting that COMPLEX/CRITICAL use `null` to mean "unlimited / tier-scaled." The schema must allow null.
**Why it happens:** `.min(1)` applied to a non-nullable number would reject null.
**How to avoid:** Use `z.number().int().min(1).nullable()` -- nullable allows null, min(1) applies when a number is provided.
**Warning signs:** Zod parse errors when COMPLEX/CRITICAL config has `"recallDepth": null`.

### Pitfall 3: Generated Output Drift

**What goes wrong:** Editing source files in `src/` but not running `bun run build:all` to regenerate `.claude/`, `.cursor/`, `.pi/` outputs. The lu-cognition agent's compiled markdown in `.claude/agents/lu-cognition.md` still says "IF recallDepth == 0: skip recall entirely."
**Why it happens:** Source files in `src/` are the source of truth, but compiled outputs in `.claude/`, `.cursor/`, `.pi/` are what agents actually read at runtime.
**How to avoid:** After all source changes, user must run `bun run build:all`. CRITICAL: Never run `bun run build:all` during a Claude Code session -- it crashes the process. Ask user to stop session, run manually, restart.
**Warning signs:** `bun run check:drift` will flag mismatches.

### Pitfall 4: phase-execute Skip-on-Zero Logic

**What goes wrong:** The phase-execute skill (line 1605, 1619) has explicit logic: "If verifyFixIterations is 0, skip Loop B." After we set the minimum to 1, this code path becomes dead, but it's not harmful.
**Why it happens:** The code was written when zero was a valid value.
**How to avoid:** Leave the dead code path as a safety net -- it's cheap and defensive. Optionally, update the comment to note the minimum is now 1.

## Code Examples

### Schema Change (complexity.schemas.ts)

```typescript
// Before:
planVerificationIterations: z.number().int().nonnegative(),
verifyFixIterations: z.number().int().nonnegative(),

// After:
planVerificationIterations: z.number().int().positive(),
verifyFixIterations: z.number().int().positive(),
/** Memory recall depth cap. Positive integer caps entries; null = tier-scaled defaults. */
recallDepth: z.number().int().min(1).nullable().optional(),
```

### Config.json Change (TRIVIAL section)

```json
// Before:
"TRIVIAL": {
  "cognitivePreflight": "lite",
  "planVerificationIterations": 0,
  "harnessFixIterations": 1,
  "verifyFixIterations": 0,
  "verificationMode": "quick",
  "recallDepth": 0
}

// After:
"TRIVIAL": {
  "cognitivePreflight": "lite",
  "planVerificationIterations": 1,
  "harnessFixIterations": 1,
  "verifyFixIterations": 1,
  "verificationMode": "quick",
  "recallDepth": 1
}
```

### defaults.ts Change (TRIVIAL section)

```typescript
// Before:
TRIVIAL: {
  cognitivePreflight: "lite",
  planVerificationIterations: 1,
  harnessFixIterations: 1,
  verifyFixIterations: 1,
  verificationMode: "quick",
  default_model: "haiku",
},

// After (add recallDepth):
TRIVIAL: {
  cognitivePreflight: "lite",
  planVerificationIterations: 1,
  harnessFixIterations: 1,
  verifyFixIterations: 1,
  verificationMode: "quick",
  default_model: "haiku",
  recallDepth: 1,
},
```

## State of the Art

| Old Approach                                | Current Approach                                | When Changed        | Impact                                                         |
| ------------------------------------------- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Zero iterations = skip step                 | Min 1 iteration = always run                    | This phase (v4.2.0) | TRIVIAL/SIMPLE get meaningful plan verification and verify-fix |
| /lu conditionally gates research/discussion | All steps mandatory, matching autopilot         | This phase (v4.2.0) | Unified pipeline regardless of entry point                     |
| recallDepth: 0 = skip recall                | recallDepth: 1 = always recall at least 1 entry | This phase (v4.2.0) | Even TRIVIAL tasks get minimal memory context                  |

## Open Questions

1. **Should `workflow.research: true/false` config gate still exist?**
   - What we know: phase-plan.skill.ts checks `workflow.research` from config (line 224). This is a config-level toggle, not a complexity gate.
   - What's unclear: After making all steps mandatory in /lu, should `workflow.research: false` in config.json still suppress research within phase-plan? The CONTEXT.md says "Config gate behavior: Gates control WHICH checks run (test, lint, build), not WHICH workflow steps run."
   - Recommendation: This is likely a follow-up issue. For this phase, focus on the /lu routing text and don't touch the internal config gate within phase-plan. The CONTEXT.md decision on "config gates control checks, not workflow steps" may require a separate pass through all skills that read `workflow.*` config values.

2. **Should the autopilot skill also gain a research step?**
   - What we know: The autopilot skill goes Discussion -> Planning -> Execution with no explicit research step. phase-plan spawns research internally.
   - What's unclear: Whether autopilot should explicitly invoke phase-research before phase-plan, for parity.
   - Recommendation: Leave as-is for this phase. phase-plan handles research internally. Adding a separate research step to autopilot would be scope creep.

## Sources

### Primary (HIGH confidence)

- `src/complexity/__schemas/complexity.schemas.ts` - Read directly, confirmed `.nonnegative()` on lines 120, 124
- `src/complexity/__helpers/defaults.ts` - Read directly, confirmed DEFAULT_COMPLEXITY_MATRIX already has all values >= 1
- `.planning/config.json` - Read directly, confirmed zero values at TRIVIAL/SIMPLE
- `src/skills/luca/lu.skill.ts` - Read directly, confirmed conditional gate text at lines 128-136
- `src/skills/general/autopilot.skill.ts` - Read directly, confirmed "MANDATORY -- No Exceptions" pattern
- `src/agents/general/lu-cognition.agent.ts` - Read directly, confirmed recallDepth == 0 skip branch at line 397
- `src/hooks/scripts/session-start.sh` - Read directly, confirmed zero values at lines 265-266
- `src/hooks/pi-extensions/__helpers/session-init.ts` - Read directly, confirmed zero values at lines 330-332, 337
- `src/skills/general/phase-plan.skill.ts` - Read directly, confirmed research is handled internally
- `src/skills/general/phase-execute.skill.ts` - Read directly, confirmed verifyFixIterations == 0 skip at line 1605

### Secondary (MEDIUM confidence)

- `.claude/agents/lu-cognition.md` (generated output) - Confirmed same recallDepth text as source

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Direct codebase inspection, no external dependencies
- Architecture: HIGH - All file locations verified with exact line numbers
- Pitfalls: HIGH - Identified through comprehensive grep of all consumers

**Research date:** 2026-03-12
**Valid until:** Indefinite (internal codebase research, not library-dependent)
