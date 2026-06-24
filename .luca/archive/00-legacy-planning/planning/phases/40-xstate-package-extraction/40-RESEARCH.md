# Phase 40: XState Package Extraction — Research

## 1. Dependency Analysis

### 1.1 External npm Dependencies (across all state-machine files)

| Package             | Used In                                           | Import                                                               |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `xstate` (v5.28.0)  | machine.ts, persistence.ts, actors/phase-actor.ts | `setup`, `assign`, `createActor`, `Actor`, `AnyActorRef`, `Snapshot` |
| `zod` (v4.3.6)      | types.ts                                          | `z` (schema definitions)                                             |
| `lodash` (v4.17.23) | machine.ts, bridge.ts, cli.ts, guards.ts          | `get`, `set`, `cloneDeep`                                            |
| `node:fs`           | persistence.ts                                    | `unlinkSync`                                                         |

All three npm packages are already in the root `package.json` `dependencies`:

- `xstate`: `^5.28.0`
- `zod`: `^4.3.6`
- `lodash`: `^4.17.23`

### 1.2 Internal Framework Dependencies (the extraction blockers)

| Import                   | Used In                        | Source Module                             | Depth                                  |
| ------------------------ | ------------------------------ | ----------------------------------------- | -------------------------------------- |
| `../shared/cli-utils.ts` | bridge.ts, cli.ts, snapshot.ts | `getArg`, `hasFlag`, `escapeRegex`        | Shallow (3 pure functions)             |
| `../shared/types`        | persistence.ts                 | `Result<T>` type                          | Shallow (1 type alias)                 |
| `../complexity`          | guards.ts                      | `meetsThreshold` function                 | Medium                                 |
| `../complexity/types`    | guards.ts                      | `ComplexityLevel`, `StepActivation` types | Medium (type-only, but has deep chain) |
| `../iteration/budget`    | guards.ts                      | `shouldStartIteration` function           | Medium                                 |
| `../iteration/types`     | guards.ts                      | `budgetStateSchema` Zod schema            | Medium                                 |

### 1.3 Deep Dependency Chain Analysis

The `guards.ts` file is the **only extraction blocker** with non-trivial dependencies:

```
guards.ts
  -> ../complexity (index.ts)
     -> meetsThreshold (from types.ts)
     -> types: ComplexityLevel, StepActivation
        -> types.ts imports:
           -> ../agents/types/agent.types  (CognitionTier)
           -> ../context/types             (ContextTier)
  -> ../iteration/budget
     -> shouldStartIteration (pure function)
     -> budgetStateSchema (from types.ts, Zod schema)
```

However, the **actual usage in guards.ts** is narrow:

- `meetsThreshold(level, threshold)` — pure comparison function using `COMPLEXITY_ORDER` lookup
- `ComplexityLevel` — string literal union: `"TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "CRITICAL"`
- `StepActivation` — string literal union: `"skip" | "optional" | "run" | "required" | "required+thorough"`
- `shouldStartIteration(state)` — pure function checking budget status
- `budgetStateSchema` — small Zod schema with 4 fields

The deep chain through `agents/types` and `context/types` is **type-only** and only affects the `ComplexityGate` interface (not directly used by guards.ts — guards.ts only uses `ComplexityLevel` and `StepActivation`).

### 1.4 Test Dependencies

| Test File           | Imports Beyond State Machine                     |
| ------------------- | ------------------------------------------------ |
| machine.test.ts     | `../../complexity` (`DEFAULT_COMPLEXITY_MATRIX`) |
| guards.test.ts      | `../../complexity` (`DEFAULT_COMPLEXITY_MATRIX`) |
| persistence.test.ts | `../../complexity` (`DEFAULT_COMPLEXITY_MATRIX`) |
| bridge.test.ts      | (not read, but likely similar)                   |
| cli.test.ts         | (not read, but likely similar)                   |

All test files import `DEFAULT_COMPLEXITY_MATRIX` from the complexity module for realistic test data.

