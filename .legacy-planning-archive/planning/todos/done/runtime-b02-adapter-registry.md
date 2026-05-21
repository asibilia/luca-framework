---
title: "Runtime B02: Adapter registry — Map-based registry with discovery priority"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01]
phase: runtime-b
estimated_files: 1
---

## Context

The adapter registry is a Map-based functional registry following the existing `plugin-registry.ts` pattern in `src/compilers/__helpers/plugin-registry.ts`. It stores registered adapters by name and provides auto-detection from the project's environment. This file does NOT pre-register any adapters — registration of built-in adapters happens in B10 (barrel index) to avoid circular imports.

## Task

Create the file `src/adapters/__helpers/adapter-registry.ts`.

### Directory Setup

Create the directory:

```
src/adapters/
  __helpers/
    adapter-registry.ts
```

### Functions to Implement

**Module-level state** — a single `Map<string, Adapter>` instance:

```typescript
import type { Adapter } from "../__schemas/adapter.schemas";

/**
 * Internal adapter registry mapping adapter names to Adapter instances.
 * Pre-registration of built-in adapters happens in src/adapters/index.ts.
 */
const registry = new Map<string, Adapter>();
```

**`registerAdapter`** — add an adapter to the registry:

````typescript
/**
 * Register an adapter in the global registry.
 *
 * If an adapter with the same name already exists, it is replaced.
 *
 * @param adapter - The adapter to register
 *
 * @example
 * ```typescript
 * registerAdapter(createClaudeAdapter());
 * ```
 */
export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.config.name, adapter);
}
````

**`getAdapter`** — look up by name:

```typescript
/**
 * Get a registered adapter by name.
 *
 * @param name - The adapter name (e.g., "claude", "api")
 * @returns The adapter, or undefined if not registered
 */
export function getAdapter(name: string): Adapter | undefined {
  return registry.get(name);
}
```

**`listRegisteredAdapters`** — return all registered adapters:

```typescript
/**
 * List all registered adapter instances.
 *
 * @returns Array of all registered Adapter instances
 */
export function listRegisteredAdapters(): Adapter[] {
  return Array.from(registry.values());
}
```

**`listRegisteredAdapterNames`** — return all registered adapter names:

```typescript
/**
 * List all registered adapter names.
 *
 * @returns Array of adapter name strings (e.g., ["claude", "api"])
 */
export function listRegisteredAdapterNames(): string[] {
  return Array.from(registry.keys());
}
```

**`detectAdapter`** — auto-detect adapter from project environment:

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Discovery priority order for auto-detection.
 *
 * Each entry maps a directory/file presence check to an adapter name.
 * Checked in order; first match wins.
 */
const DETECTION_ORDER: ReadonlyArray<{ path: string; adapterName: string }> = [
  { path: ".claude", adapterName: "claude" },
  { path: ".cursor", adapterName: "cursor" },
  { path: ".windsurf", adapterName: "windsurf" },
  { path: ".github/agents", adapterName: "vscode" },
];

/**
 * Auto-detect the appropriate adapter from the project environment.
 *
 * Checks for IDE-specific directories in priority order.
 * Falls back to "claude" if no environment is detected.
 *
 * For explicit adapter selection, use CLI flag (--adapter=name) or
 * config file (.planning/config.json adapter field) instead.
 *
 * Discovery priority (highest to lowest):
 * 1. CLI flag: --adapter=name (handled by caller, not this function)
 * 2. Config file: .planning/config.json adapter field (handled by caller)
 * 3. Environment detection: this function
 * 4. Default: "claude"
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The detected adapter, or the "claude" adapter as default.
 *          Returns undefined only if the "claude" adapter is not registered.
 */
export function detectAdapter(projectRoot: string): Adapter | undefined {
  // First, try each adapter's own detect() method via the priority order
  for (const entry of DETECTION_ORDER) {
    const adapter = registry.get(entry.adapterName);
    if (adapter && adapter.detect(projectRoot)) {
      return adapter;
    }
  }

  // Fallback: check for directory existence in priority order
  for (const entry of DETECTION_ORDER) {
    if (existsSync(join(projectRoot, entry.path))) {
      const adapter = registry.get(entry.adapterName);
      if (adapter) {
        return adapter;
      }
    }
  }

  // Default to claude
  return registry.get("claude");
}
```

**`resetAdapterRegistry`** — clear all registrations (for testing):

```typescript
/**
 * Clear all adapter registrations.
 *
 * After calling this, no adapters are registered. Callers must
 * re-register any needed adapters. Used primarily for testing.
 */
export function resetAdapterRegistry(): void {
  registry.clear();
}
```

### Imports

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter } from "../__schemas/adapter.schemas";
```

### Exports

All six functions must be exported:

```typescript
export {
  registerAdapter,
  getAdapter,
  listRegisteredAdapters,
  listRegisteredAdapterNames,
  detectAdapter,
  resetAdapterRegistry,
};
```

Also export `DETECTION_ORDER` as a named export for testing/introspection:

```typescript
export { DETECTION_ORDER };
```

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/__helpers/adapter-registry.ts` exists and exports all listed functions
- No TypeScript errors
- Uses `node:fs` `existsSync` and `node:path` `join` (not Bun.file for existence checks — existsSync is the correct pattern for synchronous path detection)
- No classes used
- File uses kebab-case naming
- All functions have JSDoc comments

## Notes

- This registry does NOT pre-register adapters. B10 (barrel index) handles that to avoid circular imports.
- The `detectAdapter` function uses a two-pass approach: first tries each adapter's own `detect()` method, then falls back to directory existence checks. This ensures adapters can implement custom detection logic beyond simple directory presence.
- `DETECTION_ORDER` is exported so it can be referenced in documentation and tests.
