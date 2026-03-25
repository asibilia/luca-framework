# Phase 2: W2 Dependencies + Atom Model — Context

## Decisions

### 1. Dependency Installation [straightforward]

**Decision:** Install all packages into `packages/luca-studio` via `bun add`. Verify each import resolves. Check bundle size delta.

Packages: @codemirror/view, @codemirror/lang-markdown, @codemirror/theme-one-dark, shiki, jotai-history, chokidar, react-resizable-panels. Check if elkjs/dagre already present for React Flow auto-layout.

### 2. Jotai Atom Model Architecture [from brainstorm]

**Decision:** Follow the three-layer architecture from `docs/brainstorm/observer-studio-rework/4.technical-architecture.md`:

- **Layer 1 (Server State):** Read-only atoms populated from GET endpoints (`configAtom`, `agentRegistryAtom`, `stateAtom`)
- **Layer 2 (Draft State):** Writable copies via `atomFamily` for per-entity editing (`configDraftAtom`, `agentDraftAtom(name)`)
- **Layer 3 (Dirty Tracking):** `dirtySetAtom` (Set<string>), `canSaveAtom` (derived), `validationErrorsAtom` (Map<string, ZodError[]>)

Use `atomFamily` for independent per-entity atom trees. Build on existing `packages/luca-studio/stores/vault.ts` patterns.

### 3. File Organization [straightforward]

**Decision:** New files in `packages/luca-studio/stores/`:

- `config-atoms.ts` — Server + draft atoms for config
- `entity-atoms.ts` — atomFamily-based per-entity atoms
- `dirty-tracking.ts` — Layer 3 dirty set, canSave, validation errors

## Phase Constraints

- Dependencies must install before atom model (jotai-history needed for atomFamily patterns)
- All work within packages/luca-studio/ — no src/ changes
- Verify with `bun install` and `bunx --bun tsc --noEmit`
