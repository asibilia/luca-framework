# Luca Framework Coding Standards

> **Version:** 2.0.0
> **Last Updated:** 2026-02-10
> **Status:** Active

This document defines the coding standards and patterns for the Luca Framework codebase. All contributors and AI-generated code must follow these conventions.

---

## Table of Contents

1. [Overview](#overview)
2. [Naming & Structure](#naming--structure)
3. [Functions API](#functions-api)
4. [Types & Validation](#types--validation)
5. [Collections](#collections)
6. [Testing](#testing)
7. [Commit Conventions](#commit-conventions)
8. [Quick-Start Checklist](#quick-start-checklist)

---

## Overview

Luca Framework is a **TypeScript monorepo** using **Bun** as the runtime. The codebase defines agents, skills, and rules as TypeScript definitions that compile to Cursor and Claude formats. It follows strict patterns for consistency, type safety, and maintainability.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript (strict mode) |
| Database | File-based (.planning/ artifacts, JSON config) |
| Validation | Zod |
| Collections | Lodash |
| Testing | Bun Test |
| Build | unbuild |

### Key Commands

```bash
bun install            # Install dependencies
bun run build:all      # Build all output formats (Cursor + Claude)
bun run build:cursor   # Build Cursor format only
bun run build:claude   # Build Claude format only
bun test               # Run tests
bun test --coverage    # Run tests with coverage
```

---

## Naming & Structure

### File Naming: `kebab-case`

All files use `kebab-case` naming.

**DO:**

```
src/agents/general/lu-debugger.agent.ts
src/skills/general/lu-plan-phase.skill.ts
src/rules/general/schema-first-parsing.rule.ts
```

**DON'T:**

```
src/agents/general/LuDebugger.agent.ts
src/skills/general/luPlanPhase.skill.ts
```

### Planning Artifacts: `UPPERCASE.md`

Planning artifacts use uppercase naming:

```
.planning/BRAIN.md
.planning/MEMORY.md
.planning/WORKING.md
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
    agent_name: 'lu-debugger',
    description: 'Debugging agent',
    tool_list: ['Read', 'Write', 'Grep'],
};
```

**DON'T:**

```typescript
const agentConfig = {
    agentName: 'lu-debugger',   // camelCase - wrong
    toolList: ['Read', 'Write'], // camelCase - wrong
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
const MAX_CONTEXT_USAGE = 0.5
const DEFAULT_AGENT_COLOR = 'blue'
```

### Directory Structure

```
src/
  agents/           # Agent definitions
    base/           # Base agent implementation
    general/        # General agents
    luca/           # Luca-specific agents
    types/          # Agent type definitions and schemas
  skills/           # Skill definitions
    base/           # Base skill implementation
    general/        # General skills
    luca/           # Luca-specific skills
    types/          # Skill type definitions and schemas
  rules/            # Rule definitions
    base/           # Base rule implementation
    general/        # General rules
    types/          # Rule type definitions and schemas
  compilers/        # Cursor/Claude format compilers
  shared/           # Shared utilities, types, and formatters
scripts/            # Build and generation scripts
packages/           # Publishable packages
  luca-framework/   # Main distributable package
  create-luca/      # Project scaffolding CLI
docs/               # Documentation
.planning/          # Runtime artifacts (BRAIN, MEMORY, WORKING)
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
    output_format: 'cursor' | 'claude';
    dry_run?: boolean;
}) {
    // function logic
}

compileAgent({
    config: myAgent,
    output_format: 'cursor',
});
```

**DON'T:**

```typescript
function compileAgent(config: AgentConfig, outputFormat: string, dryRun: boolean = false) {
    // ...
}

// Unclear what 'cursor' and 'false' represent
compileAgent(myAgent, 'cursor', false);
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
    toCursorFormat() { /* ... */ }
}
```

> **Note:** The existing base classes (`BaseAgentImpl`, `BaseSkillImpl`, `BaseRuleImpl`) are a legacy exception. New code should prefer functional patterns.

---

## Types & Validation

### Zod Schemas as Source of Truth

Use Zod schemas as the single source of truth for both runtime validation and TypeScript types.

**DO:**

```typescript
import { z } from 'zod';

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
import { map, filter, groupBy, sortBy } from 'lodash';

const agentNames = map(
    filter(agents, { is_active: true }),
    'name'
);

const agentsByCategory = groupBy(agents, 'category');
```

**DON'T:**

```typescript
const agentNames = agents
    .filter(a => a.is_active)
    .map(a => a.name);
```

---

## Testing

### Bun Test Framework

Use Bun's built-in test framework with `describe`, `test`, and `expect`.

```typescript
import { describe, test, expect } from 'bun:test';
import { compileAgent } from '../cursor.compiler';

describe('compileAgent', () => {
    test('should generate valid cursor format', () => {
        const result = compileAgent({
            config: testAgentConfig,
            output_format: 'cursor',
        });

        expect(result).toContain('---');
        expect(result).toContain('name: test-agent');
    });
});
```

### Verification-Based Testing

Luca uses a verification-based approach with three levels:

| Level | Description |
|-------|-------------|
| EXISTS | File/artifact exists |
| SUBSTANTIVE | Content is meaningful and correct |
| WIRED | Integrations are connected and functional |

---

## Commit Conventions

Follow conventional commit format:

```
type(scope): description
```

### Types

| Type | Use For |
|------|---------|
| `feat` | New features |
| `fix` | Bug fixes |
| `docs` | Documentation changes |
| `refactor` | Code restructuring |
| `test` | Test additions or changes |
| `chore` | Maintenance tasks |

### Scopes

| Scope | Use For |
|-------|---------|
| `cli` | CLI package changes |
| `agents` | Agent definitions |
| `skills` | Skill definitions |
| `rules` | Rule definitions |
| `workflows` | Workflow system changes |
| `config` | Configuration changes |

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
- [ ] Tests use Bun's `describe`/`test`/`expect`
- [ ] Commits follow conventional commit format
- [ ] Agent/skill/rule files follow naming convention (`*.agent.ts`, `*.skill.ts`, `*.rule.ts`)

---

*This document is the authoritative source for Luca Framework coding standards. All contributions must conform to these patterns.*
