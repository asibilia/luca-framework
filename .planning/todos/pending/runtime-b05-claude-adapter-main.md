---
title: "Runtime B05: Claude adapter main — wire emitters into Adapter interface"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01, B03, B04]
phase: runtime-b
estimated_files: 2
---

## Context

The Claude adapter is the default adapter and preserves 100% backward compatibility with current Luca behavior. It compiles agents/skills/rules to markdown artifacts in the `.claude/` directory. Its `compileAgent`, `compileSkill`, and `compileRule` methods delegate to the emitters created in B03 and B04. Rule compilation is extracted inline (not a separate emitter file) because `compileRuleClaude` is compact (20 lines).

The `executeStep` method is left as a no-op stub returning `{ success: false, error: "..." }` — the DAG-to-prose compilation is new functionality that requires Phase A's `WorkflowStep` type and will be wired in B09.

The `emit` method is also a stub for now — the current `build:all` pipeline handles artifact emission directly. Wiring `emit` into the build pipeline is a future task.

## Task

### File 1: `src/adapters/claude/claude-adapter.ts`

Create the Claude adapter factory function.

```typescript
import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";
import { emitAgentMarkdown } from "./agent-emitter";
import { emitSkillMarkdown, emitSkillPluginMarkdown } from "./skill-emitter";

/**
 * Compile a rule definition to Claude Code format markdown.
 *
 * When the rule has scoping metadata (globs or explicit alwaysApply), YAML
 * frontmatter is prepended. This is the exact logic from the original
 * compileRuleClaude() in src/compilers/__helpers/compile.ts lines 119-139.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
function emitRuleMarkdown(rule: BaseRule): string {
  const markdown = rule.toClaudeFormat();
  const { description, globs, alwaysApply } = rule.config.frontmatter;

  const hasScoping =
    (globs !== undefined && globs.length > 0) || alwaysApply !== undefined;

  if (hasScoping) {
    const frontmatterData: Record<string, unknown> = { description };
    if (globs !== undefined && globs.length > 0) {
      frontmatterData.globs = globs;
    }
    if (alwaysApply !== undefined) {
      frontmatterData.alwaysApply = alwaysApply;
    }
    const frontmatter = formatFrontmatter(frontmatterData);
    return `${frontmatter}\n\n${markdown}`;
  }

  return markdown;
}

/**
 * Create the Claude Code adapter.
 *
 * Compiles agents/skills/rules to markdown artifacts in .claude/ directory.
 * Executes DAG steps by generating SKILL.md prose that Claude Code interprets
 * (executeStep is a stub until B09 wires DAG integration).
 *
 * This is the default adapter and preserves 100% backward compatibility
 * with the existing Luca experience.
 *
 * @returns A fully-configured Adapter instance for Claude Code
 *
 * @example
 * ```typescript
 * import { createClaudeAdapter } from "~/adapters/claude/claude-adapter";
 * const adapter = createClaudeAdapter();
 * const markdown = adapter.compileAgent(myAgent);
 * ```
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

    compileAgent: (agent: BaseAgent): string => {
      return emitAgentMarkdown(agent);
    },

    compileSkill: (skill: BaseSkill): string => {
      return emitSkillMarkdown(skill);
    },

    compileRule: (rule: BaseRule): string => {
      return emitRuleMarkdown(rule);
    },

    executeStep: async (
      _step: unknown,
      _context: Record<string, unknown>,
    ): Promise<AdapterStepResult> => {
      // Stub: DAG-to-prose compilation will be implemented in B09
      // when Phase A's WorkflowStep type is available.
      return {
        success: false,
        error:
          "Claude adapter executeStep is not yet implemented. " +
          "DAG-to-prose compilation requires Phase A WorkflowStep type (see B09).",
      };
    },

    emit: async (_outputDir: string) => {
      // Stub: artifact emission to .claude/ directory.
      // The current build:all pipeline handles this directly.
      // This will be wired when the build pipeline is adapter-aware.
      return { filesWritten: 0, filesPaths: [], warnings: [] };
    },

    detect: (projectRoot: string): boolean => {
      const { existsSync } = require("node:fs");
      const { join } = require("node:path");
      return existsSync(join(projectRoot, ".claude"));
    },
  };
}
```

**Important implementation detail for `detect`:** Use `existsSync` from `node:fs` with a `require` call inside the function body to keep the import lazy. Alternatively, use a top-level static import:

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
```

Either approach is acceptable. The top-level import is preferred per import-standards rule.

### File 2: `src/adapters/claude/index.ts`

Create a barrel for the Claude adapter subdirectory:

```typescript
/**
 * Claude Code adapter — compiles Luca definitions to .claude/ directory artifacts.
 */
export { createClaudeAdapter } from "./claude-adapter";
export { emitAgentMarkdown } from "./agent-emitter";
export { emitSkillMarkdown, emitSkillPluginMarkdown } from "./skill-emitter";
```

### Plugin Format Support

The Claude adapter also supports the "PLUGIN" format. The plugin format differs from Claude in two places:

1. `compileAgentPlugin` calls `compileAgentClaude` (identical output) — already handled by `emitAgentMarkdown`.
2. `compileSkillPlugin` adds description frontmatter — handled by `emitSkillPluginMarkdown`.
3. `compileRulePlugin` calls `compileRuleClaude` (identical output) — already handled by `emitRuleMarkdown`.

The `emitSkillPluginMarkdown` function is exported from the Claude adapter barrel so B08 can reference it when delegating plugin compilation.

### Exports from `src/adapters/claude/claude-adapter.ts`

```typescript
export { createClaudeAdapter };
```

The `emitRuleMarkdown` function is NOT exported — it is private to the adapter. External consumers compile rules via `adapter.compileRule(rule)`.

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/claude/claude-adapter.ts` exists and exports `createClaudeAdapter`
- File `src/adapters/claude/index.ts` exists and re-exports `createClaudeAdapter`, `emitAgentMarkdown`, `emitSkillMarkdown`, `emitSkillPluginMarkdown`
- `createClaudeAdapter()` returns an object satisfying the `Adapter` type from B01
- `compileAgent` delegates to `emitAgentMarkdown`
- `compileSkill` delegates to `emitSkillMarkdown`
- `compileRule` contains the extracted `compileRuleClaude` logic
- `executeStep` returns `{ success: false, error: "..." }` (stub)
- `emit` returns `{ filesWritten: 0, filesPaths: [], warnings: [] }` (stub)
- `detect` checks for `.claude` directory existence
- No TypeScript errors
- No classes used

## Notes

- The `executeStep` stub will be replaced with DAG-to-prose compilation in B09.
- The `emit` stub will be replaced when the build pipeline becomes adapter-aware (future task beyond Phase B).
- The `compileRule` logic is inlined in this file rather than extracted to a separate `rule-emitter.ts` because it is only 20 lines and only used by the Claude adapter. If Cursor or other adapters need rule compilation, they will implement their own emitters.
