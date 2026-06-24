# Phase 206 Context: Component DRY & Convention Alignment

## Gray Areas & Decisions

### 1. Tab Container Extraction Strategy [researched]

**Decision:** Extract a generic `EntityTabContainer` component that accepts entity-specific config form as a render prop or component prop. The shared component handles: tab layout, edit mode header, dirty indicator, compiled output fetch, source/config/compiled tab structure. Entity-specific differences (config form component, CodeMirrorWrapper presence on agents) are passed as props.

**Rationale:** Tab containers are ~90% identical across agents/skills/rules. The only differences are the config form component and agent-specific CodeMirror editor. A component prop pattern keeps the generic clean while allowing entity-specific forms.

### 2. Config Form Unification Approach [researched]

**Decision:** Extract shared layout patterns into a `ConfigFormSection` component that handles the common form section structure (label, description, input). Entity-specific config forms retain their field lists but use the shared section component for consistent layout. Do NOT merge all 3 forms into one mega-component — each entity has different fields.

**Rationale:** The forms share layout patterns but have different field configurations. Extracting the section component gives DRY layout without over-abstracting the field differences.

### 3. Convention Fixes Approach [researched]

**Decision:** All convention fixes in Plan 2 are independent and can be applied file-by-file:

- **Cmd+S fix**: Remove duplicate `useEffect` keyboard handler in `use-pipeline-save.ts` (SaveBar already handles Cmd+S globally)
- **node:fs migration**: Replace `readFile`/`access` from `node:fs/promises` with `Bun.file().text()` and `Bun.file().exists()` in `config-section-handler.ts`
- **JSON clone → lodash**: Replace `JSON.parse(JSON.stringify(...))` with `cloneDeep` in `use-config-conflict.ts`
- **useCallback additions**: Wrap handler functions that are passed as deps
- **Switch unification**: Use shadcn Switch consistently (no custom toggles)

**Rationale:** These are mechanical, independent fixes. No ordering dependencies between them.

## Scope Boundaries

- Extract shared tab container — do NOT redesign the tab structure
- Unify config form sections — do NOT add new form fields
- Convention fixes only for files listed in ROADMAP.md
- Do NOT touch entity hooks (Phase 205 already completed that)

## Deferred Ideas

- None identified
