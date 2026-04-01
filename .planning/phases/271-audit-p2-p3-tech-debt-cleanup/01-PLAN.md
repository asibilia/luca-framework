# Phase 271: Audit P2-P3 Tech Debt Cleanup

---

phase: 271
plan: 01
type: cleanup
autonomous: true
wave: 1

---

## Objective

Address remaining P2-P3 audit findings: dead agent removal, barrel bypass fixes, missing exports, DRY annotation, JSDoc completeness, Bun.write migration, and console.error normalization.

## Tasks

### Task 1: ARCH-08 — Remove superseded lu-process-data agent

type="auto"

The `lu-process-data` agent is superseded by the deterministic CLI module at `src/process-data/__helpers/compute.ts`. Remove the agent definition and its registry/routing references.

- Delete `src/agents/luca/lu-process-data.agent.ts`
- Remove import and registry entry from `src/agents/__helpers/build-agent-registry.ts`
- Remove `"lu-process-data"` entry from MODEL_ROUTING_TABLE in `src/complexity/__helpers/model-routing.ts`
- Note: hook allowlists reference `"process-data-"` prefix (still valid for CLI invocation), NOT the agent name — leave those alone
- Note: `lu.skill.ts` comment references are documentation of the migration — leave those alone
- Note: `agent-prompts.ts` PROCESS_DATA_PROMPT is already marked @deprecated — leave it (backward compat)

**Verification:**

- [ ] Agent file deleted
- [ ] No import of luProcessDataAgent in registry
- [ ] No "lu-process-data" in MODEL_ROUTING_TABLE
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: ARCH-09 — Fix 5 barrel bypasses in skills/\_\_schemas/states/

type="auto"

Five state machine files import `createSkillStateMachine` via the deep path `~/workflow/__helpers/skill-state-machine` instead of the barrel `~/workflow`.

Update imports in:

- `src/skills/__schemas/states/lu.states.ts`
- `src/skills/__schemas/states/milestone-complete.states.ts`
- `src/skills/__schemas/states/phase-execute.states.ts`
- `src/skills/__schemas/states/pr-address.states.ts`
- `src/skills/__schemas/states/verify.states.ts`

Change: `~/workflow/__helpers/skill-state-machine` -> `~/workflow`

**Verification:**

- [ ] All 5 files import from `~/workflow`
- [ ] No remaining `~/workflow/__helpers/skill-state-machine` imports in states/

### Task 3: ARCH-11 — Export validateMilestone from verification barrel

type="auto"

The `validateMilestone` function in `src/verification/__helpers/milestone-validator.ts` is not re-exported from the verification barrel (`src/verification/index.ts`).

Add the export to `src/verification/index.ts`.

**Verification:**

- [ ] `validateMilestone` appears in `src/verification/index.ts` exports

### Task 4: DRY-011 — Annotate stubbed audit-findings module

type="auto"

The `audit-findings.ts` module and its schemas are stubbed no-ops pending MuninnDB integration. They are exported from the luca-state barrel but have no real consumers in `src/`. Add a TODO comment to the module and keep it — it defines the schema contract for future implementation.

**Verification:**

- [ ] TODO comment added to `packages/luca-framework/src/state/__helpers/audit-findings.ts`

### Task 5: DRY-007/008 — Add NOTE comments for meetsThreshold and MODEL_TIER_TO_MODEL duplication

type="auto"

The `meetsThreshold()` function and `MODEL_TIER_TO_MODEL` constant in `packages/luca-framework/src/state/utils/complexity-utils.ts` are duplicated from `src/complexity/__schemas/complexity.schemas.ts`. The file already has a DRY-001 NOTE. Verify DRY-007/008 are already covered or add them.

**Verification:**

- [ ] NOTE comments present for meetsThreshold and MODEL_TIER_TO_MODEL duplication

### Task 6: DX-05/06/10 — JSDoc completeness for appendRoutingEntry and computePipelinePosition

type="auto"

Add missing @param and @returns tags to:

- `appendRoutingEntry` in `src/complexity/__helpers/routing-history.ts`
- `computePipelinePosition` in `packages/luca-framework/src/state/__helpers/pipeline-position.ts`

**Verification:**

- [ ] Both functions have complete @param and @returns JSDoc tags

### Task 7: DX-01/12 — Migrate node:fs writeFile to Bun.write

type="auto"

Replace `writeFile` from `node:fs/promises` with `Bun.write()` in:

- `packages/luca-framework/src/state/__helpers/pipeline-lock.ts` (atomicWriteLock function)
- `packages/luca-framework/src/recovery/__helpers/convergence-state.ts` (writeConvergenceState function)

Keep `rename` and `unlink` from node:fs (Bun has no native equivalents for those).

**Verification:**

- [ ] No `writeFile` import in pipeline-lock.ts
- [ ] No `writeFile` import in convergence-state.ts
- [ ] Both use `Bun.write()` instead
- [ ] `bunx --bun tsc --noEmit` passes

### Task 8: DX-09 — Normalize CLI error output to console.error

type="auto"

In `src/process-data/__helpers/compute.ts`, replace `process.stderr.write(...)` calls with `console.error(...)` for consistency with the rest of the codebase.

**Verification:**

- [ ] No `process.stderr.write` in compute.ts
- [ ] All error output uses `console.error`

## Success Criteria

- All 8 tasks completed
- `bunx --bun tsc --noEmit` passes clean
- No backward compatibility broken
