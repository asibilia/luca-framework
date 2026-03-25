---
title: "Runtime B10: Domain barrel, boundary registration, and built-in adapter pre-registration"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01, B02, B05, B07, B09]
phase: runtime-b
estimated_files: 3
---

## Context

This is the final wiring task for Phase B. It creates the domain barrel (`src/adapters/index.ts`), registers built-in adapters (Claude and API), updates the domain boundary script to include `adapters` as T3, and updates `docs/generation-system.md` to include the new domain in the directory tree.

## Task

### File 1: Create `src/adapters/index.ts`

The barrel must contain ONLY re-export statements per the barrel invariant. Built-in adapter registration uses a side-effect import pattern.

```typescript
/**
 * Public API for the adapters module.
 *
 * Provides the adapter interface, registry, and built-in adapters
 * for compiling Luca definitions to multiple target environments.
 *
 * Built-in adapters (Claude, API) are pre-registered via side-effect.
 */

// ─── Schemas and Types ─────────────────────────────────────────────────────
export {
  AdapterSupportedFeaturesSchema,
  AdapterConfigSchema,
  EmitResultSchema,
  AdapterStepResultSchema,
} from "./__schemas/adapter.schemas";
export type {
  AdapterSupportedFeatures,
  AdapterConfig,
  EmitResult,
  AdapterStepResult,
  Adapter,
} from "./__schemas/adapter.schemas";

// ─── Registry ──────────────────────────────────────────────────────────────
export {
  registerAdapter,
  getAdapter,
  listRegisteredAdapters,
  listRegisteredAdapterNames,
  detectAdapter,
  resetAdapterRegistry,
  DETECTION_ORDER,
} from "./__helpers/adapter-registry";

// ─── Adapter-Executor Bridge ───────────────────────────────────────────────
export { bridgeAdapterForExecutor } from "./__helpers/adapter-executor-bridge";

// ─── Claude Adapter ────────────────────────────────────────────────────────
export { createClaudeAdapter } from "./claude";
export { emitAgentMarkdown } from "./claude";
export { emitSkillMarkdown, emitSkillPluginMarkdown } from "./claude";

// ─── API Adapter ───────────────────────────────────────────────────────────
export { createApiAdapter, ApiAdapterOptionsSchema } from "./api";
export type { ApiAdapterOptions } from "./api";
export {
  ApiExecutorConfigSchema,
  TokenUsageSchema,
  executeViaSDK,
} from "./api";
export type { ApiExecutorConfig, TokenUsage } from "./api";
```

**Important:** The barrel must NOT contain registration logic. Pre-registration of built-in adapters is handled by a separate initializer file (see below).

### File 2: Create `src/adapters/__helpers/register-builtins.ts`

This file performs the side-effect of registering built-in adapters. It is imported by consumers who need the registry pre-populated (e.g., CLI entry points, build scripts).

````typescript
/**
 * Pre-register built-in adapters (Claude, API) in the adapter registry.
 *
 * Import this module for its side effect:
 *
 * ```typescript
 * import "~/adapters/__helpers/register-builtins";
 * ```
 *
 * After import, the registry contains:
 * - "claude" — Claude Code adapter (default)
 * - "api" — API/headless adapter via Claude Agent SDK
 *
 * This file is NOT re-exported from the barrel (index.ts) because
 * barrel imports should not have side effects. Consumers must
 * explicitly import this module when they need built-in adapters.
 *
 * @module
 */
import { registerAdapter } from "./adapter-registry";
import { createClaudeAdapter } from "../claude/claude-adapter";
import { createApiAdapter } from "../api/api-adapter";

registerAdapter(createClaudeAdapter());
registerAdapter(createApiAdapter());
````

### File 3: Modify `scripts/check-domain-boundaries.ts`

Add `adapters` to the `DOMAIN_TIER` map at tier 3:

**Exact change** — in the `DOMAIN_TIER` record (around line 22-36), add one entry:

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
  adapters: 3, // <-- ADD THIS LINE
};
```

This single-line addition ensures the boundary checker recognizes `adapters` as a T3 domain and validates that:

- `adapters` can import from T0 (shared, complexity), T1 (context, planner, etc.), T2 (agents, skills, rules), and T3 (compilers, hooks, adapters)
- No domain outside T3 imports from `adapters` (terminal domain)
- `adapters` does not violate entity isolation (it is not in `ENTITY_DOMAINS`)

### File 4: Update `docs/generation-system.md`

Add the `src/adapters/` directory tree to the docs. Find the `src/` directory tree section and add:

```
src/adapters/               # T3 Build — Adapter architecture
├── __schemas/
│   └── adapter.schemas.ts  # Adapter interface, config, result schemas
├── __helpers/
│   ├── adapter-registry.ts # Registry: register, get, list, detect
│   ├── adapter-executor-bridge.ts  # Bridge between Adapter (T3) and WorkflowAdapter (T1)
│   └── register-builtins.ts  # Side-effect: pre-register Claude + API adapters
├── claude/
│   ├── claude-adapter.ts   # Claude Code adapter factory
│   ├── agent-emitter.ts    # Agent markdown compilation
│   ├── skill-emitter.ts    # Skill markdown compilation
│   └── index.ts            # Claude adapter barrel
├── api/
│   ├── api-adapter.ts      # API/headless adapter factory
│   ├── api-executor.ts     # Claude Agent SDK execution wrapper
│   └── index.ts            # API adapter barrel
└── index.ts                # Domain barrel (re-exports only)
```

### Verification That `adapters` Is Not Cross-Imported by T0/T1/T2

After B08 (compiler refactoring), `src/compilers/` (T3) imports from `src/adapters/` (T3). This is the ONLY cross-domain import into adapters. No T0, T1, or T2 domain imports from adapters.

Verify this by running:

```bash
bun run scripts/check-domain-boundaries.ts
```

## Verification

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

- `src/adapters/index.ts` exists and contains ONLY re-export statements
- `src/adapters/index.ts` does NOT import `register-builtins.ts` (no side effects in barrel)
- `src/adapters/__helpers/register-builtins.ts` exists and registers Claude + API adapters
- `scripts/check-domain-boundaries.ts` includes `adapters: 3` in `DOMAIN_TIER`
- `bun run scripts/check-domain-boundaries.ts` passes with zero violations
- `docs/generation-system.md` includes the `src/adapters/` directory tree
- No TypeScript errors
- No classes used
- All files use kebab-case naming
- Barrel contains only `export { ... } from` and `export type { ... } from` statements

## Notes

- The `register-builtins.ts` pattern separates side effects from the barrel. This is important because importing the barrel (`import { getAdapter } from "~/adapters"`) should not have the side effect of creating adapter instances. Only explicit registration imports (`import "~/adapters/__helpers/register-builtins"`) trigger adapter creation.
- Build scripts and CLI entry points should import `register-builtins.ts` early in their initialization to ensure the registry is populated before any adapter lookups.
- The `docs/generation-system.md` update is a documentation-only change. If the file structure in the doc uses a different format than the tree shown above, match the existing format.