### 1.5 Bun-Specific API Usage

| API                | Used In                           | Purpose                           |
| ------------------ | --------------------------------- | --------------------------------- |
| `Bun.file()`       | persistence.ts, bridge.ts, cli.ts | File existence checks and reading |
| `Bun.write()`      | persistence.ts, bridge.ts, cli.ts | Writing JSON and markdown files   |
| `Bun.argv`         | bridge.ts, cli.ts                 | CLI argument parsing              |
| `import.meta.main` | bridge.ts, cli.ts                 | Entry point detection             |

These are Bun runtime APIs. The package will need to either:

- Keep Bun as the runtime target (acceptable since CLAUDE.md mandates Bun)
- Or abstract file I/O for portability (NOT recommended per project conventions)

---

## 2. Extraction Blockers

### 2.1 BLOCKER: Guards depend on complexity + iteration modules

**Severity: Medium** | **Files affected: 1** (`guards.ts`)

The `guards.ts` file imports from two framework modules:

1. `../complexity` — `meetsThreshold`, `ComplexityLevel`, `StepActivation`
2. `../iteration/budget` — `shouldStartIteration`
3. `../iteration/types` — `budgetStateSchema`

**Resolution Strategy:** Inline self-contained copies of the required pieces:

- `ComplexityLevel` and `StepActivation` are simple string literal unions (no code, just types)
- `meetsThreshold` is 3 lines of code using a `Record<string, number>` lookup
- `shouldStartIteration` is ~30 lines of pure logic
- `budgetStateSchema` is a small Zod schema (4 fields)

These can be placed in a `packages/luca-state/src/guards/complexity-utils.ts` and `packages/luca-state/src/guards/budget-utils.ts` file within the package.

### 2.2 BLOCKER: Shared CLI utilities

**Severity: Low** | **Files affected: 3** (`bridge.ts`, `cli.ts`, `snapshot.ts`)

Three functions from `../shared/cli-utils.ts`:

- `getArg(args, name, default)` — 5 lines
- `hasFlag(args, name)` — 1 line
- `escapeRegex(str)` — 1 line

**Resolution:** Copy into `packages/luca-state/src/utils/cli-utils.ts`. These are trivially small.

### 2.3 BLOCKER: Shared Result type

**Severity: Trivial** | **Files affected: 1** (`persistence.ts`)

The `Result<T>` discriminated union type:

```typescript
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

**Resolution:** Define directly in `packages/luca-state/src/types.ts`.

### 2.4 BLOCKER: Test dependency on DEFAULT_COMPLEXITY_MATRIX

**Severity: Low** | **Files affected: 3+ test files**

Tests use `DEFAULT_COMPLEXITY_MATRIX` from the complexity module for realistic gating values.

**Resolution:** Include a self-contained `DEFAULT_COMPLEXITY_MATRIX` in the test fixtures or in the package itself as a "default config" export. The matrix is a plain object with string keys and simple values — no deep dependencies needed.

### 2.5 NON-BLOCKER: Hardcoded paths

These are configurable via function parameters (they use defaults, not hardcoded constants):

- `STATE_FILE_PATH = ".planning/state.json"` — exported, used as default parameter
- `STATE_MD_PATH = ".planning/STATE.md"` — local constant in bridge.ts
- `configPath = ".planning/config.json"` — default parameter in `createFreshActor()`

### 2.6 NON-BLOCKER: Bun runtime dependency

All file I/O uses `Bun.file()` and `Bun.write()`. Since the project mandates Bun, this is acceptable. The package should document Bun as a required runtime.

### 2.7 NON-BLOCKER: Consumer impact

Skills and agents reference the bridge CLI via shell strings like:

```bash
bun run src/state-machine/bridge.ts read-status
```

After extraction, these would become:

```bash
luca-state read-status
```

This is a separate migration concern (not blocking extraction itself).

---

## 3. Configuration Patterns

### 3.1 Existing Package Structure: `packages/luca-framework/`

```
packages/luca-framework/
  package.json          # name: "luca-framework", type: "module"
  build.config.ts       # unbuild config
  bin/luca.js           # CLI entry point
  src/
    index.ts            # Main exports
    types.ts
    commands/
    contracts/
    utils/
    adapters/
  dist/                 # Build output (generated)
