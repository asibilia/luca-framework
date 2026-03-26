# Phase 202: Studio W7 Pages & Consolidation - Research

**Researched:** 2026-03-25
**Domain:** Next.js App Router pages, Jotai state management, entity editor pattern
**Confidence:** HIGH

## Summary

This research examines the existing Luca Studio codebase to understand the patterns and infrastructure already in place for building new pages and consolidating existing ones. The codebase has a mature, well-established entity editor pattern (the Agents page) that serves as a direct template for the Skills and Rules pages. The Config page needs a tab-based section editor. The Home page and Memory page already exist but may benefit from enhancement. The "Edit vs Observe mode" distinction maps to the existing `layoutContextAtom` system.

The key finding is that the infrastructure is almost entirely in place: API routes, draft/history atoms, dirty tracking, shared components (EntityTree, SaveBar, ResizableSplit, TabContainer pattern), and route handlers all exist. The work is primarily assembly and wiring, not invention.

**Primary recommendation:** Clone the agents page pattern verbatim for skills and rules pages, using existing API routes and atom families. For config, build a tabbed editor reusing `useConfigHydration` and existing config section PUT routes. Memory consolidation means adding tab navigation to the existing Memory page to surface standalone sub-pages (entities, knowledge-graph, contradictions, learning, vault, semantic-search) as tabs or sub-nav within the memory section.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                | Version | Purpose                       | Why Standard                         |
| ---------------------- | ------- | ----------------------------- | ------------------------------------ |
| Next.js (App Router)   | 15.x    | Page routing, API routes      | Already configured in luca-studio    |
| Jotai                  | 2.x     | Atom-based state management   | Three-layer architecture established |
| jotai-history          | latest  | Undo/redo for draft atoms     | Already wired for all entity types   |
| radix-ui               | latest  | Tabs, context menu primitives | Used by existing Tabs, EntityTree    |
| react-resizable-panels | 4.x     | Split pane layout             | Used by agent page ResizableSplit    |
| lucide-react           | latest  | Icon library                  | Used throughout all pages            |

### Supporting

| Library                  | Version | Purpose                   | When to Use                 |
| ------------------------ | ------- | ------------------------- | --------------------------- |
| class-variance-authority | latest  | Variant styling           | Tabs component variants     |
| lodash                   | latest  | groupBy, etc.             | EntityTree grouping         |
| zod                      | 3.x     | Config section validation | Config page form validation |

### Alternatives Considered

| Instead of       | Could Use                 | Tradeoff                                      |
| ---------------- | ------------------------- | --------------------------------------------- |
| Jotai atomFamily | Zustand per-entity stores | Would break existing three-layer architecture |
| radix-ui Tabs    | Custom tabs               | Would lose accessibility and animation        |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Entity Editor Page Pattern (Reference: agents/page.tsx)

The canonical pattern for entity browser pages has 7 distinct layers:

```
Page (page.tsx)
  |-- useEffect -> setLayoutContext("editor") on mount, revert on unmount
  |-- useEntityList() -> fetch list, populate registry atom
  |-- useEntityDetail(selectedName) -> fetch detail, populate draft atom, reset history
  |-- useUndo(entityHistoryAtom(selectedName)) -> keyboard shortcuts
  |-- useEntitySave(selectedName, etag) -> save/discard callbacks
  |-- useEffect -> Cmd+S keyboard shortcut
  |
  +-- ResizableSplit (horizontal, 20/80)
       |-- Left: EntityTree (entities, selectedName, onSelect)
       +-- Right: TabContainer (name, detail) + SaveBar (onSave, onDiscard, entityFilter)
```

### Three-Layer Atom Architecture

