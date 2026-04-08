# Adapter Architecture Design

**Date:** 2026-03-23
**Status:** Proposed
**Parent:** [Architectural Vision](./architectural-vision.md)

## Overview

Refactor Luca's compiler into a pluggable adapter system. Each adapter translates DAG workflow steps and agent/skill definitions into a format consumable by a specific execution environment. This makes Luca IDE-independent without abandoning any existing capability.

## Problem Statement

Luca currently targets only Claude Code. The `SupportedFormat` type in `src/compilers/__helpers/compile.ts` is:

```typescript
export type SupportedFormat = "CLAUDE" | "PLUGIN";
```

Both formats produce `.claude/` directory artifacts. If a developer moves to Cursor, Windsurf, or wants to run Luca workflows in CI/CD, their entire configuration is unusable.

## Design

### Domain Structure

```
src/adapters/
├── __schemas/
│   └── adapter.schemas.ts      # Adapter interface, AdapterConfig, AdapterOutput
├── __helpers/
│   └── adapter-registry.ts     # Registry for discovering/selecting adapters
├── claude/
│   ├── claude-adapter.ts       # Claude Code adapter (current behavior)
│   ├── skill-emitter.ts        # Emit SKILL.md from DAG steps
│   └── agent-emitter.ts        # Emit agent markdown from AgentConfig
├── api/
│   ├── api-adapter.ts          # Direct LLM API calls via Claude Agent SDK (headless mode)
│   └── api-executor.ts         # Execute DAG steps via Anthropic/OpenAI API
├── cursor/
│   └── cursor-adapter.ts       # Cursor .cursor/rules/ format (future)
└── index.ts                    # Barrel exports
```

### Adapter Interface

```typescript
// adapter.schemas.ts

import { z } from "zod";

/**
 * Every adapter implements this interface.
 *
 * - compileAgent: Transform an AgentConfig into the target format
 * - compileSkill: Transform a SkillConfig into the target format
 * - compileRule: Transform a RuleConfig into the target format
 * - executeStep: Execute a single DAG workflow step
 */
export const AdapterConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  supportedFeatures: z.object({
    agents: z.boolean().default(true),
    skills: z.boolean().default(true),
    rules: z.boolean().default(true),
    hooks: z.boolean().default(false),
    workflows: z.boolean().default(false),
    headless: z.boolean().default(false),
  }),
});

export type Adapter = {
  config: z.infer<typeof AdapterConfigSchema>;

  /** Compile an agent definition to the target format */
  compileAgent: (agent: AgentConfig) => string | object;

  /** Compile a skill definition to the target format */
  compileSkill: (skill: SkillConfig) => string | object;

  /** Compile a rule definition to the target format */
  compileRule: (rule: RuleConfig) => string | object;

  /** Execute a single DAG workflow step in this environment */
  executeStep: (
    step: WorkflowStep,
    context: ExecutionContext,
  ) => Promise<StepResult>;

  /** Generate output artifacts (files, configs) */
  emit: (outputDir: string) => Promise<EmitResult>;
};
```

### Claude Adapter

The Claude adapter encapsulates what Luca does today. It is a refactoring of the existing compiler pipeline, not a rewrite.

```typescript
// claude/claude-adapter.ts

/**
 * Claude Code adapter.
 *
 * Compiles agents/skills/rules to markdown artifacts in .claude/ directory.
 * Executes DAG steps by generating SKILL.md prose that Claude Code interprets.
 *
 * This is the default adapter and preserves 100% backward compatibility
 * with the existing Luca experience.
 */
export function createClaudeAdapter(): Adapter {
  return {
    config: {
      name: "claude",
      description: "Claude Code (.claude/ directory artifacts)",
      supportedFeatures: {
        agents: true,
        skills: true,
        rules: true,
        hooks: true,
        workflows: true,
        headless: false,
      },
    },

    compileAgent: (agent) => {
      // Existing toClaudeFormat() logic from create-agent.ts
    },

    compileSkill: (skill) => {
      // Existing toClaudeFormat() logic from create-skill.ts
    },

    compileRule: (rule) => {
      // Existing compileRuleClaude() logic
    },

    executeStep: async (step, context) => {
      // Generate prose instructions for Claude Code's Task/Skill tools
      // This is the "compilation" of a DAG step into the prose format
      // that lu.skill.ts currently contains hand-written
    },

    emit: async (outputDir) => {
      // Write .claude/ directory structure
      // Same as current build:all output
    },
  };
}
```

