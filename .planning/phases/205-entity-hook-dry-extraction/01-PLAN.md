---
phase: 205
plan: 1
type: improvement
autonomous: true
wave: 01
depends_on: []
---

# Phase 205 Plan 1: Extract useEntityDetail, useEntitySave, useEntityList Generics

## Objective

Extract three generic entity hooks (`useEntitySave`, `useEntityList`, `useEntityDetail`) from the nine entity-specific hook files, eliminating ~530 lines of triplication down to ~200 lines of generic code plus ~40 lines of entity config. Thin wrapper hooks preserve backward compatibility with zero consumer churn.

> Appetite: Small (50k tokens, ~40% context budget)

## Context

@packages/luca-studio/hooks/use-agent-save.ts
@packages/luca-studio/hooks/use-skill-save.ts
@packages/luca-studio/hooks/use-rule-save.ts
@packages/luca-studio/hooks/use-agent-list.ts
@packages/luca-studio/hooks/use-skill-list.ts
@packages/luca-studio/hooks/use-rule-list.ts
@packages/luca-studio/hooks/use-agent-detail.ts
@packages/luca-studio/hooks/use-skill-detail.ts
@packages/luca-studio/hooks/use-rule-detail.ts
@packages/luca-studio/hooks/helpers/merge-field-overrides.ts
@packages/luca-studio/stores/entity-atoms.ts
@packages/luca-studio/stores/config-atoms.ts
@.planning/phases/205-entity-hook-dry-extraction/01-CONTEXT.md
@.planning/phases/205-entity-hook-dry-extraction/01-PREMORTEM.md
@.planning/phases/205-entity-hook-dry-extraction/205-RESEARCH.md

## Tasks

### 1. Create EntityHookConfig types and entity config constants

**Type:** auto
**TDD:** false
**Depends on:** none

Create the shared config types and per-entity config objects that parameterize the generic hooks.

Create `packages/luca-studio/hooks/schemas/entity-hook-config.ts` with:

- `EntitySaveConfig` type: `entityType`, `endpoint`, `draftAtomFactory`, `fieldKeyMap`, `extractMetadata`
- `EntityListConfig` type: `entityType`, `endpoint`, optional `registryAtom`
- `EntityDetailConfig` type: `entityType`, `endpoint`, `draftAtomFactory`, `historyAtomFactory`
- `AGENT_SAVE_CONFIG`, `SKILL_SAVE_CONFIG`, `RULE_SAVE_CONFIG` constants (move field key maps here from individual save hooks)
- `AGENT_LIST_CONFIG`, `SKILL_LIST_CONFIG`, `RULE_LIST_CONFIG` constants
- `AGENT_DETAIL_CONFIG`, `SKILL_DETAIL_CONFIG`, `RULE_DETAIL_CONFIG` constants
- Each config references the correct atom factory from `~/stores/entity-atoms` and the correct endpoint path

CRITICAL: Use `entityType` string in all configs. This prevents Jotai atom factory key collisions when multiple entity pages create `__noop__` atoms (pre-mortem risk 1). The generic hooks will use `config.entityType` to build `${entityType}:__noop__` fallback keys.

**Files to create/edit:**

