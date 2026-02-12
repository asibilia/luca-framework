---
id: 19-01
title: Plugin Types & Manifest Schema
phase: 19-plugin-infrastructure
wave: 1
delivers: PLUG-01, PLUG-04 (partial)
depends_on: null
tasks: 3
---

# Plan 19-01: Plugin Types & Manifest Schema

## Objective

Create the plugin type definitions and manifest schema. Define Zod schemas for the Claude Code plugin.json manifest, extend `SupportedFormat` to include `'PLUGIN'`, and create the plugin manifest generation function. This plan establishes the type vocabulary for all subsequent Phase 19 plans.

## Context

- **Compiler types:** `src/compilers/base.compiler.ts` defines `SupportedFormat = 'CURSOR' | 'CLAUDE'`
- **Plugin spec:** `.claude-plugin/plugin.json` requires only `name`; supports version, description, author, component paths
- **Existing pattern:** Zod schemas as single source of truth (project convention)
- **snake_case for schemas** (API convention rule)

## Files

### Create

- `src/compilers/plugin.types.ts` — Plugin manifest Zod schemas, types, and generator function

### Modify

- `src/compilers/base.compiler.ts` — Add `'PLUGIN'` to `SupportedFormat` union and update `validateFormat()`

## Tasks

### Task 1: Create src/compilers/plugin.types.ts

**Goal:** Define Zod schemas for plugin manifest and related types.

**File:** `src/compilers/plugin.types.ts` (new)

Define:

```typescript
import { z } from "zod";

/**
 * Claude Code plugin manifest schema.
 *
 * Defines the structure for .claude-plugin/plugin.json.
 * Only `name` is required; all other fields are optional.
 * Claude Code auto-discovers components in default directories.
 *
 * @see https://code.claude.com/docs/en/plugins-reference
 */
export const pluginAuthorSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const pluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Plugin name must be kebab-case"),
  version: z.string().optional(),
  description: z.string().optional(),
  author: pluginAuthorSchema.optional(),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  commands: z.union([z.string(), z.array(z.string())]).optional(),
  agents: z.union([z.string(), z.array(z.string())]).optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  hooks: z
    .union([z.string(), z.array(z.string()), z.record(z.unknown())])
    .optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginAuthor = z.infer<typeof pluginAuthorSchema>;
```

Also define the manifest generator:

```typescript
/**
 * Generate a plugin manifest from project metadata.
 *
 * Reads version from root package.json and constructs the
 * minimal plugin.json required for Claude Code plugin discovery.
 */
export function generatePluginManifest(options: {
  name: string;
  version?: string;
  description?: string;
}): PluginManifest {
  return pluginManifestSchema.parse({
    name: options.name,
    version: options.version,
    description: options.description,
    author: {
      name: "Luca Framework",
    },
    homepage: "https://github.com/asibilia/luca-framework",
    repository: "https://github.com/asibilia/luca-framework",
    license: "MIT",
    keywords: ["luca", "workflow", "ai-agents", "cursor", "claude-code"],
  });
}
```

### Task 2: Extend SupportedFormat in base.compiler.ts

**Goal:** Add `'PLUGIN'` to the `SupportedFormat` type union.

**File:** `src/compilers/base.compiler.ts` (modify)

Change:

```typescript
export type SupportedFormat = "CURSOR" | "CLAUDE";
```

To:

```typescript
export type SupportedFormat = "CURSOR" | "CLAUDE" | "PLUGIN";
```

Update `validateFormat()`:

```typescript
protected validateFormat(format: SupportedFormat): void {
  if (format !== 'CURSOR' && format !== 'CLAUDE' && format !== 'PLUGIN') {
    throw new Error(`Unsupported format: ${format}`);
  }
}
```

### Task 3: Create plugin types tests

**Goal:** Validate the plugin manifest schema with unit tests.

**File:** `src/compilers/plugin.types.test.ts` (new)

Test:

1. Valid manifest with all fields passes schema validation
2. Minimal manifest (name only) passes schema validation
3. Invalid name format (non-kebab-case) fails validation
4. `generatePluginManifest()` produces valid manifest
5. Optional fields can be omitted without failure

## Verification

- [ ] `SupportedFormat` includes `'PLUGIN'`
- [ ] `pluginManifestSchema` validates correct plugin.json structure
- [ ] `generatePluginManifest()` produces valid manifest with project metadata
- [ ] All tests pass: `bun test src/compilers/plugin.types.test.ts`
- [ ] No existing tests broken