### API Adapter

The API adapter enables headless execution — Luca workflows without an IDE.

```typescript
// api/api-adapter.ts

/**
 * Direct API adapter.
 *
 * Executes DAG steps by making direct LLM API calls (Anthropic, OpenAI, etc.).
 * No IDE required. Enables CI/CD execution, headless overnight runs,
 * and agent evaluation.
 *
 * Uses the agent's compiled instructions as the system prompt,
 * and executes tool calls via local function implementations
 * (file read/write, git operations, shell commands).
 */
export function createApiAdapter(config: ApiAdapterConfig): Adapter {
  return {
    config: {
      name: "api",
      description: "Direct LLM API execution (headless)",
      supportedFeatures: {
        agents: true,
        skills: false, // Skills are IDE-specific slash commands
        rules: false, // Rules are IDE-specific context injection
        hooks: false, // Hooks are IDE-specific lifecycle events
        workflows: true,
        headless: true,
      },
    },

    compileAgent: (agent) => {
      // Return agent config as structured object (not markdown)
      // Used as system prompt for API calls
    },

    executeStep: async (step, context) => {
      // Make direct API call to LLM provider
      // Execute tool calls locally
      // Return structured StepResult
    },

    // ...
  };
}
```

### What Each Adapter Supports

| Feature            | Claude                           | API                           | Cursor (future)      |
| ------------------ | -------------------------------- | ----------------------------- | -------------------- |
| Agent compilation  | Markdown (.md)                   | Structured object             | .mdc format          |
| Skill compilation  | SKILL.md                         | N/A (skills are IDE-specific) | TBD                  |
| Rule compilation   | .claude/rules/\*.md              | N/A                           | .cursor/rules/\*.mdc |
| Hook support       | Shell scripts (16 events)        | N/A                           | TBD                  |
| Workflow execution | Prose → Claude Code interprets   | Direct LLM API calls          | TBD                  |
| Headless mode      | No (requires IDE)                | Yes                           | No (requires IDE)    |
| Multi-model        | Anthropic only (via Claude Code) | Any provider                  | Varies               |

## Migration Path

### Phase 1: Extract Claude Adapter (refactoring only)

Move the existing compiler logic into `src/adapters/claude/`. No behavioral changes. The `src/compilers/` domain becomes a thin orchestration layer that calls the adapter.

**Before:**

```
src/compilers/__helpers/compile.ts → compileAgentClaude()
```

**After:**

```
src/adapters/claude/claude-adapter.ts → compileAgent()
src/compilers/__helpers/compile.ts → adapter.compileAgent()  (thin wrapper)
```

### Phase 2: Add API Adapter

Implement `src/adapters/api/`. This is new functionality — Luca can now execute workflows headless.

### Phase 3: Wire DAG Engine to Adapters

The DAG executor calls `adapter.executeStep()` for each step. The adapter determines whether that means "generate prose for Claude Code" or "make an API call."

### Phase 4: Additional Adapters

Add Cursor, Windsurf, or other IDE adapters as needed.

## Relationship to Existing Systems

| Existing System            | Relationship                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/compilers/`           | Becomes thin orchestration over adapters. Eventually may be absorbed entirely.                                       |
| `src/hooks/`               | Hook generation stays IDE-specific. Each adapter that supports hooks implements its own hook emitter.                |
| `src/rules/`               | Rule compilation delegates to adapter.compileRule(). Format varies by target.                                        |
| `packages/luca-framework/` | The CLI (`vault-init`, `update`, etc.) asks the adapter registry which adapter to use based on detected environment. |
| `bun run build:all`        | Calls all registered adapters in sequence, producing artifacts for each supported format.                            |

## Open Questions

1. **Adapter discovery:** How does Luca know which adapter to use? Auto-detect from environment (`.claude/` exists → Claude adapter)? CLI flag? Config file?
2. **Feature parity:** The API adapter cannot support skills, rules, or hooks. Is a "workflow-only" headless mode sufficient, or do we need to rethink skills/rules as adapter-agnostic concepts?
3. ~~**Tool mapping:** Claude Code provides tools like Read, Write, Edit, Bash, Grep, Glob natively. The API adapter needs local implementations of these. How much of this tool bridge needs to be built?~~ **Resolved:** The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) provides all these tools natively. No custom tool bridge needed.
4. **Cost model:** The API adapter makes direct LLM calls (billed per token). The Claude adapter uses Claude Code's included context. How do we surface cost awareness?
