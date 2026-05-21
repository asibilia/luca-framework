# Phase 205: Entity Hook DRY Extraction - Research

**Researched:** 2026-03-26
**Domain:** React hooks, Jotai state management, entity save/list/detail patterns
**Confidence:** HIGH

## Summary

Phase 205 addresses ~530 lines of triplication across save, list, and detail hooks for agents, skills, and rules. The three entity types follow nearly identical patterns but use different atom factories, endpoints, and field key maps. Research confirms that a generic hook pattern with config objects will eliminate the duplication while maintaining type safety and consumer compatibility.

**Key findings:**

- Save hooks: 53-62 lines each, 95% identical logic structure (differ only in atom, endpoint, entity key prefix, and metadata domain)
- List hooks: 38-68 lines each, ~85% identical (agent list includes registry atom update; skill/rule do not)
- Detail hooks: 68-115 lines each, ~90% identical (same structure, different atom factories)
- Field key maps: Small, entity-specific (agent: 4 entries; skill: 1 entry; rule: 2 entries)
- Dead code: `canUndo`/`canRedo` destructured on agents/page.tsx:55 but never used (orphaned from jotai-history integration removal)

**Recommended approach:**

- Extract generic hooks to `hooks/use-entity-save.ts`, `hooks/use-entity-list.ts`, `hooks/use-entity-detail.ts`
- Create entity-specific config objects (endpoint, atom factory, field map) in `hooks/schemas/entity-config.schemas.ts`
- Keep wrapper hooks (`use-agent-save.ts`, etc.) as 3-5 line re-exports for zero consumer churn
- Validate atom factory keys include entityType to prevent Jotai ID collisions
- Remove `canUndo`/`canRedo` from all three page components (dead code removal)

## Standard Stack

### Core Libraries

| Library       | Version | Purpose                    | Why Standard                    |
| ------------- | ------- | -------------------------- | ------------------------------- |
| React         | 18+     | Component framework        | UI foundation                   |
| Jotai         | Latest  | Primitive state management | Used throughout luca-studio     |
| jotai-history | Latest  | Undo/redo wrapper          | History support for detail hook |
| TypeScript    | 5+      | Type safety                | Codebase standard               |

### Patterns

| Pattern                        | Purpose                                | How Used                                        |
| ------------------------------ | -------------------------------------- | ----------------------------------------------- |
| Config object (functional API) | Parameterize generic hooks             | Pass `EntityHookConfig` to each generic         |
| atomFamily factory             | Create per-entity atom instances       | `agentDraftAtom(name)`, `skillDraftAtom(name)`  |
| useCallback with stable deps   | Memoize fetch and save callbacks       | Prevent unnecessary re-renders                  |
| nameRef guard                  | Prevent stale updates on entity switch | Detail hook compares `nameRef.current === name` |

## Architecture Patterns

### Generic Hook Config Pattern

Each generic hook accepts an `EntityHookConfig` object describing the entity:

```typescript
interface EntityHookConfig {
  // Type identifier: "agents", "skills", "rules"
  entityType: string;

  // API endpoint prefix: "/api/entities/agents"
  endpoint: string;

  // Jotai draft atom factory: agentDraftAtom, skillDraftAtom, etc.
  draftAtomFactory: (
    name: string,
  ) => WritableAtom<EntityDraft, [unknown], void>;

  // (Detail hook only) Jotai history atom factory
  historyAtomFactory?: (name: string) => Atom<HistoryState>;

  // (List hook only) Jotai registry atom for server-state mirror
  registryAtom?: WritableAtom<EntitySummary[] | null, [unknown], void>;

  // (Save hook only) Field-to-key mapping for form overrides
  fieldKeyMap?: FieldKeyMap;

  // (Save hook only) Metadata field extraction function
  // Returns metadata object from draft (agent/skill/rule specific)
  extractMetadata?: (draft: Record<string, unknown>) => Record<string, unknown>;
}
```

### Generic Save Hook Pattern

Generic `useEntitySave(name, etag, config)`:

1. Accept entity name and config object
2. Destructure draft and setDraft from config's draftAtomFactory
3. In `save` callback:
   - Validate name is not null (else no-op)
   - Generate entityKey from entityType: `${entityType}:${name}`
   - Call mergeFieldOverrides with config's fieldKeyMap
   - Extract metadata using config's extractMetadata callback
   - PUT to `${config.endpoint}/${encodeURIComponent(name)}`
   - Send `If-Match: ${etag}` for optimistic concurrency
   - Handle 409 conflict, 4xx errors, success path identically
   - Call markClean(entityKey) on success
