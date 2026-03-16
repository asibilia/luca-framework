# Phase 159 Context: Remove Non-Claude Platform Compilation

## Decision 1: Output Directory Deletion Strategy [researched]

**Decision:** Delete `.cursor/`, `.pi/`, `.qwen/` directories entirely via `git rm -r`. Then add them to `.gitignore` to prevent accidental re-creation. The user has fully committed to Claude Code as the sole platform.

**Rationale:** These directories are git-tracked generated output. `git rm -r` removes them from tracking and the working tree simultaneously. Adding to `.gitignore` prevents future `bun run build:all` from recreating them if any build script residue remains.

## Decision 2: Wave Structure [researched]

**Decision:** Single plan with 5 sequential waves matching the architect's recommended ordering:

- **Wave 1 (T3 deletions):** Delete output directories, adapter files, pi-extensions directory
- **Wave 2 (T2 factory changes):** Remove `toCursorFormat()`/`toPiFormat()` from `create-agent.ts`, `create-skill.ts`, `create-rule.ts` and their schema files
- **Wave 3 (T0 shared cleanup):** Remove `toCursorFormat()` from `src/shared/__helpers/format.ts` and `src/shared/index.ts` barrel
- **Wave 4 (build pipeline):** Update `scripts/build-all.ts`, `scripts/check-drift.ts`, compiler helpers, adapter registry/schemas/barrel
- **Wave 5 (content sweep):** Grep-and-update all remaining references in `src/rules/`, `docs/`, `CLAUDE.md`, config, interop scanners

**Rationale:** T0+T2 changes must happen in coordinated fashion (no partial build breaks). Sequential waves ensure typecheck passes after each wave.

## Decision 3: Interop Scanner Updates [researched]

**Decision:** Update `src/interop/__helpers/` scanner and normalizer to only check `.claude/` paths. Remove `.cursor/` and `.pi/` path patterns from scanning logic.

## Decision 4: Documentation Scope [researched]

**Decision:** Comprehensive single-pass sweep in Wave 5. Grep for `.cursor/|\.pi/|toCursorFormat|toPiFormat|cursor\.adapter|pi\.adapter|\.qwen/|three platform|cross-platform compilation|Cursor IDE` across all remaining files. Update or remove all references.

Key docs to update:

- `docs/generation-system.md` — directory tree and compilation pipeline
- `docs/agent-framework/` — cross-platform references
- `.claude/rules/hook-skill-boundary.md` — remove "Both platforms" references
- `.claude/rules/domain-architecture.md` — remove `.cursor/`, `.pi/` compilation mentions
- `CLAUDE.md` — update generated file references

## Decision 5: build:all Timing [researched]

**Decision:** The executor MUST NOT run `bun run build:all` during the Claude Code session (crashes CC per critical memory note). Instead:

- Make all source changes and verify with `bunx --bun tsc --noEmit`
- Note in SUMMARY.md that `bun run build:all` must be run manually by the user after this phase
- The user will run it between sessions

## Decision 6: Config Updates [researched]

**Decision:** Update `.planning/config.json` to remove `dogfood.outputs` entries for `.cursor/` and `.pi/`. Update any hook configuration that references cursor/pi adapters.

## Scope Exclusion

- Do NOT modify files in `packages/luca-observer/` (observer is isolated, no platform-specific code)
- Do NOT create new functionality — this is purely a deletion/cleanup phase

## Files to Delete

- `.cursor/` directory (entire tree)
- `.pi/` directory (entire tree)
- `.qwen/` directory (entire tree)
- `src/hooks/adapters/cursor.adapter.ts`
- `src/hooks/adapters/pi.adapter.ts`
- `src/hooks/pi-extensions/` directory (entire tree)

## Files to Modify

### T2 Entity Factories

- `src/agents/__helpers/create-agent.ts`
- `src/skills/__helpers/create-skill.ts`
- `src/rules/__helpers/create-rule.ts`

### T2 Entity Schemas (if they reference format types)

- `src/agents/__schemas/agent.schemas.ts`
- `src/skills/__schemas/skill.schemas.ts`
- `src/rules/__schemas/rule.schemas.ts`

### T0 Shared

- `src/shared/__helpers/format.ts`
- `src/shared/index.ts`

### T3 Compilers

- `src/compilers/__helpers/compile.ts`
- `src/compilers/__helpers/plugin-registry.ts`
- `src/compilers/__helpers/parity.ts`
- `src/compilers/__schemas/compilers.schemas.ts`

### T3 Hooks

- `src/hooks/adapters/adapter-registry.ts`
- `src/hooks/adapters/adapter.schemas.ts`
- `src/hooks/adapters/index.ts`

### Build Scripts

- `scripts/build-all.ts`
- `scripts/check-drift.ts`

### Config

- `.planning/config.json`

### Documentation + Rules

- Multiple files (grep sweep in Wave 5)

## Verification

- `bunx --bun tsc --noEmit` after each wave
- `grep -r '.cursor/\|\.pi/\|toCursorFormat\|toPiFormat' src/` returns no matches after Wave 5
- `bun run check:drift` validates only `.claude/` output remains