- `packages/luca-studio/hooks/schemas/entity-hook-config.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Config types are exported and importable
- All three entity types have save, list, and detail configs defined

### 2. Extract useEntitySave generic hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the generic save hook that accepts an `EntitySaveConfig` and implements the shared save/discard logic.

Create `packages/luca-studio/hooks/use-entity-save.ts`:

- Accept `(name: string | null, etag: string | null, config: EntitySaveConfig)`
- Use `config.draftAtomFactory(name ?? \`${config.entityType}:**noop**\`)` for atom key (prevents collision)
- In `save` callback: build entityKey as `${config.entityType.slice(0, -1)}:${name}` (e.g., "agent:lu-router")
- Call `mergeFieldOverrides(draft, config.fieldKeyMap)` for rawConfigText
- Call `config.extractMetadata(draft)` for the metadata object
- PUT to `${config.endpoint}/${encodeURIComponent(name)}` with If-Match header
- Handle 409 conflict with entity-agnostic error message: "Conflict: the entity has been modified externally. Please refresh and try again."
- Handle non-ok with body.error fallback
- Call `markClean(entityKey)` on success
- `discard` callback: `setDraft({})` + `markClean`
- Return `{ save, discard }`

Then convert the three entity-specific save hooks into thin wrappers:

- `use-agent-save.ts`: import `useEntitySave` + `AGENT_SAVE_CONFIG`, call `useEntitySave(name, etag, AGENT_SAVE_CONFIG)`, export return type
- `use-skill-save.ts`: same pattern with `SKILL_SAVE_CONFIG`
- `use-rule-save.ts`: same pattern with `RULE_SAVE_CONFIG`

**Files to create/edit:**

- `packages/luca-studio/hooks/use-entity-save.ts` (create)
- `packages/luca-studio/hooks/use-agent-save.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-skill-save.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-rule-save.ts` (replace with wrapper)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Wrapper hooks maintain identical export signatures (UseAgentSaveReturn, UseSkillSaveReturn, UseRuleSaveReturn)
- No consumer files (page.tsx) need changes

### 3. Extract useEntityList generic hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the generic list hook that accepts an `EntityListConfig` and implements the shared fetch-list logic.

Create `packages/luca-studio/hooks/use-entity-list.ts`:

- Accept `(config: EntityListConfig)`
- Local state: `entities` (EntitySummary[]), `loading` (boolean), `error` (string | null)
- If `config.registryAtom` is provided, use `useSetAtom(config.registryAtom)` to populate server-state mirror on fetch success
- Fetch from `config.endpoint`, parse `json.data` as `EntitySummary[]`
- Return `{ entities, loading, error, refresh }`

Then convert the three entity-specific list hooks into thin wrappers:

- `use-agent-list.ts`: import `useEntityList` + `AGENT_LIST_CONFIG`, return `{ agents: entities, loading, error, refresh }` (rename `entities` to `agents` for backward compat)
- `use-skill-list.ts`: same pattern, rename to `skills`
- `use-rule-list.ts`: same pattern, rename to `rules`

NOTE: The wrappers need to destructure and re-alias the `entities` field to maintain the entity-specific naming convention that consumers expect (e.g., `agents`, `skills`, `rules`).

**Files to create/edit:**

- `packages/luca-studio/hooks/use-entity-list.ts` (create)
- `packages/luca-studio/hooks/use-agent-list.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-skill-list.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-rule-list.ts` (replace with wrapper)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Agent list wrapper still populates `agentRegistryAtom` via config
- Skill and rule list wrappers work without registry atom (optional in config)
- No consumer files (page.tsx) need changes

### 4. Extract useEntityDetail generic hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the generic detail hook that accepts an `EntityDetailConfig` and implements the shared fetch-detail logic.

Create `packages/luca-studio/hooks/use-entity-detail.ts`:

- Accept `(name: string | null, config: EntityDetailConfig)`
- Use `config.draftAtomFactory(name ?? \`${config.entityType}:**noop**\`)` for atom key
- Use `config.historyAtomFactory(name ?? \`${config.entityType}:**noop**\`)` for history atom
- Local state: `detail`, `loading`, `error`, `etag`
- `nameRef` guard to prevent stale updates (same pattern as current hooks)
- Fetch from `${config.endpoint}/${encodeURIComponent(name)}`
- Extract ETag from response headers
- Populate draft with `{ ...json.data.metadata, rawConfigText, name, domain }`
- Call `resetHistory(RESET)` to clear undo history after server data arrives
- Return `{ detail, loading, error, etag, refresh }`

Then convert the three entity-specific detail hooks into thin wrappers:

- `use-agent-detail.ts`: import `useEntityDetail` + `AGENT_DETAIL_CONFIG`
- `use-skill-detail.ts`: same with `SKILL_DETAIL_CONFIG`
- `use-rule-detail.ts`: same with `RULE_DETAIL_CONFIG`

**Files to create/edit:**

- `packages/luca-studio/hooks/use-entity-detail.ts` (create)
- `packages/luca-studio/hooks/use-agent-detail.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-skill-detail.ts` (replace with wrapper)
- `packages/luca-studio/hooks/use-rule-detail.ts` (replace with wrapper)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Detail hooks still populate the correct draft atom per entity type
- History reset (RESET) still fires after detail fetch
- nameRef guard still prevents stale updates
- No consumer files (page.tsx) need changes

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors across all modified files
2. **Consumer stability**: No changes to any page.tsx or component file -- all imports and call signatures remain identical
3. **Entity isolation**: Each entity config uses distinct `entityType` string, preventing Jotai atom key collisions
4. **Behavioral equivalence**: Generic hooks implement identical logic to the originals (same fetch URLs, same error handling, same ETag behavior, same dirty-tracking calls)

## Success Criteria

- Nine entity-specific hook files reduced from full implementations (~530 combined lines) to thin wrappers (3-8 lines each)
- Three generic hooks created (`use-entity-save.ts`, `use-entity-list.ts`, `use-entity-detail.ts`)
- One shared config file with typed configs for all three entity types
- Zero changes to consumer code (page.tsx files, component files)
- TypeScript compilation succeeds with no new errors

## Output Specification

- `packages/luca-studio/hooks/schemas/entity-hook-config.ts` (new: config types and constants)
- `packages/luca-studio/hooks/use-entity-save.ts` (new: generic save hook)
- `packages/luca-studio/hooks/use-entity-list.ts` (new: generic list hook)
- `packages/luca-studio/hooks/use-entity-detail.ts` (new: generic detail hook)
- `packages/luca-studio/hooks/use-agent-save.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-skill-save.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-rule-save.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-agent-list.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-skill-list.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-rule-list.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-agent-detail.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-skill-detail.ts` (rewritten: thin wrapper)
- `packages/luca-studio/hooks/use-rule-detail.ts` (rewritten: thin wrapper)