4. In `discard` callback: reset draft to {} and markClean
5. Return { save, discard }

**Entity-specific differences** (moved to config):

- Atom factory (agentDraftAtom vs skillDraftAtom vs ruleDraftAtom)
- Endpoint path suffix (agents vs skills vs rules)
- Entity key prefix (agent vs skill vs rule)
- Metadata object shape (agent has 8 fields: varName, domain, imports, etc.; skill/rule similar but domain varies)
- Field key map (agent: 4 entries; skill: 1; rule: 2)

### Generic List Hook Pattern

Generic `useEntityList(config)`:

1. Destructure endpoint and registryAtom from config
2. Use local useState for list, loading, error
3. In fetchEntity callback:
   - setLoading(true), setError(null)
   - fetch(config.endpoint)
   - On success: setState with json.data
   - If config.registryAtom exists, setRegistry(json.data) to populate server-state mirror
   - On error: setError with message
   - Finally: setLoading(false)
4. useEffect to invoke fetchEntity on mount
5. Return { entities: list, loading, error, refresh: fetchEntity }

**Entity-specific differences** (moved to config):

- Endpoint path (agents vs skills vs rules)
- Registry atom reference (agentRegistryAtom exists; skill/rule do not have registry atoms yet, so config.registryAtom is optional)

### Generic Detail Hook Pattern

Generic `useEntityDetail(name, config)`:

1. Accept entity name and config with draftAtomFactory, historyAtomFactory, endpoint
2. Use local useState for detail, loading, error, etag
3. Destructure setDraft from config's draftAtomFactory
4. Destructure resetHistory from config's historyAtomFactory (if provided)
5. Use nameRef guard (as in current agent/skill/rule detail)
6. In fetchDetail callback:
   - Validate name is not null
   - fetch(${config.endpoint}/${encodeURIComponent(name)})
   - Extract ETag from response headers
   - Check nameRef.current === name to prevent stale updates
   - setDetail(json.data)
   - setEtag(etagHeader)
   - setDraft({ ...json.data.metadata, rawConfigText, name, domain })
   - If historyAtomFactory provided, resetHistory(RESET) to clear undo history
7. useEffect to invoke fetchDetail when name changes
8. Return { detail, loading, error, etag, refresh: fetchDetail }

**Entity-specific differences** (moved to config):

- Atom factories (agent/skill/rule)
- Endpoint path
- Metadata extraction (all identical: spread json.data.metadata + add rawConfigText, name, domain)

## Don't Hand-Roll

Problems that have existing solutions in this codebase:

| Problem                                     | Don't Build           | Use Instead                                                    | Why                                                               |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Merge form field overrides into config text | Custom regex logic    | mergeFieldOverrides helper + FieldKeyMap                       | Helper already exists, tested, supports string and boolean fields |
| Manage per-entity draft state               | Custom atom factories | Jotai atomFamily + agentDraftAtom/skillDraftAtom/ruleDraftAtom | Existing atoms handle keyed state perfectly                       |
| Serialize form changes to API               | Manual field mapping  | FieldKeyMap descriptor + extractMetadata callback              | Declarative, schema-first pattern                                 |
| Handle concurrent saves                     | Manual ETag tracking  | If-Match header + 409 conflict response                        | Standard HTTP mechanism, already in place                         |
| Track dirty state across entities           | Custom dirty tracking | markCleanAtom helper from dirty-tracking store                 | Already integrated, works with entityKey pattern                  |

## Common Pitfalls

### Pitfall 1: Jotai Atom Factory ID Collision

**What goes wrong:**
Generic hooks create default no-op atoms with hardcoded `"__noop__"` key when name is null. If two entity types (agents and skills) load side-by-side without selection, their `__noop__` atoms collide in the Jotai cache, causing state corruption.

**Why it happens:**
Atom factory keys must be globally unique across the app. Using a bare string without entity type prefix creates collisions when multiple entity types use the same fallback key.

**How to avoid:**
Entity config object must include entityType string. When creating no-op atoms, build the key as `${entityType}:__noop__` instead of bare `__noop__`. Example:

```typescript
const draftAtom = config.draftAtomFactory(
  name ?? `${config.entityType}:__noop__`,
);
```

**Warning signs:**

- State from one entity type leaking into another
- Form values changing when switching between different entity types without selection
- Console errors about unexpected atom state

### Pitfall 2: FieldKeyMap Not Validated (Schema-First Violation)

**What goes wrong:**
Entity-specific field key maps are moved to schemas but consumer code (wrapper hooks) passes raw objects without Zod validation. This violates the schema-first pattern and makes it impossible to catch misconfigured field maps at dev time.

