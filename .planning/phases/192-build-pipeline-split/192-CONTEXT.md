# Phase 192 — Build Pipeline Split: Context

## Decision Summary

### 1. build:compile strategy [researched]

**Decision:** Create `scripts/build-compile.ts` that:

1. Calls `generateAllOutputs()` from build-shared.ts (existing, returns Map<string, string>)
2. Pipes the Map through `transformOutputsToTemplates()` from Phase 191
3. Writes the transformed output to `packages/luca-framework/templates/harness/claude/`

**Rationale:** Reuses existing compilation infrastructure. The only new logic is piping the output through the transform and writing to the template directory instead of .claude/.

### 2. build:deploy strategy [researched]

**Decision:** Create `scripts/build-deploy.ts` that:

1. Reads template files from `packages/luca-framework/templates/harness/claude/`
2. Reads branding config from `.planning/config.json` (branding section)
3. Resolves EJS content: `<%= branding.commandPrefix %>` → `lu`, etc.
4. Resolves filenames: `__branding.commandPrefix__-router.md` → `lu-router.md`
5. Resolves dirnames: `__branding.commandPrefix__/` → `lu/`
6. Writes resolved output to `.claude/` (same structure as current build:all)
7. Also handles: settings.json merge, hook chmod, build manifest

**Note:** The EJS resolution logic is simple string replacement using the branding object from config.json. No actual EJS engine needed — just replace `<%= branding.X %>` patterns.

### 3. Shared resolution module [researched]

**Decision:** Create `scripts/resolve-templates.ts` with a `resolveTemplates(templateDir, branding)` function that handles EJS content resolution + filename/dirname resolution. This will be imported by both build-deploy.ts (Phase 192) and later shared with luca init (Phase 193).

### 4. build:all backward compat [researched]

**Decision:** Modify `scripts/build-all.ts` to call build:compile then build:deploy sequentially. Keep existing session lock guard, dist/plugin output, and summary reporting. The compile step replaces the current "write to .claude/" logic; the deploy step writes the final output.

**Important:** dist/plugin/ output continues to use the existing direct-write path (no EJS templates needed for plugin distribution — those files are always lu-branded).

### 5. copy-harness-templates.ts interaction [researched]

**Decision:** In this phase, copy-harness-templates.ts continues to exist but becomes redundant — build:compile now writes directly to templates/harness/claude/ with correct branding. copy-harness-templates.ts removal is deferred to Phase 194.

## Scope Guardrail

This phase creates:

1. `scripts/build-compile.ts` — compile pipeline
2. `scripts/build-deploy.ts` — deploy pipeline
3. `scripts/resolve-templates.ts` — shared EJS resolution
4. Modifies `scripts/build-all.ts` — chains compile + deploy
5. Modifies `package.json` — adds build:compile and build:deploy scripts

Does NOT touch:

- src/compilers/ (Phase 191 deliverable, stable)
- packages/luca-framework/src/commands/init.ts (Phase 193)
- scripts/copy-harness-templates.ts (Phase 194)
