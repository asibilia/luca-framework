# Phase 40: XState Package Extraction — Context

## Decisions

### 1. Package Naming [researched]

**Decision:** `luca-state` (unscoped)

**Rationale:** Matches existing package naming convention: `luca-framework`, `create-luca`. Unscoped names are simpler and consistent with the monorepo's established pattern. The package will live at `packages/luca-state/`.

### 2. Shared Utilities Strategy [researched]

**Decision:** Self-contained copy of required utilities inside the package.

**Rationale:** Follows the validated "self-contained cross-package modules" pattern from MEMORY.md. The state machine only needs 2 small files from `src/shared/`:

- `cli-utils.ts` (3 functions: `getArg`, `hasFlag`, `escapeRegex`)
- `types.ts` (1 type: `Result<T>`)

Copying these (~50 lines total) into `packages/luca-state/src/shared/` avoids a cross-package import dependency and keeps the package truly standalone.

### 3. Build Tool [researched]

**Decision:** `unbuild` (matching existing packages)

**Rationale:** Both `luca-framework` and `create-luca` use `unbuild` for package compilation. This produces dual CJS/ESM output with TypeScript declarations. Consistency across the monorepo simplifies maintenance.

### 4. CLI Binary Name [researched]

**Decision:** `luca-state` binary in `bin/luca-state.js`

**Rationale:** Consistent with `luca` binary from `luca-framework`. The CLI will support all current bridge commands: `luca-state read-status`, `luca-state transition`, etc.

### 5. Package Entry Points [researched]

**Decision:** Two entry points — programmatic API (`index.ts`) and CLI (`bin/luca-state.js`)

**Rationale:** The state machine is used both programmatically (by the framework's rules/compilers) and via CLI (by skills/agents in shell scripts). Both entry points must be available.

### 6. Dependency Strategy [researched]

**Decision:** `xstate`, `zod`, and `lodash` as direct dependencies. No peer deps needed.

**Rationale:** The package is standalone and should bundle its own dependencies. These are the only external dependencies the state machine uses. Node.js built-ins (`node:fs`, `node:path`) don't need to be declared.

## Extraction Scope

### Files to Extract (from `src/state-machine/`)

| Source File             | Target Location                                 |
| ----------------------- | ----------------------------------------------- |
| `types.ts`              | `packages/luca-state/src/types.ts`              |
| `machine.ts`            | `packages/luca-state/src/machine.ts`            |
| `guards.ts`             | `packages/luca-state/src/guards.ts`             |
| `actions.ts`            | `packages/luca-state/src/actions.ts`            |
| `events.ts`             | `packages/luca-state/src/events.ts`             |
| `persistence.ts`        | `packages/luca-state/src/persistence.ts`        |
| `snapshot.ts`           | `packages/luca-state/src/snapshot.ts`           |
| `bridge.ts`             | `packages/luca-state/src/bridge.ts`             |
| `cli.ts`                | `packages/luca-state/src/cli.ts`                |
| `actors/phase-actor.ts` | `packages/luca-state/src/actors/phase-actor.ts` |
| `actors/index.ts`       | `packages/luca-state/src/actors/index.ts`       |
| `index.ts`              | `packages/luca-state/src/index.ts`              |

### Shared Utils to Copy

| Source                    | Target                                        |
| ------------------------- | --------------------------------------------- |
| `src/shared/cli-utils.ts` | `packages/luca-state/src/shared/cli-utils.ts` |
| `src/shared/types.ts`     | `packages/luca-state/src/shared/types.ts`     |

### Tests to Extract

All `src/state-machine/__tests__/*.test.ts` → `packages/luca-state/src/__tests__/`

## Deferred Ideas

- MCP server for persistent in-memory state machine (performance optimization — defer to v1.7.0+)
- npm registry publishing automation (manual/CI for now)

---

_Context created: 2026-02-16 (auto-discuss mode)_
