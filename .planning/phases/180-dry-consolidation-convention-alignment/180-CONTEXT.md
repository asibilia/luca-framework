# Phase 180: DRY Consolidation & Convention Alignment — Context

## Phase Goal

Eliminate code duplication, align with project conventions (Bun APIs, Zod schema-first, lodash), reduce complexity in large functions.

## Decisions

### 1. Extract Target Organization [researched]

**resolveMuninndbPort()** → Add to existing `packages/luca-framework/src/utils/muninndb-schemas.ts` (same file as `MUNINNDB_DEFAULT_PORT` constant). This keeps port resolution co-located with port configuration. Function signature: `function resolveMuninndbPort(port?: number): number`.

**resolveMonorepoRoot()** → Add to existing `packages/luca-framework/src/utils/runtime-context.ts` (extends existing `detectRuntimeContext()`). Walk-up logic is currently duplicated in init.ts (lines 101-105), global-update.ts (lines 83-88), and run.ts (line 22).

**extractErrorMessage()** → Add to `packages/luca-framework/src/utils/` as a small shared helper. Used across muninndb-service.ts and potentially other catch blocks.

**inferSourceType()** → Move from inline in global-update.ts to `packages/luca-framework/src/utils/deploy-manifest-schemas.ts` (co-locate with deploy manifest types).

### 2. Shared Deploy Utilities [researched]

**copyDirForDeploy()** and **rewriteWrapperPathsForInit()** are duplicated between init.ts and deploy-global.ts. Extract to a new shared file: `packages/luca-framework/src/utils/deploy-helpers.ts`.

- `copyDirForDeploy(src, dest, options?)` — recursive copy with symlink traversal guard (SEC-008)
- `rewriteHookPaths(targetPath, projectRoot)` — regex path rewriting for shell wrappers

Both consumers (init.ts, deploy-global.ts) import from this shared location.

### 3. Bun API Migration Scope [researched]

**Strictly scope to init.ts only** as specified in the task (DRY-5). Do not opportunistically migrate other files. Specific replacements:

- `readFileSync()` → `await Bun.file(path).text()`
- `writeFileSync()` → `await Bun.write(path, content)`
- `existsSync()` → Keep (Bun doesn't have a cleaner alternative for existence checks)
- `mkdirSync()` → Keep (Bun doesn't wrap mkdir)
- `chmodSync()` → Keep (no Bun equivalent)
- `readdirSync()` → Keep (Bun.file is for single files)
- `lstatSync()` → Keep (needed for symlink detection)
- `realpathSync()` → Keep (security boundary)

Net result: Replace `readFileSync` and `writeFileSync` calls only. Keep fs imports for operations Bun doesn't cover.

### 4. Build-Time Hook Registry Artifact [researched]

**COMPLEXITY-1**: Generate `dist/hooks-registry.json` during `bun run build:all`. Source of truth: `src/hooks/__helpers/hook-registry.ts` canonical registry.

**CRITICAL CONSTRAINT**: `bun run build:all` crashes Claude Code sessions (per MEMORY.md). The generation code will be added to the build pipeline TypeScript, but we cannot run it during this session. init.ts must have a fallback to the current hardcoded map if the JSON artifact doesn't exist yet.

**Flow:**

```
src/hooks/__helpers/hook-registry.ts (canonical)
  ↓ [build:all generates]
dist/hooks-registry.json (artifact)
  ↓ [init.ts reads at runtime]
packages/luca-framework/src/commands/init.ts
```

init.ts approach: Try `Bun.file("dist/hooks-registry.json")`, fall back to inline map if not found. This allows gradual migration — the hardcoded map stays as fallback until the user runs `bun run build:all` outside Claude Code.

### 5. Function Decomposition Strategy [researched]

**runDeployStep()** (init.ts, 246 lines): Decompose into per-category helpers within the same file or in deploy-helpers.ts:

- `deployAgentArtifacts(sourceRoot, globalDir)` → returns deployed file list
- `deploySkillArtifacts(sourceRoot, globalDir)` → returns deployed file list
- `deployHookArtifacts(sourceRoot, globalDir)` → returns deployed file list
- `deployRuleArtifacts(sourceRoot, globalDir)` → returns deployed file list
- Settings merge stays inline (already uses `computeMergeActions()` + `applyMerge()`)
- Manifest write stays inline (already uses `createDeployManifest()` + `writeDeployManifest()`)

**executeGlobalUpdate()** (global-update.ts, 300+ lines): Decompose into:

- `collectSourceArtifacts(sourceDir)` → file list with types
- `computeArtifactDiff(manifest, sourceFiles)` → diff result
- `applyArtifactUpdates(diff, options)` → execution

Keep orchestration function as thin coordinator calling these helpers.

### 6. Schema Conversion Strategy [researched]

Per project rules (schema-first-parsing, no-classes):

- Convert `StartMuninndbOptions` interface → Zod schema with `.default()` values
- Convert doctor `CheckResult` interface → Zod schema
- Use `safeParse()` at module boundaries, `parse()` acceptable for internal-only validated data
- Remove all destructuring defaults — define in Zod schema only

### 7. getLucaHomePaths() Consolidation [researched]

Replace all direct `homedir()` + manual path construction with the existing `getLucaHomePaths()` from `packages/luca-framework/src/utils/luca-home.ts`. This utility already centralizes `~/.luca/` path resolution.

## Scope Guardrail

- Phase 180 is strictly DRY/convention work — no new features
- All 19 tasks are refactoring — no behavioral changes
- Files affected: ~8-12 in packages/luca-framework/src/ and scripts/
- Do NOT touch agent prompt text (that's the backlogged task-implementation-loop)

## Deferred Ideas

- Task-level implementation loop for lu-executor → added to backlog (WSJF 7.0, post-v5.0.0)
