# Phase 167 Context: Hooks Directory Consolidation

## Decision 1: Target Structure [researched]

**Decision:** Consolidate to the standard domain architecture pattern:

```
src/hooks/
├── __schemas/
│   ├── hook.schemas.ts (existing)
│   └── adapter.schemas.ts (moved from adapters/)
├── __helpers/
│   ├── hook-registry.ts, config-generators.ts, portable-hook.ts, platform-adapters.ts (existing)
│   ├── bridge.ts, vault.ts, muninn.ts, hook-io.ts (moved from impl/__helpers/)
│   ├── claude-adapter.ts, adapter-registry.ts (moved from adapters/)
│   └── generate-shell-wrappers.ts (NEW)
├── scripts/
│   └── *.ts (15 hook implementations, moved from impl/)
└── index.ts
```

## Decision 2: File Move Strategy [researched]

**Decision:** Use `git mv` for all file moves to preserve history. Update import paths after each move group.

### Move Groups (3 waves):

1. **Wave 1:** Move 4 helper files from `impl/__helpers/` to `__helpers/`
2. **Wave 2:** Move 3 adapter files from `adapters/` to `__schemas/` and `__helpers/`
3. **Wave 3:** Move 15 TS implementations from `impl/` to `scripts/`, delete .sh shims + impl/ + adapters/

## Decision 3: Import Path Updates [researched]

**Decision:** After moving files:

- Hook implementations: `./__helpers/...` → `../__helpers/...` (moving from impl/ to scripts/ changes the relative path)
- Helpers that import from each other: paths stay same (they remain in `__helpers/`)
- Barrel (`index.ts`): update paths for moved adapter exports

## Decision 4: Shell Wrapper Generator [researched]

**Decision:** Create `generate-shell-wrappers.ts` in `__helpers/` that:

1. Reads `canonicalHookRegistry` from hook-registry.ts
2. For each registered hook, generates a `.sh` wrapper: `exec bun "$(dirname "$0")/../../scripts/{hook-name}.ts" "$@" <&0`
3. Called by `build-shared.ts` `generateHookOutputs()` instead of copying existing .sh files
4. Writes wrappers to the `.claude/hooks/` output directory

## Decision 5: CLAUDE_EVENT_MAP Deduplication [researched]

**Decision:** Keep the canonical `CLAUDE_EVENT_MAP` in `platform-adapters.ts` (existing location). Remove the duplicate from `claude.adapter.ts` and import from platform-adapters instead. The adapter.ts file should delegate to the shared map.

## Decision 6: hook-registry.ts Script Fields [researched]

**Decision:** Change the `script` field in each registry entry from `.sh` extension to `.ts` extension. The shell wrapper generator uses the `.ts` script name to construct the wrapper path.

## Decision 7: build:all Timing [researched]

**Decision:** Same constraint as previous phases — do NOT run `bun run build:all` during Claude Code session. The wrapper generator will be tested via `bunx --bun tsc --noEmit` for type correctness. User runs `bun run build:all` after this phase.

## Scope

- 15 files moved from `impl/` to `scripts/`
- 4 files moved from `impl/__helpers/` to `__helpers/`
- 3 files moved from `adapters/` to `__schemas/` and `__helpers/`
- 1 new file: `generate-shell-wrappers.ts`
- ~20 files with import path updates
- 15 `.sh` shims deleted
- `impl/` and `adapters/` directories deleted

## Verification

- `bunx --bun tsc --noEmit` — all imports resolve after moves
- No `impl/` or `adapters/` directories remain in `src/hooks/`
- `generate-shell-wrappers.ts` compiles and exports the generator function
- hook-registry.ts entries reference `.ts` scripts