```

**package.json pattern:**

```json
{
  "name": "luca-framework",
  "version": "0.0.1",
  "type": "module",
  "bin": { "luca": "./bin/luca.js" },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["bin", "dist"],
  "scripts": { "build": "unbuild", "test": "bun test" },
  "dependencies": { ... }
}
```

### 3.2 Build Configuration Pattern

Both existing packages use `unbuild`:

**luca-framework/build.config.ts:**

```typescript
import { defineBuildConfig } from 'unbuild';
export default defineBuildConfig({
  entries: ['src/index'],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  externals: ['citty', 'consola', ...],
});
```

**create-luca/build.config.ts:**

```typescript
import { defineBuildConfig } from "unbuild";
export default defineBuildConfig({
  entries: ["src/index"],
  clean: true,
  declaration: true,
  rollup: { emitCJS: true },
});
```

### 3.3 Root Workspace Configuration

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "type": "module",
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun test"
  }
}
```

Packages in `packages/*` are automatically workspace members.

### 3.4 Root tsconfig.json

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "baseUrl": ".",
    "paths": { "~/*": ["./src/*"] }
  }
}
```

No per-package tsconfig.json files exist. All packages use the root config.

### 3.5 Test Configuration (bunfig.toml)

```toml
[test]
root = "."
coverage = true
coverageDir = "coverage"
coverageReporter = ["text", "lcov"]
coverageThreshold = { line = 80 }
```

Tests run from root with `bun test`. Individual packages can also run `bun test` via their `package.json` scripts.

---

## 4. Import Rewiring Map

### 4.1 Files Moving to Package

| Current Path                              | New Package Path                                |
| ----------------------------------------- | ----------------------------------------------- |
| `src/state-machine/index.ts`              | `packages/luca-state/src/index.ts`              |
| `src/state-machine/machine.ts`            | `packages/luca-state/src/machine.ts`            |
| `src/state-machine/types.ts`              | `packages/luca-state/src/types.ts`              |
| `src/state-machine/guards.ts`             | `packages/luca-state/src/guards.ts`             |
| `src/state-machine/actions.ts`            | `packages/luca-state/src/actions.ts`            |
| `src/state-machine/events.ts`             | `packages/luca-state/src/events.ts`             |
| `src/state-machine/persistence.ts`        | `packages/luca-state/src/persistence.ts`        |
| `src/state-machine/snapshot.ts`           | `packages/luca-state/src/snapshot.ts`           |
| `src/state-machine/bridge.ts`             | `packages/luca-state/src/bridge.ts`             |
| `src/state-machine/cli.ts`                | `packages/luca-state/src/cli.ts`                |
| `src/state-machine/actors/index.ts`       | `packages/luca-state/src/actors/index.ts`       |
| `src/state-machine/actors/phase-actor.ts` | `packages/luca-state/src/actors/phase-actor.ts` |

### 4.2 Import Changes per File

| File             | Old Import                      | New Import                                              |
| ---------------- | ------------------------------- | ------------------------------------------------------- |
| `guards.ts`      | `from "../complexity"`          | `from "./utils/complexity-utils"` (self-contained copy) |
| `guards.ts`      | `from "../complexity/types"`    | `from "./utils/complexity-utils"` (self-contained copy) |
| `guards.ts`      | `from "../iteration/budget"`    | `from "./utils/budget-utils"` (self-contained copy)     |
| `guards.ts`      | `from "../iteration/types"`     | `from "./utils/budget-utils"` (self-contained copy)     |
| `bridge.ts`      | `from "../shared/cli-utils.ts"` | `from "./utils/cli-utils"` (self-contained copy)        |
| `cli.ts`         | `from "../shared/cli-utils.ts"` | `from "./utils/cli-utils"` (self-contained copy)        |
| `snapshot.ts`    | `from "../shared/cli-utils.ts"` | `from "./utils/cli-utils"` (self-contained copy)        |
| `persistence.ts` | `from "../shared/types"`        | `from "./types"` (Result type defined locally)          |

All **intra-module** imports (e.g., `./machine`, `./types`, `./persistence`) remain unchanged since files maintain the same relative structure.

### 4.3 Framework Shim (Backward Compatibility)

After extraction, `src/state-machine/index.ts` in the framework becomes a re-export:

```typescript
// src/state-machine/index.ts (framework shim)
export * from "luca-state";
```

This preserves all existing consumer imports without changes.

---

## 5. Hardcoded Paths

### 5.1 Configurable Paths (already parameterized)

| Path                    | File              | How It's Used                                                                |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `.planning/state.json`  | persistence.ts    | `STATE_FILE_PATH` constant, but passed as default parameter to all functions |
| `.planning/STATE.md`    | bridge.ts, cli.ts | `STATE_MD_PATH` local constant                                               |
| `.planning/config.json` | persistence.ts    | Default parameter in `createFreshActor()`                                    |

All persistence functions accept `filePath` as a parameter, defaulting to `.planning/state.json`. This makes the package already location-agnostic for programmatic use.

### 5.2 Recommendation: Make Paths Configurable

For the standalone package, expose a configuration mechanism:

```typescript
// Option A: Environment variables
const STATE_FILE_PATH = process.env.LUCA_STATE_PATH ?? ".planning/state.json";
const STATE_MD_PATH = process.env.LUCA_STATE_MD_PATH ?? ".planning/STATE.md";
const CONFIG_PATH = process.env.LUCA_CONFIG_PATH ?? ".planning/config.json";

