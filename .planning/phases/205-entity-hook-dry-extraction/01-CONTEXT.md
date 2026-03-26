# Phase 205 Context: Entity Hook DRY Extraction

## Gray Areas & Decisions

### 1. Generic Hook Parameterization [researched]

**Decision:** Use a config-object pattern. Each generic hook (`useEntitySave`, `useEntityList`, `useEntityDetail`) accepts an `EntityHookConfig` object containing:

- `entityType`: string identifier (e.g., "agents", "skills", "rules")
- `endpoint`: API path prefix (e.g., "/api/entities/agents")
- `draftAtom`: Jotai atom for draft state
- `historyAtom`: Jotai atom for undo/redo history (detail hook only)
- `registryAtom`: Jotai atom for list state (list hook only)
- `fieldKeyMap`: FieldKeyMap for save serialization (save hook only)

**Rationale:** Config objects are composable, type-safe, and match the functional API reuse pattern. Factory functions (currying) would work but config objects are more explicit and self-documenting.

### 2. Consumer Migration Strategy [researched]

**Decision:** Create generic hooks + thin entity-specific wrappers. Keep `use-agent-save.ts`, `use-skill-save.ts`, `use-rule-save.ts` as 3-5 line files that import the generic and pass entity-specific config. Consumers don't change their imports.

**Rationale:** Zero consumer churn. Page files (`agents/page.tsx`, `skills/page.tsx`, `rules/page.tsx`) continue importing `useAgentSave`, `useSkillSave`, etc. The generic is the implementation; wrappers are the API.

### 3. Zod Metadata Schema Placement [researched]

**Decision:** Co-locate schemas in a new `hooks/schemas/` directory (e.g., `hooks/schemas/entity-save.schemas.ts`). Each schema validates the metadata passed to save hooks (description, enabled, frontmatter fields). Entity-specific field key maps also move here.

**Rationale:** Keeps schemas close to consumers (hooks) while separating them from implementation. Follows existing `__schemas/` pattern used elsewhere in the codebase.

### 4. Dead Code Removal [researched]

**Decision:** Remove `canUndo`/`canRedo` destructuring from all 3 entity pages in the same PR. These were from the old jotai-history integration that was removed.

**Rationale:** Straightforward dead code cleanup. No behavioral change.

## Scope Boundaries

- Extract generics for save, list, and detail hooks ONLY
- Do NOT touch tab container components (that's Phase 206)
- Do NOT add new hook functionality — pure DRY extraction
- If entity-specific edge cases emerge, keep them in the wrapper, not the generic

## Deferred Ideas

- None identified
