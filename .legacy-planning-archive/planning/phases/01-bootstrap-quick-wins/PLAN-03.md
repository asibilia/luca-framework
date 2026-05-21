---
phase: 1
plan: 3
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 1 Plan 3: Adapter Compatibility Report -- Wire validate() into Adapters

## Objective

Complete the adapter compatibility report feature by wiring the existing standalone validators into the Adapter type interface. The schema (`compatibility-report.schemas.ts`), per-adapter validators (`compatibility-validator.ts`), and CLI orchestration (`adapter-report-cli.ts`) already exist as standalone functions. This plan declares `validate?` on the Adapter type, implements it on each concrete adapter, and updates the report CLI to use `adapter.validate()` instead of the external validator routing map.

Post-plan requirement: User must run `bun run build:all` outside the Claude Code session. Run `bun run check:drift` before Phase 2.

> **Pre-mortem constraint:** Declare `validate?` as OPTIONAL on the Adapter type BEFORE touching any adapter file. This prevents tsc from failing on adapters that do not yet implement the method.

## Context

@src/adapters/**schemas/adapter.schemas.ts (Adapter type definition, lines 118-180)
@src/adapters/**schemas/compatibility-report.schemas.ts (already complete)
@src/adapters/**helpers/compatibility-validator.ts (standalone validators, already complete)
@src/adapters/**helpers/adapter-report-cli.ts (CLI orchestration, already complete)
@src/adapters/cursor/cursor-adapter.ts
@src/adapters/windsurf/windsurf-adapter.ts
@src/adapters/vscode/vscode-adapter.ts
@.planning/todos/pending/runtime-e04-adapter-compatibility-report.md

## Tasks

### 1. Add validate? to Adapter type (pre-mortem constraint -- FIRST)

**Type:** auto
**TDD:** false
**Depends on:** none

Add an optional `validate?` method to the Adapter type in `src/adapters/__schemas/adapter.schemas.ts`. This must be done BEFORE any adapter file is modified, following the pre-mortem constraint. The method follows the precedent of `compileRule?` and `executeStep?` (both optional on Adapter).

Signature:

```typescript
/**
 * Validate compiled output against the target IDE's constraints.
 * Optional because not all adapters have constraint-specific validation
 * (e.g., API adapter has no IDE constraints).
 *
 * @param emitResult - The EmitResult from this adapter's emit() call
 * @returns A CompatibilityReport for this adapter
 */