// Option B: CLI flags (already supported)
// luca-state --state-path=./custom/state.json read-status
```

### 5.3 Shell References in Skills/Agents

~30+ shell references across skills and agents use:

```bash
bun run src/state-machine/bridge.ts <subcommand>
```

After extraction with a CLI binary, these become:

```bash
luca-state <subcommand>
```

This is a migration step that should happen as a follow-up or as part of Phase 40 Plan 06/07.

---

## 6. Test Infrastructure

### 6.1 Existing Test Files

| Test File                    | Tests                                                                                                | Key Dependencies                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `machine.test.ts`            | 25+ tests (happy path, gating, retry, paused, failed, skip, autopilot, context init, allowed events) | `xstate`, `DEFAULT_COMPLEXITY_MATRIX`                    |
| `guards.test.ts`             | 30+ tests (all 15 guards)                                                                            | `DEFAULT_COMPLEXITY_MATRIX`                              |
| `persistence.test.ts`        | 15+ tests (persist, load, round-trip, create, clear, exists)                                         | `xstate`, `DEFAULT_COMPLEXITY_MATRIX`, Bun.file, node:fs |
| `events.test.ts`             | Event utility tests                                                                                  | Internal types only                                      |
| `context.test.ts`            | Context initialization tests                                                                         | Internal types only                                      |
| `snapshot.test.ts`           | Snapshot generation tests                                                                            | Internal types only                                      |
| `phase-actor.test.ts`        | Phase actor lifecycle tests                                                                          | `xstate`                                                 |
| `bridge.test.ts`             | Bridge command tests                                                                                 | File I/O, persistence                                    |
| `bridge-integration.test.ts` | Integration tests                                                                                    | File I/O, shell commands                                 |
| `cli.test.ts`                | CLI command tests                                                                                    | File I/O, persistence                                    |
| `hook-integration.test.ts`   | Hook integration tests                                                                               | File I/O, shell commands                                 |

### 6.2 Test Patterns

- All tests use `bun:test` (`describe`, `test`, `expect`, `beforeEach`, `afterEach`)
- Persistence tests create/delete `.planning/state.json` between tests
- No mocking framework used -- tests use real XState actors
- Tests use helper functions like `createWorkflow()` and `sendEvents()`

### 6.3 Test Configuration for Package

The package should have its own `bunfig.toml` (or inherit from root) with:

```toml
[test]
root = "."
coverage = true
coverageThreshold = { line = 80 }
```

### 6.4 Test Fixture: DEFAULT_COMPLEXITY_MATRIX

The `DEFAULT_COMPLEXITY_MATRIX` is needed by machine.test.ts, guards.test.ts, and persistence.test.ts. Options:

1. **Include as package export** — `export { DEFAULT_COMPLEXITY_MATRIX } from "./defaults"` (RECOMMENDED)
2. **Test-only fixture** — Duplicate in `__tests__/fixtures/`
3. **Inline in tests** — Repeat the object literal

Option 1 is best because the matrix is part of the state machine's public API (guards reference it via context at runtime). Exporting it makes the package fully self-contained.

---

## 7. Recommendations

### 7.1 Package Structure

```
packages/luca-state/
  package.json
  build.config.ts
  tsconfig.json           # Extends root, adds package-specific paths
  bunfig.toml             # Test config
  bin/
    luca-state.js         # CLI entry point (thin wrapper)
  src/
    index.ts              # Public API barrel export
    machine.ts            # XState machine definition
    types.ts              # All Zod schemas + TypeScript types + Result<T>
    guards.ts             # Guard functions (with inlined complexity/budget utils)
    actions.ts            # Action metadata
    events.ts             # Event utilities
    persistence.ts        # State file I/O
    snapshot.ts           # STATE.md generation
    bridge.ts             # High-level CLI bridge
    cli.ts                # Low-level CLI
    defaults.ts           # DEFAULT_COMPLEXITY_MATRIX (self-contained)
    actors/
      index.ts
      phase-actor.ts
    utils/
      cli-utils.ts        # getArg, hasFlag, escapeRegex
      complexity-utils.ts # ComplexityLevel, StepActivation, meetsThreshold, COMPLEXITY_ORDER
      budget-utils.ts     # shouldStartIteration, budgetStateSchema, BudgetState
  __tests__/
    machine.test.ts
    guards.test.ts
    persistence.test.ts
    events.test.ts
    context.test.ts
    snapshot.test.ts
    phase-actor.test.ts
    bridge.test.ts
    bridge-integration.test.ts
    cli.test.ts
    hook-integration.test.ts
