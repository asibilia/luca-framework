# Luca Framework - Dynamic Generator System

This framework allows for bidirectional conversion between TypeScript definitions and Cursor/Claude format files.

## Overview

The Luca Framework provides a system for defining agents, skills, and rules in TypeScript, which can then be compiled to both Cursor and Claude formats. Additionally, existing Cursor format files can be converted to TypeScript definitions.

## Directory Structure

```
src/
├── agents/          # [T2 Entity] Agent definitions
│   ├── __schemas/   # Agent Zod schemas and types
│   ├── __helpers/   # Factory functions and utilities
│   ├── general/     # General agents
│   └── luca/        # Luca-specific agents
├── skills/          # [T2 Entity] Skill definitions
│   ├── __schemas/   # Skill Zod schemas and types
│   ├── __helpers/   # Factory functions and utilities
│   ├── general/     # General skills
│   └── luca/        # Luca-specific skills
├── rules/           # [T2 Entity] Rule definitions
│   ├── __schemas/   # Rule Zod schemas and types
│   ├── __helpers/   # Factory functions and utilities
│   ├── general/     # General rules
│   └── profiles/    # Rule profile configurations
├── memory/          # [T1 Core] Memory system
│   ├── __schemas/   # Memory Zod schemas and types
│   └── __helpers/   # Bridge, compression, parsing, scoring
├── planner/         # [T1 Core] Plan management
│   ├── __schemas/   # Planner Zod schemas and types
│   └── __helpers/   # Cost-model, scheduler, scoring, weekly
├── iteration/       # [T1 Core] Iteration engine
│   ├── __schemas/   # Iteration Zod schemas and types
│   └── __helpers/   # Budget, checkpoint, classifier, convergence
├── context/         # [T1 Core] Context tier management
│   ├── __schemas/   # Context Zod schemas and types
│   └── __helpers/   # Assembler, defaults, envelope, aggregator
├── harness/         # [T1 Core] Verification harness
│   ├── __schemas/   # Harness Zod schemas and types
│   ├── __helpers/   # Runner implementation
│   └── parsers/     # Output parsers (bun-test, tsc, eslint, generic)
├── observability/   # [T1 Core] Agent scorecard engine
│   ├── __schemas/   # Scorecard Zod schemas and types
│   └── __helpers/   # Scorecard CRUD, query, report, persistence
├── shared/          # [T0 Foundation] Cross-domain utilities
│   ├── __schemas/   # Shared Zod schemas (Result<T> type)
│   └── __helpers/   # cli-utils, format, validation, deep-freeze
├── complexity/      # [T0 Foundation] Complexity gating
│   ├── __schemas/   # Complexity Zod schemas and types
│   └── __helpers/   # Default matrix and classifications
├── compilers/       # [T3 Build] Compilation pipeline
│   ├── __schemas/   # Plugin manifest schemas
│   └── __helpers/   # Compile functions (Claude/Cursor/Plugin)
├── hooks/           # [T3 Build] Hook registry and config
│   ├── __schemas/   # Hook definition schemas
│   ├── __helpers/   # Registry and config generators
│   └── scripts/     # Hook shell scripts
```

> **Note:** `__schemas/` and `__helpers/` directories use the double-underscore prefix convention to visually separate internal infrastructure from entity directories. See `.claude/rules/module-boundary.md` for import rules. All cross-domain imports use the `~/` path alias (resolves to `src/`).

## Scripts

### Generation Scripts

Convert existing .cursor files to TypeScript definitions:

```bash
# Generate all TypeScript files from existing .cursor files
bun run generate:from-cursor

# Or run individually:
bun run ./scripts/generate-agents-from-cursor.ts
bun run ./scripts/generate-skills-from-cursor.ts
bun run ./scripts/generate-rules-from-cursor.ts
```

### Compilation Scripts

Compile TypeScript definitions to Cursor and Claude formats:

```bash
# Build all output formats (Cursor + Claude)
bun run build:all

# Build Cursor format only
bun run build:cursor

# Build Claude format only
bun run build:claude
```

## Usage

### Creating New Agents, Skills, or Rules

1. Create a new TypeScript file in the appropriate directory (`src/agents/general/`, `src/skills/general/`, or `src/rules/general/`)
2. Extend the appropriate base class (`BaseAgentImpl`, `BaseSkillImpl`, or `BaseRuleImpl`)
3. Define your configuration in the constructor
4. Use the `toCursorFormat()` or `toClaudeFormat()` methods to generate the appropriate format

### Example Agent Definition

```typescript
import { BaseAgentImpl } from "../base/base-agent";
import { AgentConfig } from "../types/agent.types";

const exampleAgentConfig: AgentConfig = {
  frontmatter: {
    name: "example-agent",
    description: "An example agent for demonstration purposes",
    tools: ["Read", "Write", "Grep"],
    color: "blue",
  },
  sections: [
    {
      title: "role",
      content: "You are an example agent...",
      order: 1,
    },
  ],
};

export class ExampleAgent extends BaseAgentImpl {
  constructor() {
    super(exampleAgentConfig);
  }
}
```

## Bidirectional Conversion

The system supports:

- **Forward conversion**: TypeScript definitions → Cursor/Claude formats
- **Reverse conversion**: Cursor format files → TypeScript definitions

This ensures that existing .cursor files can be converted to maintainable TypeScript code, while new functionality can be defined in TypeScript and compiled to the appropriate format.

## Compilers

The framework compiles TypeScript definitions to platform-specific formats via functional compile functions in `src/compilers/compile.ts`:

- `compileAgent(agent, format)` / `compileSkill(skill, format)` / `compileRule(rule, format)`: Format-dispatching functions supporting `"CLAUDE"`, `"CURSOR"`, and `"PLUGIN"` output formats
- Platform-specific functions (`compileAgentClaude`, `compileAgentCursor`, etc.) handle the actual conversion

## Future Enhancements

- Automatic synchronization between TypeScript definitions and .cursor files
- Enhanced parsing for complex section structures in original files
- Integration with build systems for automatic compilation
- Support for additional output formats