validate?: (emitResult: EmitResult) => Promise<CompatibilityReport>;
```

Import `CompatibilityReport` type from the compatibility report schemas (already in the same `__schemas/` directory).

**Files to edit:**

- `src/adapters/__schemas/adapter.schemas.ts`

**Verification:**

- `validate?` appears on the Adapter type as an optional method
- `bunx --bun tsc --noEmit` passes (no adapter breaks because it is optional)

### 2. Wire validate() into Cursor adapter

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `validate` to the Cursor adapter factory function in `src/adapters/cursor/cursor-adapter.ts`. The implementation should delegate to the existing `validateCursorOutput` standalone function from `compatibility-validator.ts`.

```typescript
validate: (emitResult) => validateCursorOutput(emitResult),
```

Import `validateCursorOutput` from the compatibility validator module.

**Files to edit:**

- `src/adapters/cursor/cursor-adapter.ts`

**Verification:**

- Cursor adapter object includes a `validate` property
- `bunx --bun tsc --noEmit` passes

### 3. Wire validate() into Windsurf adapter

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `validate` to the Windsurf adapter factory function in `src/adapters/windsurf/windsurf-adapter.ts`. Delegate to `validateWindsurfOutput`.

```typescript
validate: (emitResult) => validateWindsurfOutput(emitResult),
```

**Files to edit:**

- `src/adapters/windsurf/windsurf-adapter.ts`

**Verification:**

- Windsurf adapter object includes a `validate` property
- `bunx --bun tsc --noEmit` passes

### 4. Wire validate() into VS Code adapter

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `validate` to the VS Code adapter factory function in `src/adapters/vscode/vscode-adapter.ts`. Delegate to `validateVscodeOutput`.

```typescript
validate: (emitResult) => validateVscodeOutput(emitResult),
```

**Files to edit:**

- `src/adapters/vscode/vscode-adapter.ts`

**Verification:**

- VS Code adapter object includes a `validate` property
- `bunx --bun tsc --noEmit` passes

### 5. Update report CLI to use adapter.validate() when available

**Type:** auto
**TDD:** false
**Depends on:** 2, 3, 4

Update `src/adapters/__helpers/adapter-report-cli.ts` to prefer `adapter.validate(emitResult)` over the hardcoded `VALIDATOR_MAP` lookup. Fall back to the standalone validator map for adapters that do not implement `validate?` (e.g., Claude adapter, API adapter).

The current flow:

```
adapter.emit() -> VALIDATOR_MAP[adapterName](emitResult) -> report
```

Updated flow:

```
adapter.emit() -> adapter.validate?.(emitResult) ?? VALIDATOR_MAP[adapterName]?.(emitResult) -> report
```

This preserves backward compatibility while enabling the Adapter interface to carry its own validation.

**Files to edit:**

- `src/adapters/__helpers/adapter-report-cli.ts`

**Verification:**

- Report CLI prefers `adapter.validate()` when present
- Falls back to VALIDATOR_MAP for adapters without `validate`
- `bunx --bun tsc --noEmit` passes

### 6. Export validate-related types from adapter barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Verify that the adapter barrel (`src/adapters/index.ts`) exports the `CompatibilityReport` type used by `validate?`. Check current exports -- the barrel already exports `CompatibilityReport` and `validateCursorOutput` etc. If the type import added to `adapter.schemas.ts` introduces any new re-export needs, add them.

**Files to edit:**

- `src/adapters/index.ts` (only if new exports needed)

**Verification:**

- `CompatibilityReport` type is accessible via `~/adapters`
- `bunx --bun tsc --noEmit` passes

### 7. Final typecheck and verification

**Type:** auto
**TDD:** false
**Depends on:** 5, 6

Run full typecheck to confirm all changes integrate cleanly:

```bash
bunx --bun tsc --noEmit
```

Verify the compatibility report feature works end-to-end by confirming:

- The Adapter type includes `validate?`
- All three IDE adapters (Cursor, Windsurf, VS Code) implement `validate`
- The report CLI can use `adapter.validate()` or fall back to standalone validators
- The barrel exports are complete

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No type errors related to the validate method

## Verification

1. `bunx --bun tsc --noEmit` passes
2. Adapter type includes `validate?: (emitResult: EmitResult) => Promise<CompatibilityReport>`
3. Cursor, Windsurf, and VS Code adapters each implement `validate`
4. Report CLI prefers `adapter.validate()` with fallback to VALIDATOR_MAP
5. Barrel exports are complete

## Success Criteria

- The `validate?` method exists on the Adapter type (optional, matching `compileRule?` precedent)
- All three IDE adapters (Cursor, Windsurf, VS Code) wire their validate method to the existing standalone validators
- The adapter-report-cli uses `adapter.validate()` when available
- TypeScript compilation passes cleanly
- User instructed to run `bun run build:all` outside the session post-completion

## Output Specification

- Modified files:
  - `src/adapters/__schemas/adapter.schemas.ts` (Adapter type extended)
  - `src/adapters/cursor/cursor-adapter.ts` (validate added)
  - `src/adapters/windsurf/windsurf-adapter.ts` (validate added)
  - `src/adapters/vscode/vscode-adapter.ts` (validate added)
  - `src/adapters/__helpers/adapter-report-cli.ts` (prefer adapter.validate)
  - `src/adapters/index.ts` (if new exports needed)
- Post-plan user action: `bun run build:all` (outside Claude Code session)