```
Layer 1: Server State (config-atoms.ts)
  - configAtom, agentRegistryAtom, routingTableAtom, stateAtom
  - Read-only mirrors of server data
  - Populated by fetch hooks

Layer 2: Entity Drafts (entity-atoms.ts)
  - agentDraftAtom(name), skillDraftAtom(name), ruleDraftAtom(name)
  - atomFamily creates independent atoms per entity name
  - History wrappers: agentHistoryAtom, skillHistoryAtom, ruleHistoryAtom

Layer 3: Dirty Tracking (dirty-tracking.ts)
  - dirtySetAtom: Set<string> of entity keys with changes
  - Key convention: "agent:<name>", "skill:<name>", "rule:<name>"
  - canSaveAtom: derived boolean (dirty + no validation errors)
  - markDirtyAtom, markCleanAtom: write helpers
```

### API Route Pattern

Entity routes use shared factory functions from `entity-route-helpers.ts`:

```
GET /api/entities/{domain}         -> createEntityListHandler(domain)
GET /api/entities/{domain}/[name]  -> createEntityDetailHandler(domain).GET
PUT /api/entities/{domain}/[name]  -> createEntityDetailHandler(domain).PUT
```

All three domains (agents, skills, rules) already have both list and detail routes.

Config section routes use `config-section-handler.ts`:

```
PUT /api/config/{section}  -> createConfigSectionHandler({ section, schema, semanticValidators })
```

Six sections exist: workflow, gates, harness, complexity, lu, planner.

### Recommended Project Structure for New Pages

```
app/skills/page.tsx          # Clone of agents/page.tsx with skill-specific atoms
app/rules/page.tsx           # Clone of agents/page.tsx with rule-specific atoms
app/config/page.tsx          # Tabbed editor with section sub-tabs

components/skills/
  skill-tab-container.tsx    # Clone of agent-tab-container.tsx
  skill-config-form.tsx      # Skill-specific form fields

components/rules/
  rule-tab-container.tsx     # Clone of agent-tab-container.tsx
  rule-config-form.tsx       # Rule-specific form fields

components/config/
  config-tab-container.tsx   # Top-level tabs: Complexity, Gates, Harness, etc.
  complexity-editor.tsx      # Section editor
  gates-editor.tsx           # Section editor
  harness-editor.tsx         # Section editor

hooks/
  use-skill-list.ts          # Clone of use-agent-list.ts for skills
  use-skill-detail.ts        # Clone of use-agent-detail.ts for skills
  use-skill-save.ts          # Clone of use-agent-save.ts for skills
  use-rule-list.ts           # Clone of use-agent-list.ts for rules
  use-rule-detail.ts         # Clone of use-agent-detail.ts for rules
  use-rule-save.ts           # Clone of use-agent-save.ts for rules
```

### Anti-Patterns to Avoid

- **Building new state management**: Use existing Jotai atoms and dirty tracking. Do NOT create parallel state systems.
- **Skipping EntityTree reuse**: EntityTree already supports all three entity types via the `type` field. Do NOT build separate tree components.
- **Custom API routes for skills/rules**: Routes already exist via createEntityListHandler/createEntityDetailHandler. Do NOT build new route infrastructure.
- **Forgetting layoutContext**: Entity editor pages MUST set layoutContext to "editor" on mount and revert on unmount for proper NavRail behavior.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                | Don't Build             | Use Instead                        | Why                                                                |
| ---------------------- | ----------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Entity list fetching   | Custom fetch logic      | Clone `useAgentList` pattern       | Handles loading/error/refresh/registry population                  |
| Entity detail + draft  | Custom state management | Clone `useAgentDetail` pattern     | Handles ETag, draft atom, history reset, stale-fetch guard         |
| Save with concurrency  | Custom save logic       | Clone `useAgentSave` pattern       | Handles mergeFieldOverrides, ETag If-Match, dirty tracking         |
| Undo/redo              | Custom undo stack       | `useUndo(entityHistoryAtom(name))` | Already wired with keyboard shortcuts for all entity types         |
| Entity tree sidebar    | Custom list component   | `EntityTree` component             | Handles grouping, filtering, dirty dots, context menus             |
| Save/discard bar       | Custom save UI          | `SaveBar` component                | Handles dirty/saving/saved/error states, entity filter prefix      |
| Split pane layout      | Custom resize           | `ResizableSplit` component         | Uses react-resizable-panels v4 with consistent styling             |
| Config section PUT     | Custom write logic      | `createConfigSectionHandler`       | Handles ETag, schema validation, semantic validation, atomic write |
| Config section schemas | Custom Zod schemas      | `config-section-schemas.ts`        | All six schemas already defined                                    |

