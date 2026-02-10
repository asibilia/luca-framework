# Luca Framework - Dynamic Generator System

This framework allows for bidirectional conversion between TypeScript definitions and Cursor/Claude format files.

## Overview

The Luca Framework provides a system for defining agents, skills, and rules in TypeScript, which can then be compiled to both Cursor and Claude formats. Additionally, existing Cursor format files can be converted to TypeScript definitions.

## Directory Structure

```
src/
├── agents/          # Agent definitions in TypeScript
│   ├── base/        # Base agent implementation
│   ├── general/     # General agents generated from .cursor files
│   ├── luca/        # Luca-specific agents
│   └── types/       # Type definitions
├── skills/          # Skill definitions in TypeScript
│   ├── base/        # Base skill implementation
│   ├── general/     # General skills generated from .cursor files
│   ├── luca/        # Luca-specific skills
│   └── types/       # Type definitions
├── rules/           # Rule definitions in TypeScript
│   ├── base/        # Base rule implementation
│   ├── general/     # General rules generated from .cursor files
│   ├── luca/        # Luca-specific rules
│   └── types/       # Type definitions
├── compilers/       # Compilation logic
├── shared/          # Shared utilities
```

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

Compile TypeScript definitions back to .cursor format:

```bash
# Create build system for compilation
bun run compile:to-cursor
```

## Usage

### Creating New Agents, Skills, or Rules

1. Create a new TypeScript file in the appropriate directory (`src/agents/general/`, `src/skills/general/`, or `src/rules/general/`)
2. Extend the appropriate base class (`BaseAgentImpl`, `BaseSkillImpl`, or `BaseRuleImpl`)
3. Define your configuration in the constructor
4. Use the `toCursorFormat()` or `toClaudeFormat()` methods to generate the appropriate format

### Example Agent Definition

```typescript
import { BaseAgentImpl } from '../base/base-agent';
import { AgentConfig } from '../types/agent.types';

const exampleAgentConfig: AgentConfig = {
  frontmatter: {
    name: 'example-agent',
    description: 'An example agent for demonstration purposes',
    tools: ['Read', 'Write', 'Grep'],
    color: 'blue'
  },
  sections: [
    {
      title: 'role',
      content: 'You are an example agent...',
      order: 1
    }
  ]
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

The framework includes compilers for both Cursor and Claude formats:

- `CursorCompiler`: Converts TypeScript definitions to Cursor markdown format with frontmatter
- `ClaudeCompiler`: Converts TypeScript definitions to Claude-compatible format

## Future Enhancements

- Automatic synchronization between TypeScript definitions and .cursor files
- Enhanced parsing for complex section structures in original files
- Integration with build systems for automatic compilation
- Support for additional output formats
