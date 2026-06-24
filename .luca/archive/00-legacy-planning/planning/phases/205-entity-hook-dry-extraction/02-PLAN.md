---
phase: 205
plan: 2
type: improvement
autonomous: true
wave: 02
depends_on: [1]
---

# Phase 205 Plan 2: Schema-First Metadata + Dead Undo Cleanup

## Objective

Fix schema-first violations in entity save hook configs by adding Zod validation for FieldKeyMap and metadata extraction. Remove dead `canUndo`/`canRedo` destructuring from all three entity page components. Both changes are convention-alignment cleanup that produce zero behavioral changes.

> Appetite: Small (50k tokens, ~40% context budget)

## Context

@packages/luca-studio/hooks/schemas/entity-hook-config.ts (created in Plan 1)
@packages/luca-studio/hooks/helpers/merge-field-overrides.ts
@packages/luca-studio/hooks/use-entity-save.ts (created in Plan 1)
@packages/luca-studio/hooks/use-agent-save.ts
@packages/luca-studio/hooks/use-skill-save.ts
@packages/luca-studio/hooks/use-rule-save.ts
@packages/luca-studio/app/agents/page.tsx
@packages/luca-studio/app/skills/page.tsx
@packages/luca-studio/app/rules/page.tsx
@packages/luca-studio/hooks/use-undo.ts
@.planning/phases/205-entity-hook-dry-extraction/01-CONTEXT.md
@.planning/phases/205-entity-hook-dry-extraction/01-PREMORTEM.md

## Tasks

### 1. Add Zod schemas for FieldKeyMap and entity save metadata

**Type:** auto
**TDD:** false
**Depends on:** none (Plan 1 must be complete before this wave)

Create Zod schemas that validate the entity save config objects. This addresses pre-mortem risk 2 (FieldKeyMap not validated) and aligns with the project's schema-first parsing standard.

Add to `packages/luca-studio/hooks/schemas/entity-hook-config.ts`:

- `FieldKeyMapSchema`: `z.record(z.string(), z.array(z.string()))` -- validates that each field key map entry maps a draft field name to an array of config key variants
- `EntityMetadataSchema`: Zod object schema for the common metadata shape returned by `extractMetadata` (varName, domain, imports, sharedConstants, exportVarName, factoryFn, configType, prefix, suffix -- all strings or string arrays with defaults)
- `EntitySaveConfigSchema`: Zod schema for the full save config object, with `fieldKeyMap` validated by `FieldKeyMapSchema`

Update the three entity save config constants (`AGENT_SAVE_CONFIG`, `SKILL_SAVE_CONFIG`, `RULE_SAVE_CONFIG`) to validate their `fieldKeyMap` values through the schema using `safeParse`. If validation fails, log a development warning and fall back to the raw object.

NOTE: The `extractMetadata` callback itself cannot be fully validated by Zod at definition time (it is a function). The schema validates the config structure; runtime metadata output is validated separately if needed.

**Files to create/edit:**

- `packages/luca-studio/hooks/schemas/entity-hook-config.ts` (edit: add Zod schemas, update config constants)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Each entity save config's fieldKeyMap is validated via `FieldKeyMapSchema.safeParse()`
- Invalid field key maps (wrong types) would produce a logged warning, not a crash

### 2. Remove dead canUndo/canRedo destructuring from entity pages

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the unused `canUndo` and `canRedo` variables from the `useUndo` destructuring in all three entity page components. These variables are destructured but never referenced anywhere in the page files (confirmed by grep).

Current code in all three pages:

```typescript
const { canUndo, canRedo, undo, redo } = useUndo(
  agentHistoryAtom(selectedName ?? "__noop__"),
);
```

Updated code:

```typescript
const { undo, redo } = useUndo(agentHistoryAtom(selectedName ?? "__noop__"));
```

The `useUndo` hook itself is NOT modified -- it still returns `canUndo`/`canRedo` in its type signature and uses them internally for keyboard shortcut gating. Only the page-level destructuring is cleaned up.

CRITICAL (pre-mortem risk 3): This is a pure dead code removal. The `UseUndoReturn` type and the `useUndo` hook implementation remain unchanged. Only the three page files are touched.

**Files to create/edit:**

- `packages/luca-studio/app/agents/page.tsx` (edit: line 55, remove canUndo/canRedo from destructuring)
- `packages/luca-studio/app/skills/page.tsx` (edit: line 54, remove canUndo/canRedo from destructuring)
- `packages/luca-studio/app/rules/page.tsx` (edit: line 55, remove canUndo/canRedo from destructuring)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn "canUndo\|canRedo" packages/luca-studio/app/` returns zero matches (no page references remain)
- `useUndo` hook still compiles and its return type still includes canUndo/canRedo (hook is unchanged)
- Keyboard shortcuts (Cmd+Z, Shift+Cmd+Z) still work because they are handled inside useUndo, not in page components

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Schema validation**: FieldKeyMap configs are validated via Zod safeParse
3. **Dead code gone**: No `canUndo`/`canRedo` references in any page.tsx file
4. **No behavioral change**: Both tasks are pure convention/cleanup changes with zero runtime impact

## Success Criteria

- FieldKeyMapSchema validates all three entity save configs (agent: 4 entries, skill: 1 entry, rule: 2 entries)
- EntityMetadataSchema defines the common metadata shape with proper Zod types
- Zero `canUndo`/`canRedo` destructuring in page components
- TypeScript compilation succeeds with no new errors
- No consumer-facing behavioral changes

## Output Specification

- `packages/luca-studio/hooks/schemas/entity-hook-config.ts` (modified: Zod schemas added)
- `packages/luca-studio/app/agents/page.tsx` (modified: dead code removed)
- `packages/luca-studio/app/skills/page.tsx` (modified: dead code removed)
- `packages/luca-studio/app/rules/page.tsx` (modified: dead code removed)