**Key insight:** The agents page took significant effort to build correctly (ETag concurrency, three-layer atoms, field merge, dirty tracking, undo/redo). Skills and rules pages should clone this pattern -- not rebuild it. The infrastructure cost was already paid.

## Common Pitfalls

### Pitfall 1: Forgetting to Reset History on Entity Selection Change

**What goes wrong:** User selects a new entity, but undo history contains states from the previous entity.
**Why it happens:** `useAgentDetail` calls `resetHistory(RESET)` after populating the draft from the server. If this is omitted, the old undo stack persists.
**How to avoid:** Every detail hook MUST call `resetHistory(RESET)` after setting the draft atom from the server response.
**Warning signs:** Cmd+Z reverts to a completely different entity's state.

### Pitfall 2: Stale Fetch Updates After Entity Switch

**What goes wrong:** User rapidly switches entities. A slow response from entity A arrives after entity B is selected, overwriting B's draft with A's data.
**Why it happens:** Async fetch completes for the wrong entity.
**How to avoid:** Use the `nameRef` pattern from `useAgentDetail` -- check `nameRef.current === name` before applying any state updates from the fetch callback.
**Warning signs:** Selecting entities quickly causes wrong data to appear.

### Pitfall 3: Missing entityFilter on SaveBar

**What goes wrong:** The save bar shows dirty count from all entity types, not just the current page.
**Why it happens:** `SaveBar` without `entityFilter` shows all dirty entities.
**How to avoid:** Always pass `entityFilter="skill:"` (or `"rule:"`) on entity-specific pages.
**Warning signs:** Save bar shows "3 unsaved changes" when only 1 entity was edited on this page.

### Pitfall 4: layoutContext Not Reverted on Unmount

**What goes wrong:** Navigating away from an editor page leaves the NavRail collapsed.
**Why it happens:** `setLayoutContext("editor")` collapses the NavRail but the cleanup function to revert to "dashboard" was omitted.
**How to avoid:** Always use the cleanup pattern:

```tsx
useEffect(() => {
  setLayoutContext("editor");
  return () => setLayoutContext("dashboard");
}, [setLayoutContext]);
```

**Warning signs:** NavRail stays collapsed after navigating back to the Home page.

### Pitfall 5: Config Page Writes Without ETag

**What goes wrong:** Config saves fail with 428 (Precondition Required) or silently overwrite concurrent changes.
**Why it happens:** Config section PUT routes require `If-Match` header.
**How to avoid:** Use `configEtagAtom` from `config-atoms.ts` and include it in PUT requests. After successful writes, update the ETag atom with the response's ETag header.
**Warning signs:** "If-Match header is required" error from the API.

### Pitfall 6: Rule Directory Structure Differs From Agents/Skills

**What goes wrong:** Rules page EntityTree doesn't show the correct directory grouping.
**Why it happens:** Rules use `general/` and `profiles/` (with nested subdirectories like `profiles/typescript/`, `profiles/go/`). The `filePath` parsing for directory extraction needs different logic than agents/skills which use `general/` and `luca/`.
**How to avoid:** When building the directory string for EntityTree items, handle the rules domain path structure: the relevant directory is the part between `rules/` and the filename, potentially multi-level (e.g., `profiles/typescript/`).
**Warning signs:** All rules appear under "unknown/" or all under a single "profiles/" group.

## Code Examples

Verified patterns from the actual codebase:

### Entity List Hook (use-agent-list.ts -- clone for skills/rules)

```typescript
// Source: packages/luca-studio/hooks/use-agent-list.ts
export function useSkillList(): UseSkillListReturn {
  const [skills, setSkills] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entities/skills");
      if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`);
      const json = (await res.json()) as { data: EntitySummary[] };
      setSkills(json.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load skill list";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);
  return { skills, loading, error, refresh: fetchSkills };
}
```

### Entity Detail Hook Pattern (use-agent-detail.ts -- clone for skills/rules)

```typescript
// Source: packages/luca-studio/hooks/use-agent-detail.ts
// Key pattern: nameRef guard for stale fetch prevention
const nameRef = useRef(name);
nameRef.current = name;