```

### 7.2 Package.json

```json
{
  "name": "luca-state",
  "version": "0.0.1",
  "description": "Standalone XState v5 state machine for the Luca agentic workflow",
  "type": "module",
  "bin": {
    "luca-state": "./bin/luca-state.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["bin", "dist"],
  "scripts": {
    "build": "unbuild",
    "test": "bun test"
  },
  "dependencies": {
    "xstate": "^5.28.0",
    "zod": "^4.3.6",
    "lodash": "^4.17.23"
  },
  "devDependencies": {
    "@types/lodash": "^4.17.23"
  },
  "keywords": ["state-machine", "xstate", "workflow", "luca", "agentic"]
}
```

### 7.3 Build Configuration

```typescript
// packages/luca-state/build.config.ts
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index"],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
  },
  externals: ["xstate", "zod", "lodash"],
});
```

### 7.4 CLI Entry Point

```javascript
#!/usr/bin/env bun
// packages/luca-state/bin/luca-state.js
import "../dist/bridge.mjs";
```

Note: The bridge.ts already has `if (import.meta.main)` handling. The build config may need a second entry for the CLI:

```typescript
entries: ['src/index', 'src/bridge'],
```

### 7.5 Self-Contained Utility Copies

**`utils/complexity-utils.ts`** — needs to contain:

```typescript
export const COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];
export type StepActivation =
  | "skip"
  | "optional"
  | "run"
  | "required"
  | "required+thorough";
