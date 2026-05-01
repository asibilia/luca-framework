# Architecture

## Dependency layers

```
┌─────────────────────────────────────────────────────────┐
│  launch.ts  (orchestrator — wires everything together)  │
├────────────────────────┬────────────────────────────────┤
│  orchestration/        │  analysis/                     │
│  - pipeline-guard      │  - postmortem                  │
│  - context-refresher   │  - phase-diff                  │
│  - pipeline-tui        │  - retro                       │
│  - continuation-msgs   │                                │
│  - read-only-enforce   │                                │
│  - upstream-patches    │                                │
├────────────────────────┴────────────────────────────────┤
│  modes/  (10 mode definitions)                          │
│  subagents/  (10 subagent definitions)                  │
├─────────────────────────────────────────────────────────┤
│  tools/  (16 tool wrappers + permission system)         │
│  - build-mode-tools.ts   (tool registry)                │
│  - mode-permissions.ts   (per-mode access matrix)       │
│  - create-scoped-tool.ts (action-level restriction)     │
├─────────────────────────────────────────────────────────┤
│  state/  (pure data models, schemas, persistence)       │
│  review-analysis/  (PR review primitives)               │
│  rule-engine/  (rule discovery + execution)             │
├─────────────────────────────────────────────────────────┤
│  constants/  (mode-ids)                                 │
│  util/  (atomic-write, refs, token-budget, tui-text)    │
│  integration/  (branding, config, model-routing)        │
└─────────────────────────────────────────────────────────┘
```

**Import rules:**
- Lower layers never import from higher layers
- `tools/` → `state/` ✓ (tool wrappers call data layer functions)
- `tools/` → `constants/` ✓ (mode-ids for permission keys)
- `modes/` → `state/`, `constants/`, `integration/` ✓
- `orchestration/` → `state/`, `tools/`, `constants/` ✓
- No circular dependencies between layers

## mode-ids.ts: the shared hub

`src/constants/mode-ids.ts` defines all pipeline mode IDs as a `const` object. It is imported by **15 files** across modes, tools, and orchestration. It imports nothing, making it a safe leaf dependency.

```typescript
export const MODES = {
    discuss: 'luca:discuss',
    triage: 'luca:1-triage',
    research: 'luca:2-research',
    architect: 'luca:3-architect',
    execute: 'luca:4-execute',
    review: 'luca:5-review',
    finalize: 'luca:6-finalize',
} as const
```

## Tool registry + permission system

Two files work together to manage tool access per mode:

**`tools/build-mode-tools.ts`** — The `TOOL_REGISTRY` maps snake_case manifest keys to tool instances and camelCase record keys. `buildModeTools({ mode_id })` reads from the registry and applies per-mode permission scoping.

**`tools/mode-permissions.ts`** — The `MODE_PERMISSIONS` matrix defines which tools each mode receives and which actions are allowed. `'*'` means full access; an array restricts to specific actions.

These two files must be kept in sync: every key in `MODE_PERMISSIONS` must have a corresponding entry in `TOOL_REGISTRY`, and vice versa. `buildModeTools()` throws at startup if a permission references an unknown tool.

## Model resolution pipeline

1. Each mode file exports a `resolve<Mode>Model()` function
2. `launch.ts` builds `PIPELINE_MODE_MODEL_RESOLVERS` — a map from mode ID to resolver
3. On mode change, the harness calls `switchModel()` with the resolved model ID
4. `integration/model-routing.ts` maps complexity tiers to model names for subagents
5. `integration/mastracode-config.ts` resolves model packs from upstream settings

## Upstream patches

`orchestration/upstream-patches.ts` contains monkey-patches for known mastracode bugs. All patches are defensive — they log warnings and no-op if upstream changes shape. Current patches:

1. **ask_user label truncation** — Prevents pi-tui width assertion crashes from long option labels
2. **Double-slash autocomplete** — Strips duplicate `/` prefix from custom slash command names
3. **Model-pack-on-login** — Re-applies the user's active model pack after login resets to provider default

## Key design decisions

**File-based state over harness state.** Luca stores workflow state in `.planning/luca-state.json` rather than `harness.setState()` because the built-in Zod `stateSchema` uses strip mode, which silently removes unknown keys.

**Mutable refs for circular dependency breaking.** `util/refs.ts` holds mutable `{ current: ... }` refs that are wired up after `createMastraCode()` returns. This avoids circular imports between the harness (which creates refs) and tools/modes (which consume them).

**Read-only enforcement via workspace patching.** The `permissionRules` + `yolo: false` approach doesn't work because `yolo=true` (default) bypasses tool approval entirely. The only reliable mechanism is `Workspace.setToolsConfig({ enabled: false })` which removes tools from the AI SDK toolset.