// After fetch success:
if (nameRef.current === name) {
  setDetail(json.data);
  setEtag(etagHeader);
  setDraft({
    ...json.data.metadata,
    rawConfigText: json.data.rawConfigText,
    name: json.data.name,
    domain: json.data.domain,
  } as Record<string, unknown>);
  resetHistory(RESET); // Critical: reset undo stack
}
```

### Entity Page Composition (agents/page.tsx -- clone for skills/rules)

```typescript
// Source: packages/luca-studio/app/agents/page.tsx
// The complete wiring pattern for an entity editor page:
const [selectedName, setSelectedName] = useState<string | null>(null);
const setLayoutContext = useSetAtom(layoutContextAtom);
useEffect(() => {
  setLayoutContext("editor");
  return () => setLayoutContext("dashboard");
}, [setLayoutContext]);

const { agents, loading: listLoading } = useAgentList();
const { detail, loading: detailLoading, etag } = useAgentDetail(selectedName);
const { canUndo, canRedo, undo, redo } = useUndo(
  agentHistoryAtom(selectedName ?? "__noop__"),
);
const { save, discard } = useAgentSave(selectedName, etag);
```

### Config Section Editor Pattern

```typescript
// Pattern for config page: read full config, render section forms, save per-section
// useConfigHydration populates configAtom and configEtagAtom on mount
// Each tab's form reads from configDraftAtom and writes via PUT /api/config/{section}

// Config section PUT (existing pattern from config-section-handler.ts):
// 1. Schema validate body
// 2. Semantic validate (optional)
// 3. Read current config.json
// 4. If-Match ETag check
// 5. Replace section key
// 6. Atomic write full config.json
// 7. Return fresh ETag
```

### Directory Extraction for EntityTree Items

```typescript
// For agents/skills: subdirs are general/ and luca/
const pathParts = entity.filePath.split("/");
const srcIdx = pathParts.indexOf("agents"); // or "skills"
const directory =
  srcIdx >= 0 && srcIdx + 1 < pathParts.length
    ? `${pathParts[srcIdx + 1]}/`
    : "unknown/";