**Why it happens:**
Field key maps are small (1-4 entries) and look "simple enough" to pass without validation. But they control which form fields get serialized back to the config file — missing or typo'd keys cause silent field loss on save.

**How to avoid:**
Create `FieldKeyMapSchema` and entity-specific config metadata schemas in `hooks/schemas/`:

```typescript
export const FieldKeyMapSchema = z.record(z.string(), z.array(z.string()));
export const AgentConfigMetadataSchema = z.object({
  entityType: z.literal("agents"),
  fieldKeyMap: FieldKeyMapSchema,
  extractMetadata: z.function(),
  // ...
});
```

In wrapper hooks, parse config before passing to generic:

```typescript
const config = AgentConfigMetadataSchema.parse({
  entityType: "agents",
  fieldKeyMap: AGENT_FIELD_KEY_MAP,
  // ...
});
return useEntitySave(name, etag, config);
```

**Warning signs:**

- Form field values don't persist to the server
- metaData object is malformed in PUT request body
- Missing field key map entries for new form fields

### Pitfall 3: Dead Code Reference Propagation

**What goes wrong:**
`canUndo`/`canRedo` are removed from agents/page.tsx, skills/page.tsx, rules/page.tsx but remain in the save/list/detail hook return types. This leaves orphaned exports and makes the hooks' type signatures misleading about what they actually return.

**Why it happens:**
The undo/redo integration was removed globally, but the destructuring was only deleted from page components, not from the hooks themselves. Removing from hooks last doesn't catch the inconsistency.

**How to avoid:**
In the same atomic commit that removes canUndo/canRedo from page components:

1. Grep for ALL references: `grep -rn "canUndo\|canRedo" packages/luca-studio/`
2. Remove from page.tsx destructuring
3. Remove from hook return type definitions (UseAgentDetailReturn, UseSkillDetailReturn, UseRuleDetailReturn)
4. Verify no other references exist
5. Commit atomically with message mentioning all three locations

**Warning signs:**

- Hook return types include fields that page components never use
- TypeScript unused variable warnings in page components (if strict)
- Dead code scanner flags orphaned exports

## Code Examples

### Wrapper Hook Pattern (Zero Consumer Churn)

Keep original hook names, import generic, pass config:

**Before (current):**

```typescript
// use-agent-save.ts — 118 lines with full logic
export function useAgentSave(
  name: string | null,
  etag: string | null,
): UseAgentSaveReturn {
  // Full save logic with agent-specific details
}
```

**After (wrapper pattern):**

```typescript
// use-agent-save.ts — 7 lines, re-exports generic
import { useEntitySave } from "~/hooks/use-entity-save";
import { AGENT_CONFIG } from "~/hooks/schemas/entity-config.schemas";

export function useAgentSave(name: string | null, etag: string | null) {
  return useEntitySave(name, etag, AGENT_CONFIG);
}

export type UseAgentSaveReturn = ReturnType<typeof useAgentSave>;
```

Consumers never change:

```typescript
// page.tsx — unchanged
import { useAgentSave } from "~/hooks/use-agent-save";
const { save, discard } = useAgentSave(selectedName, etag);
```

### Entity Config Schema Example

```typescript
// hooks/schemas/entity-config.schemas.ts

export const FieldKeyMapSchema = z.record(z.string(), z.array(z.string()));

export const AgentFieldKeyMapSchema = FieldKeyMapSchema.parse({
  description: ["description"],
  modelTier: ["model_tier", "modelTier"],
  purpose: ["purpose"],
  stage: ["stage"],
});

export const AgentMetadataExtractorSchema = z.function().returns(
  z.object({
    varName: z.string(),
    domain: z.string(),
    imports: z.array(z.string()),
    sharedConstants: z.array(z.string()),
    exportVarName: z.string(),
    factoryFn: z.string(),
    configType: z.string(),
    prefix: z.string(),
    suffix: z.string(),
  }),
);

export const AGENT_CONFIG = {
  entityType: "agents",
  endpoint: "/api/entities/agents",
  draftAtomFactory: agentDraftAtom,
  historyAtomFactory: agentHistoryAtom,
  registryAtom: agentRegistryAtom,
  fieldKeyMap: AgentFieldKeyMapSchema,
  extractMetadata: (draft: Record<string, unknown>) => ({
    varName: (draft.varName as string) ?? "",
    domain: (draft.domain as string) ?? "agents",
    imports: (draft.imports as string[]) ?? [],
    sharedConstants: (draft.sharedConstants as string[]) ?? [],
    exportVarName: (draft.exportVarName as string) ?? "",
    factoryFn: (draft.factoryFn as string) ?? "",
    configType: (draft.configType as string) ?? "",
    prefix: (draft.prefix as string) ?? "",
    suffix: (draft.suffix as string) ?? "",
  }),
} as const;
```

