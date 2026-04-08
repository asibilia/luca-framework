# Luca Framework Coding Standards

> **Version:** 2.0.0
> **Last Updated:** 2026-03-31
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

Luca Framework is a **TypeScript monorepo** using **Bun** as the runtime. The codebase defines agents, skills, and rules as TypeScript definitions that compile to Cursor and Claude formats. It follows strict patterns for consistency, type safety, and maintainability.

### Tech Stack

| Layer       | Technology                                     |
| ----------- | ---------------------------------------------- |
| Runtime     | Bun                                            |
| Language    | TypeScript (strict mode)                       |
| Database    | File-based (.planning/ artifacts, JSON config) |
| Validation  | Zod                                            |
| Collections | Lodash                                         |
| Build       | unbuild                                        |

### Key Commands

```bash
bun install              # Install dependencies
bun run build            # Build luca-framework
bun run mastracode       # Run mastracode harness
bunx --bun tsc --noEmit  # Type check
```

---

## Naming & Structure

### File Naming: `kebab-case`

All files use `kebab-case` naming.

**DO:**

```
packages/luca-mastracode/src/tools/run-checks.ts
packages/luca-framework/src/utils/vault-setup.ts
```

**DON'T:**

```
packages/luca-mastracode/src/tools/RunChecks.ts
packages/luca-framework/src/utils/vaultSetup.ts
```

### Planning Artifacts: `UPPERCASE.md`

Planning artifacts use uppercase naming:

```
MuninnDB brain tree (brain:project-identity)
MuninnDB engrams (pattern:*, decision:*, pitfall:*, preference:*)
MuninnDB session context (session:*)
```

### Agent/Skill/Rule Naming

Framework-specific definitions use the `lu-` prefix:

```
lu-executor.agent.ts
lu-plan-phase.skill.ts
lu-workflow.rule.ts
```

### Object Keys: `snake_case`

All object keys in types, interfaces, and data structures use `snake_case`.

**DO:**

```typescript
const agentConfig = {
  agent_name: "lu-debugger",
  description: "Debugging agent",
  tool_list: ["Read", "Write", "Grep"],
};
```

**DON'T:**

```typescript
const agentConfig = {
  agentName: "lu-debugger", // camelCase - wrong
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
src/
  adapters/         # Multi-IDE output adapters
  agents/           # Agent definitions and registry
  compilers/        # Compilation pipeline
  complexity/       # Complexity gating and model routing
  context/          # Context tier management
  eval/             # Evaluation framework
  harness/          # Verification harness
  hooks/            # Hook scripts and generation
  interop/          # Cross-tool agent scanner
  iteration/        # Error classification and convergence
  observability/    # Agent effectiveness scoring
  planner/          # Sprint planning
  rules/            # Rule definitions and registry
  shared/           # Cross-domain utilities
  skills/           # Skill definitions and registry
  workflow/         # DAG engine and step contracts
scripts/            # Build and generation scripts
packages/           # Publishable packages
  luca-framework/   # Main distributable package
  create-luca/      # Project scaffolding CLI
docs/               # Documentation
.planning/          # Runtime artifacts (memory stored in MuninnDB)
```

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

> **Note:** The existing base classes (`BaseAgentImpl`, `BaseSkillImpl`, `BaseRuleImpl`) are a legacy exception. New code should prefer functional patterns.

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

Verification uses `bunx --bun tsc --noEmit` (type checking). Tests are not currently used. They were removed wholesale to prevent memory exhaustion from orphaned processes.

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

| Scope       | Use For                 |
| ----------- | ----------------------- |
| `cli`       | CLI package changes     |
| `agents`    | Agent definitions       |
| `skills`    | Skill definitions       |
| `rules`     | Rule definitions        |
| `workflows` | Workflow system changes |
| `config`    | Configuration changes   |

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
- [ ] Type checking passes (`bunx --bun tsc --noEmit`)
- [ ] Commits follow conventional commit format
- [ ] Agent/skill/rule files follow naming convention (`*.agent.ts`, `*.skill.ts`, `*.rule.ts`)

---

_This document is the authoritative source for Luca Framework coding standards. All contributions must conform to these patterns._
