# Phase 225 — DRY Consolidation: Context

## Decisions

### 1. Hook Factory API [researched]

**Decision:** Extract `createSubSkillEnforcementHook(config)` to `src/hooks/__helpers/enforcement-hook-factory.ts`.

**Config interface:**
```typescript
interface EnforcementHookConfig {
  hookName: string;                                    // e.g., "pre-step-lu"
  contextPath: string;                                 // e.g., "/tmp/lu-context.json"
  subSkills: ReadonlySet<string>;                      // Skill names to enforce
  validStates: Record<string, ReadonlySet<string>>;    // Skill -> valid states map
  initialSkill?: string;                               // Skill valid from missing context (e.g., "lu-route")
}
```

**Rationale:** All 4 enforcement hooks (pre-step-lu, pre-step-phase-execute, pre-step-verify, pre-step-milestone-complete) share identical logic. Only 5 config values differ. The factory lives in hooks/__helpers/ because it's consumed only by hook scripts.

### 2. Context Helper Factory [researched]

**Decision:** Extract `createContextHelpers<T>(path, schema)` to `src/skills/__schemas/context-helpers.ts`.

**Returns:** `{ read(): Promise<SafeParseResult>, write(patch): Promise<void> }` using Bun.file + Zod safeParse + lodash merge — same pattern as existing `readLuContext`/`writeLuContext`.

**Rationale:** lu-context.schemas.ts already has the pattern. The other 3 orchestrators (phase-execute, verify, milestone-complete) need identical typed read/write helpers for their context files. Generic over Zod schema avoids duplication.

### 3. Shared ABORT Transition [researched]

**Decision:** Move `ABORT_TRANSITION` to `src/skills/__schemas/states/shared-transitions.ts`.

**Rationale:** All 4 state machine files define identical `const ABORT_TRANSITION = { ABORT: "failed" } as const;`. A single shared export eliminates the duplication while keeping it within the T2 entity domain boundary (skills/__schemas/states/).

### 4. Orchestrator Pattern Standardization [researched]

**Decision:** Document but do NOT refactor orchestrator patterns in this phase. Orchestrator skills (.skill.ts) have similar but not identical patterns. Premature DRY extraction would over-abstract. Note as future candidate.

## Scope Boundary

- Extract hook factory (DRY-001)
- Extract context helper factory (DRY-002)
- Extract ABORT_TRANSITION (DRY-003)
- Standardize orchestrator import patterns (DRY-004, DRY-005) — limited to shared constants
- Do NOT refactor orchestrator skill logic itself
