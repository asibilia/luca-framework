# Luca Framework Coding Standards

> **Version:** 3.0.0
> **Last Updated:** 2026-09-25
> **Status:** Active

This document defines the coding standards and patterns for the Luca Framework codebase. All contributors and AI-generated code must follow these conventions.

---

## Table of Contents

1. [Overview](#overview)
2. [Naming & Structure](#naming--structure)
3. [Functions API](#functions-api)
4. [Types & Validation](#types--validation)
5. [Collections](#collections)
6. [Verification](#verification)
7. [Commit Conventions](#commit-conventions)
8. [Quick-Start Checklist](#quick-start-checklist)

---

## Overview

Luca Framework is a **TypeScript monorepo** using **Bun** as the runtime. It holds two packages: `packages/engine` (the engine that drives a run) and `packages/board` (the Paseo plugin `luca-board`). It follows strict patterns for consistency, type safety, and maintainability.

### Tech Stack

| Layer       | Technology                                     |
| ----------- | ---------------------------------------------- |
| Runtime     | Bun                                            |
| Language    | TypeScript (strict mode)                       |
| Validation  | Zod                                            |
| Collections | Lodash                                         |
| Tests       | `bun test`                                     |
| Lint        | ESLint + Prettier                              |

### Key Commands

```bash
bun install                                  # Install dependencies
bunx --bun tsc --noEmit                      # Type check (leaves out packages/board)
bunx --bun tsc --noEmit -p packages/board    # Type check the board
bun test packages                            # Run the tests
bun run lint                                 # Lint
```

---

## Naming & Structure

### File Naming: `kebab-case`

All files use `kebab-case` naming.

**DO:**

```
packages/engine/src/journal/journal-record.ts
packages/engine/src/config/engine-config.ts
```

**DON'T:**

```
packages/engine/src/journal/JournalRecord.ts
packages/engine/src/config/engineConfig.ts
```

### Object Keys: `snake_case`

All object keys in types, interfaces, and data structures use `snake_case`.

**DO:**

```typescript
const agentConfig = {
  agent_name: "reviewer",
  description: "Debugging agent",
  tool_list: ["Read", "Write", "Grep"],
};
```

**DON'T:**

```typescript
const agentConfig = {
  agentName: "reviewer", // camelCase - wrong
  toolList: ["Read", "Write"], // camelCase - wrong
};
```

### Variable & Function Names: `camelCase`

Variable and function names use `camelCase`.

```typescript
const agentConfig = { ... }       // camelCase variable
function compileAgent() { }       // camelCase function
```

### Constants: `SCREAMING_SNAKE_CASE`

Constants use `SCREAMING_SNAKE_CASE`.

```typescript
const MAX_CONTEXT_USAGE = 0.5;
const DEFAULT_AGENT_COLOR = "blue";
```

### Directory Structure

```
packages/
  engine/           # The engine (@luca/engine): runs, journal, gates, agents, the luca-run CLI
    src/            # Modules by area (config, journal, core, gates, agents, guards, ...)
  board/            # The Paseo plugin luca-board (@luca/board)
    shared/         # Zod contracts and plain values only
    server/         # Plugin server side (reducer, rows, registry, launcher)
    client/         # React Native panel
docs/               # Documentation
.luca/config.json   # Engine config: checks, test patterns, rule files, memory vault
CONTEXT.md          # Domain words
```

Tests live next to the code they test, as `*.test.ts`.

---

## Functions API

### Single Object Argument with Destructuring

Functions accept a single object argument that is destructured, rather than multiple positional arguments.

**DO:**

```typescript
function compileAgent({
  config,
  output_format,
  dry_run = false,
}: {
  config: AgentConfig;
  output_format: "cursor" | "claude";
  dry_run?: boolean;
}) {
  // function logic
}

compileAgent({
  config: myAgent,
  output_format: "cursor",
});
```

**DON'T:**

```typescript
function compileAgent(
  config: AgentConfig,
  outputFormat: string,
  dryRun: boolean = false,
) {
  // ...
}

// Unclear what 'cursor' and 'false' represent
compileAgent(myAgent, "cursor", false);
```

### Functional Patterns (No Classes)

Prefer functional patterns over classes. Use factory functions and plain objects.

**DO:**

```typescript
function createAgent(config: AgentConfig) {
  return {
    ...config,
    toCursorFormat: () => formatForCursor(config),
    toClaudeFormat: () => formatForClaude(config),
  };
}
```

**DON'T:**

```typescript
class Agent {
  constructor(private config: AgentConfig) {}
  toCursorFormat() {
    /* ... */
  }
}
```

---

## Types & Validation

### Zod Schemas as Source of Truth

Use Zod schemas as the single source of truth for both runtime validation and TypeScript types.

**DO:**

```typescript
import { z } from "zod";

const AgentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()),
  color: z.string().optional(),
});

type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

function parseConfig(data: unknown): AgentFrontmatter {
  return AgentFrontmatterSchema.parse(data);
}
```

**DON'T:**

```typescript
// Separate interface + schema can drift apart
interface AgentFrontmatter {
  name: string;
  description: string;
  // Forgot tools - now out of sync with schema
}
```

### Avoid `any` Type

Never use `any`. Use `unknown` with type guards or proper typing.

### Avoid Type Casting

Avoid `as` type casting and `!` non-null assertions. Use Zod parsing or optional chaining instead.

---

## Collections

### Prefer Lodash Over Native Array Methods

Use Lodash functions with named imports for array and object operations.

**DO:**

```typescript
import { map, filter, groupBy, sortBy } from "lodash";

const agentNames = map(filter(agents, { is_active: true }), "name");

const agentsByCategory = groupBy(agents, "category");
```

**DON'T:**

```typescript
const agentNames = agents.filter((a) => a.is_active).map((a) => a.name);
```

---

## Verification

The engine's gates are the checks in `.luca/config.json`: the tests (`bun test packages`), both type checks (`bunx --bun tsc --noEmit` and `bunx --bun tsc --noEmit -p packages/board`), and the linter (`bun run lint`). All of them must pass. New behavior comes with tests.

---

## Commit Conventions

Follow conventional commit format:

```
type(scope): description
```

### Types

| Type       | Use For               |
| ---------- | --------------------- |
| `feat`     | New features          |
| `fix`      | Bug fixes             |
| `docs`     | Documentation changes |
| `refactor` | Code restructuring    |
| `chore`    | Maintenance tasks     |

### Scopes

| Scope    | Use For                               |
| -------- | ------------------------------------- |
| `engine` | `packages/engine` changes             |
| `board`  | `packages/board` changes              |
| `repo`   | Repo-wide changes (docs, config, CI)  |

---

## Quick-Start Checklist

When writing new code, verify:

- [ ] File names use `kebab-case`
- [ ] Object keys use `snake_case`
- [ ] Functions accept single object argument with destructuring
- [ ] Types are inferred from Zod schemas (`z.infer<typeof Schema>`)
- [ ] No `any` types used
- [ ] No `as` type casting or `!` assertions
- [ ] Lodash used for array/object operations
- [ ] Functional patterns preferred over classes
- [ ] Tests, both type checks, and lint pass (see [Verification](#verification))
- [ ] Commits follow conventional commit format

---

_This document is the authoritative source for Luca Framework coding standards. All contributions must conform to these patterns._