export const COMPLEXITY_ORDER: Record<ComplexityLevel, number> = {
  TRIVIAL: 0,
  SIMPLE: 1,
  MODERATE: 2,
  COMPLEX: 3,
  CRITICAL: 4,
};
export function meetsThreshold(
  level: ComplexityLevel,
  threshold: ComplexityLevel,
): boolean {
  return COMPLEXITY_ORDER[level] >= COMPLEXITY_ORDER[threshold];
}
```

**`utils/budget-utils.ts`** — needs to contain:

- `budgetStateSchema` (Zod schema, 4 fields)
- `BudgetState` type
- `shouldStartIteration()` function (~30 lines)
- `assessBudget()` function (~10 lines, called by shouldStartIteration)

**`utils/cli-utils.ts`** — needs to contain:

- `getArg()` (5 lines)
- `hasFlag()` (1 line)
- `escapeRegex()` (1 line)

**`defaults.ts`** — needs to contain:

- `DEFAULT_COMPLEXITY_MATRIX` (the full matrix object)
- Supporting types already in `utils/complexity-utils.ts`

### 7.6 Framework Backward Compatibility

After extraction, replace `src/state-machine/` in the framework with a thin re-export layer:

```typescript
// src/state-machine/index.ts (framework shim)
export * from "luca-state";
```

Add `luca-state` as a workspace dependency:

```json
// root package.json or a future packages/luca-core/package.json
"dependencies": {
  "luca-state": "workspace:*"
}
```

### 7.7 Migration Plan for Shell References

~30+ shell commands across skills/agents reference:

```bash
bun run src/state-machine/bridge.ts <subcommand>
```

Phase 40 should include a plan to update these to:

```bash
luca-state <subcommand>
```

Or, as an intermediate step, add a shell alias/wrapper script that redirects.

### 7.8 Recommended Plan Breakdown

| Plan      | Description                                                                       | Files     |
| --------- | --------------------------------------------------------------------------------- | --------- |
| **40-01** | Package scaffold (package.json, build.config.ts, tsconfig.json, bin/)             | 4-5 files |
| **40-02** | Self-contained utilities (cli-utils, complexity-utils, budget-utils, Result type) | 4 files   |
| **40-03** | Core machine extraction (types, machine, actors, guards, actions, events)         | 7-8 files |
| **40-04** | Persistence + snapshot extraction                                                 | 2-3 files |
| **40-05** | CLI entry points (bridge.ts, cli.ts, bin/luca-state.js)                           | 3 files   |
| **40-06** | Test suite migration (all 11 test files)                                          | 11 files  |
| **40-07** | Framework shim + workspace wiring                                                 | 2-3 files |

### 7.9 Risk Assessment

| Risk                                              | Severity | Mitigation                                                             |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Guards lose sync with framework complexity types  | Medium   | Export matching types from package; framework re-exports from package  |
| Test failures from path changes                   | Low      | Use relative imports in tests; verify `.planning/` directory setup     |
| CLI binary not found after build                  | Low      | Test `luca-state` binary invocation in CI                              |
| Bun runtime assumption breaks portability         | Low      | Document Bun requirement; acceptable per project conventions           |
| DEFAULT_COMPLEXITY_MATRIX diverges from framework | Medium   | Framework should import from `luca-state` (not maintain separate copy) |
| Shell references in skills not updated            | Medium   | Create a migration plan as part of 40-07 or a follow-up phase          |

### 7.10 Zero-Framework-Dependency Verification

After extraction, the package should have NO imports from:

- `src/complexity/`
- `src/iteration/`
- `src/shared/`
- `src/agents/`
- `src/context/`
- `src/skills/`
- `src/rules/`
- Any other `src/` module

All needed functionality from these modules is inlined as self-contained copies within the package's `src/utils/` directory. The package's only external dependencies are `xstate`, `zod`, and `lodash`.