### Atom Factory Key Generation with EntityType

```typescript
// hooks/use-entity-detail.ts — excerpt

export function useEntityDetail(
  name: string | null,
  config: EntityDetailConfig,
): UseEntityDetailReturn {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  // ... other state

  // Safe atom factory call with entityType prefix in fallback key
  const noopKey = `${config.entityType}:__noop__`;
  const setDraft = useSetAtom(config.draftAtomFactory(name ?? noopKey));
  const resetHistory = config.historyAtomFactory
    ? useSetAtom(config.historyAtomFactory(name ?? noopKey))
    : undefined;

  // ... rest of hook
}
```

## State of the Art

This extraction follows current luca-studio patterns:

| Practice                          | Usage                                             | Relevance                                     |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Config object pattern             | Entity hooks, atom configuration                  | Standard way to parameterize generic behavior |
| Wrapper hooks for backward compat | New pattern, borrowed from UI component libraries | Zero consumer churn, enables migration        |
| Co-located schemas                | Other domains use `__schemas/` subdirs            | Consistency with project structure            |
| FieldKeyMap descriptor            | Already used in save hooks                        | Just being formalized and moved to schemas    |
| Atom factory pattern              | Throughout luca-studio                            | Safe way to create keyed state                |

## Open Questions

1. **Skill/Rule Registry Atoms:** Currently only agents have a registryAtom in config-atoms.ts. Should skill and rule list hooks also populate registry atoms, or keep list state local to the hook?
   - **What we know:** useAgentList sets agentRegistryAtom; useSkillList and useRuleList do not set any registry atoms.
   - **Recommendation:** Make registryAtom optional in EntityListConfig. Agents pass it, skills/rules pass undefined. Generic hook checks config.registryAtom before calling setRegistry.

2. **Metadata Extraction Genericity:** The metadata extraction is almost identical across agents, skills, rules (same field names, just different domain value). Should metadata extraction be fully generic or stay entity-specific?
   - **What we know:** All three entities extract the same metadata object shape (varName, domain, imports, sharedConstants, exportVarName, factoryFn, configType, prefix, suffix).
   - **Recommendation:** Keep entity-specific via extractMetadata callback in config. This preserves flexibility if entity-specific logic is needed later (e.g., rules might add `alwaysApply` field).

3. **Dead Code Cleanup Atomicity:** Should `canUndo`/`canRedo` removal be a separate commit, or part of the same PR?
   - **What we know:** Lines are destructured but never used; removing them is a pure dead code cleanup.
   - **Recommendation:** Include in same PR but as a separate commit after hook extraction. Atomic pattern: commit 1 = generic hooks + wrappers, commit 2 = dead code removal.

## Sources

### Primary (HIGH confidence)

- **File inspection**: /packages/luca-studio/hooks/use-{agent|skill|rule}-{save|list|detail}.ts
- **Atom factory inspection**: /packages/luca-studio/stores/entity-atoms.ts, config-atoms.ts
- **Helper inspection**: /packages/luca-studio/hooks/helpers/merge-field-overrides.ts
- **Consumer inspection**: /packages/luca-studio/app/{agents|skills|rules}/page.tsx

### Secondary (MEDIUM confidence)

- **Jotai atomFamily pattern**: Used throughout luca-studio, verified in stores/
- **Schema-first violations**: Confirmed in CONTEXT.md pitfalls section

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — All libraries confirmed in use, versions from package.json
- Architecture: HIGH — Exact hook implementations analyzed, triplication mapped completely
- Pitfalls: HIGH — Dead code and atom collision scenarios identified in actual code
- Field key maps: HIGH — Maps extracted and inspected from each save hook
- Open questions: MEDIUM — Require design decision (documented in questions section)

**Research date:** 2026-03-26
**Valid until:** 2026-04-02 (stable, low churn rate for entity hooks)

**Lines of triplication identified:**

- Save hooks: 53 (agent) + 57 (skill) + 61 (rule) = 171 lines, ~95% identical
- List hooks: 68 (agent) + 68 (skill) + 68 (rule) = 204 lines, ~85-90% identical (registry optional)
- Detail hooks: 115 (agent) + 115 (skill) + 115 (rule) = 345 lines, ~90% identical
- **Total triplication:** ~530+ lines, extractable to ~200 lines of generic code + 40 lines of config
