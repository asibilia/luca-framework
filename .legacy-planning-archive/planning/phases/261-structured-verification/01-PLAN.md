---
phase: 261
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 261 Plan 1: Structured Verification

## Objective

Verification produces machine-readable JSON that the orchestrator and milestone
validation can consume without prose parsing, and success criteria have stable IDs
(SC-1, SC-2, ...) that enable convergence tracking across iterations.

Four requirements drive this work:

- VERIF-01: Zod schemas for the verification result contract
- VERIF-02: GOAL_VERIFY_PROMPT writes `verification-result.json` instead of (only) VERIFICATION.md
- VERIF-03: lu-planner emits criterion IDs on every success criterion
- VERIF-04: Deterministic milestone validator aggregates all `verification-result.json` files

## Context

- @src/skills/\_\_helpers/agent-prompts.ts — GOAL_VERIFY_PROMPT at line 527, outputContract helper
- @src/harness/\_\_schemas/harness.schemas.ts — Zod schema conventions to follow (camelCase internal, snake_case serialized)
- @src/harness/\_\_helpers/runner.ts — CLI runner pattern for milestone-validator to mirror
- @packages/luca-framework/templates/harness/claude/agents/**branding.commandPrefix**-planner.md — planning prompt template with Success Criteria section
- @src/skills/\_\_helpers/agent-prompts.ts line 262-295 — verify orchestration context (VERIFY_EXTRACT_PROMPT)

## Tasks

### 1. Create src/verification/ domain with Zod schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create the `src/verification/` infrastructure domain (Archetype C, T1 tier per domain
architecture rules). This domain provides the canonical data contract for verification
results consumed by orchestrators and the milestone validator.

Files to create:

- `src/verification/__schemas/verification.schemas.ts` — Zod schemas
- `src/verification/index.ts` — barrel re-export

Schema shape (internal camelCase per harness pattern; serialized to snake_case):

```typescript
// CriterionResultSchema: one per success criterion
export const CriterionResultSchema = z.object({
  criterion_id: z.string(), // "SC-1", "SC-2", etc.
  description: z.string(),
  met: z.boolean(),
  evidence: z.string(), // file path or inline observation
  gap: z.string().optional(), // only present when met === false
  blocking: z.boolean().default(false),
});

// PhaseVerificationResultSchema: top-level written as verification-result.json
export const PhaseVerificationResultSchema = z.object({
  phase: z.string(),
  verdict: z.enum(["PASSED", "ISSUES"]),
  criteria_met: z.number().int().nonnegative(),
  criteria_total: z.number().int().positive(),
  criteria: z.array(CriterionResultSchema),
  blocking_gaps: z.array(z.string()), // criterion_ids where blocking === true
  timestamp: z.string(), // ISO-8601
  duration_ms: z.number().nonnegative().optional(),
});
```

Export inferred TypeScript types alongside schemas.

**Files to create/edit:**

- `src/verification/__schemas/verification.schemas.ts`
- `src/verification/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no new errors
- `grep -r "PhaseVerificationResultSchema" src/verification/` finds the export
- `grep -r "CriterionResultSchema" src/verification/` finds the export

---

### 2. Update GOAL_VERIFY_PROMPT to write verification-result.json

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `GOAL_VERIFY_PROMPT` in `src/skills/__helpers/agent-prompts.ts` so that
lu-verifier writes a structured `verification-result.json` to the phase directory
in addition to (not instead of) `VERIFICATION.md`.

Current task list in GOAL_VERIFY_PROMPT:

1. Read phase goal from ROADMAP.md
2. Read PLAN.md success criteria
3. Read execution summaries from SUMMARY.md
4. For each criterion: verify met by checking actual code/files
5. Write VERIFICATION.md
6. Determine verdict

New task list replaces steps 5-6: 5. For each success criterion, record: criterion_id (SC-N from PLAN.md), description,
met (true/false), evidence (file path or observation), gap (if not met), blocking (true if gap blocks milestone) 6. Write `verification-result.json` to the phase directory using the
PhaseVerificationResultSchema shape (all fields snake_case in JSON output):
`{ phase, verdict, criteria_met, criteria_total, criteria: [...], blocking_gaps, timestamp }` 7. Also write VERIFICATION.md (human-readable summary, preserve existing format) 8. Determine overall verdict: PASSED (all criteria met) or ISSUES (any gap)

Update the output contract to include `VERIFICATION_JSON_PATH: {path to verification-result.json}`.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts` (GOAL_VERIFY_PROMPT only)

**Verification:**

- GOAL_VERIFY_PROMPT string contains "verification-result.json"
- GOAL_VERIFY_PROMPT string contains "criterion_id"
- GOAL_VERIFY_PROMPT string contains "blocking_gaps"
- Output contract line contains "VERIFICATION_JSON_PATH"
- `bunx --bun tsc --noEmit` passes

---

### 3. Update lu-planner template to emit criterion IDs

**Type:** auto
**TDD:** false
**Depends on:** none

Update the lu-planner agent template so that every success criterion in PLAN.md gets
a stable ID (SC-1, SC-2, ...). These IDs persist unchanged from planning through
execution and verification, enabling the orchestrator to track convergence per criterion.

Location: `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-planner.md`

In the `## plan_structure` section, update the Success Criteria block in the PLAN.md
template from:

```markdown
## Success Criteria

[Measurable outcomes that confirm objective achieved]
```

to:

```markdown
## Success Criteria

- **SC-1**: [First measurable outcome]
- **SC-2**: [Second measurable outcome]
- **SC-N**: [Additional outcomes as needed]
```

Also add a short note in the plan_structure section after the template block:

> **Criterion IDs**: Each success criterion MUST be assigned a stable ID in the form
> SC-N (SC-1, SC-2, ...). These IDs are referenced by lu-verifier to populate
> `verification-result.json` and by the milestone validator for convergence tracking.
> Do NOT change criterion IDs once a plan has been created — they are immutable
> identifiers.

This is a template-only change (no TypeScript involved).

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-planner.md`

**Verification:**

- Template contains "SC-1", "SC-2", "SC-N"
- Template contains "Criterion IDs" note about immutability
- `bunx --bun tsc --noEmit` still passes (no TS changes)

---

### 4. Create deterministic milestone validator CLI

**Type:** auto
**TDD:** false
**Depends on:** 1

Create a TypeScript CLI at `src/verification/__helpers/milestone-validator.ts` that:

1. Accepts `--milestone-phases=<phase1,phase2,...>` or discovers phases from
   `.planning/phases/` matching a milestone tag
2. For each phase directory, reads `.planning/phases/{N}-{desc}/verification-result.json`
   if present; skips phases with no file (logs a warning)
3. Aggregates results using PhaseVerificationResultSchema.safeParse() to validate each file
4. Computes milestone-level summary:
   - `phases_verified`: count of phases with valid verification-result.json
   - `phases_missing`: list of phase dirs without verification-result.json
   - `phases_passed`: count where verdict === "PASSED"
   - `phases_with_issues`: count where verdict === "ISSUES"
   - `blocking_gaps`: all blocking_gaps aggregated across phases (with phase prefix)
   - `milestone_verdict`: "PASSED" (all verified phases passed, zero blocking gaps)
     or "ISSUES" (any phase has ISSUES or any blocking gap)
5. Writes output as JSON to stdout (machine-readable)
6. Exits with code 0 on PASSED, 1 on ISSUES, 2 on validation/parse error

The validator is intentionally deterministic: no LLM calls, no heuristics. It is
a pure aggregation of already-written JSON files.

Invoke pattern (for orchestrator):

```bash
bun src/verification/__helpers/milestone-validator.ts \
  --phases=.planning/phases/258-foo,.planning/phases/259-bar
```

**Files to create/edit:**

- `src/verification/__helpers/milestone-validator.ts`

**Verification:**

- File exists and `bunx --bun tsc --noEmit` passes with no new errors
- `grep "milestone_verdict" src/verification/__helpers/milestone-validator.ts` finds the field
- `grep "safeParse" src/verification/__helpers/milestone-validator.ts` confirms Zod validation
- `grep "process.exit" src/verification/__helpers/milestone-validator.ts` confirms exit codes

## Verification

After all tasks complete:

1. Type check: `bunx --bun tsc --noEmit` — zero new errors
2. Schema export check: `grep -r "PhaseVerificationResultSchema\|CriterionResultSchema" src/verification/` — both found
3. Prompt check: `grep "verification-result.json" src/skills/__helpers/agent-prompts.ts` — present in GOAL_VERIFY_PROMPT
4. Template check: `grep "SC-1\|SC-2" packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-planner.md` — present
5. Validator check: `bun src/verification/__helpers/milestone-validator.ts --help 2>&1 || true` — does not panic on import

## Success Criteria

- **SC-1**: `src/verification/__schemas/verification.schemas.ts` exports PhaseVerificationResultSchema and CriterionResultSchema with all required fields (phase, verdict, criteria_met, criteria_total, criteria array with per-criterion fields, blocking_gaps, timestamp)
- **SC-2**: GOAL_VERIFY_PROMPT instructs lu-verifier to write `verification-result.json` with criterion_id, met, evidence, gap, blocking per criterion and overall blocking_gaps array
- **SC-3**: lu-planner template PLAN.md structure shows SC-N criterion IDs with an immutability note
- **SC-4**: `src/verification/__helpers/milestone-validator.ts` aggregates verification-result.json files deterministically (no LLM), outputs JSON to stdout, exits 0/1/2

## Output Specification

New files created:

- `src/verification/__schemas/verification.schemas.ts` — Zod contract
- `src/verification/index.ts` — barrel
- `src/verification/__helpers/milestone-validator.ts` — CLI aggregator

Modified files:

- `src/skills/__helpers/agent-prompts.ts` — GOAL_VERIFY_PROMPT updated
- `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-planner.md` — SC-N IDs in template