// For rules: subdirs are general/ and profiles/{profile}/
// Need to extract potentially two levels: "profiles/typescript/"
const srcIdx = pathParts.indexOf("rules");
if (srcIdx >= 0) {
  const subdir = pathParts[srcIdx + 1]; // "general" or "profiles"
  if (subdir === "profiles" && srcIdx + 2 < pathParts.length) {
    directory = `profiles/${pathParts[srcIdx + 2]}/`;
  } else {
    directory = `${subdir}/`;
  }
}
```

## State of the Art

| Old Approach             | Current Approach                                  | When Changed                  | Impact                                                           |
| ------------------------ | ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| PageContainer everywhere | ResizableSplit for editor pages                   | Phase 200 (agents page)       | Editor pages use split layout, dashboard pages use PageContainer |
| No undo/redo             | jotai-history withHistory                         | Phase 201 (W7 infrastructure) | All entity types have draft + history atoms pre-wired            |
| Manual dirty tracking    | dirtySetAtom + canSaveAtom                        | Phase 200                     | Centralized dirty state with entity key convention               |
| Custom API per entity    | createEntityListHandler/createEntityDetailHandler | Phase 200                     | All three entity domains share identical route logic             |
| No concurrency control   | ETag-based If-Match                               | Phase 200                     | Both entity and config writes require ETag headers               |

**Deprecated/outdated:**

- **NAV_ITEMS**: Deprecated flat array, use NAV_GROUPS instead for grouped rendering
- **PageContainer for editor pages**: Editor pages should use ResizableSplit with layoutContext="editor"

## Open Questions

Things that couldn't be fully resolved:

1. **Memory Page Consolidation Scope**
   - What we know: Memory page exists with 6 sections. Standalone pages exist for contradictions, entities, knowledge-graph, learning, vault, semantic-search.
   - What's unclear: Should these become tabs within the Memory page, or should they remain separate pages with the Memory page acting as a hub? The NAV_GROUPS only has `/memory` in OBSERVE but the standalone pages are not in the nav at all.
   - Recommendation: Add a tab bar to the Memory page with tabs like "Overview | Entities | Graph | Learning | Contradictions | Vault | Search". Each tab renders the existing page content but within the Memory page layout. Standalone routes can remain for deep-linking but redirect focus.

2. **Edit vs Observe Mode Distinction**
   - What we know: `layoutContextAtom` has "dashboard" | "editor" | "browser" modes. The agents page uses "editor" mode.
   - What's unclear: The exact UX distinction between edit mode (NavRail collapsed, full bleed) and observe mode (NavRail expanded, centered content) for pages that support both.
   - Recommendation: Entity editor pages (agents, skills, rules) use "editor" mode. All other pages use "dashboard" mode. The config page should use "dashboard" mode since it's primarily form-based, not a split-pane editor.

3. **Skill and Rule Config Forms: What Fields to Surface**
   - What we know: Skills and rules have different config shapes than agents. Skills have trigger patterns, argument schemas, execution modes. Rules have glob patterns, enforcement levels, profiles.
   - What's unclear: Exactly which fields to extract from rawConfigText for the structured form.
   - Recommendation: Start with a simpler form than agents (just description + enabled toggle + metadata display), plus full rawConfigText in the Source tab. More form fields can be added incrementally.

4. **mergeFieldOverrides Extraction**
   - What we know: `mergeFieldOverrides` in `use-agent-save.ts` is agent-specific (references FIELD_KEY_MAP with agent config keys).
   - What's unclear: Whether to extract a generic version or create skill/rule-specific versions.
   - Recommendation: Create separate `mergeFieldOverrides` functions in each entity's save hook. The field key maps differ per entity type, so a generic version adds complexity without benefit.

## Sources

### Primary (HIGH confidence)

- `packages/luca-studio/app/agents/page.tsx` -- Full reference implementation for entity editor pages
- `packages/luca-studio/hooks/use-agent-*.ts` -- Hook patterns for list/detail/save
- `packages/luca-studio/stores/entity-atoms.ts` -- Draft and history atom families for all entity types
- `packages/luca-studio/stores/dirty-tracking.ts` -- Entity key conventions and dirty state management
- `packages/luca-studio/lib/entity-route-helpers.ts` -- Shared route factory with DOMAIN_CONFIG for all three entity types
- `packages/luca-studio/app/api/entities/*/route.ts` -- All six route files (list + detail for agents, skills, rules)
- `packages/luca-studio/lib/config-section-handler.ts` -- Config section PUT route factory
- `packages/luca-studio/lib/config-section-schemas.ts` -- All six config section Zod schemas
- `packages/luca-studio/components/editor/entity-tree.tsx` -- Shared EntityTree supporting agent/skill/rule types
- `packages/luca-studio/components/feedback/save-bar.tsx` -- Shared SaveBar with entity prefix filtering
- `packages/luca-studio/lib/constants.ts` -- NAV_GROUPS with existing routes for skills, rules, config

### Secondary (MEDIUM confidence)

- `packages/luca-studio/app/memory/page.tsx` -- Current memory page structure (6 sections)
- `packages/luca-studio/app/page.tsx` -- Current home page structure
- `packages/luca-studio/app/config/page.tsx` -- Current config stub
- `packages/luca-studio/stores/layout.ts` -- layoutContextAtom and LayoutContext types

### Tertiary (LOW confidence)

- Memory consolidation approach (tab-based vs hub-and-spoke) -- no explicit user decisions documented

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already installed and used
- Architecture: HIGH -- patterns verified directly from source code
- Pitfalls: HIGH -- identified from actual implementation details
- Memory consolidation: MEDIUM -- approach not explicitly decided by user

**Research date:** 2026-03-25
**Valid until:** 2026-04-24 (stable codebase, patterns well established)
