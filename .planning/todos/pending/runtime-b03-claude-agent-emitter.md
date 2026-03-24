---
title: "Runtime B03: Claude adapter agent emitter — extract compileAgentClaude and buildAgentFrontmatter"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01]
phase: runtime-b
estimated_files: 1
---

## Context

The existing `compileAgentClaude` function and its helper `buildAgentFrontmatter` live in `src/compilers/__helpers/compile.ts` (lines 49-96). These functions compile a `BaseAgent` into Claude-format markdown with optional YAML frontmatter. This task extracts them into the Claude adapter subdirectory as `src/adapters/claude/agent-emitter.ts`, keeping the exact same logic and output.

This is a **pure extraction** — no behavioral changes. The output of `emitAgentMarkdown(agent)` must be byte-identical to `compileAgentClaude(agent)` for every agent in the registry.

## Task

Create the file `src/adapters/claude/agent-emitter.ts`.

### Directory Setup

Create the directory:

```
src/adapters/
  claude/
    agent-emitter.ts
```

### Functions to Implement

**`buildAgentFrontmatter`** — extracted verbatim from `src/compilers/__helpers/compile.ts` lines 49-75. This is a private helper (not exported):

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Build YAML frontmatter for agents with cognition and/or context config.
 *
 * Returns a YAML frontmatter block string. The frontmatter always includes
 * name and description. Cognition and context blocks are included only when
 * the agent defines them.
 *
 * @param agent - The agent whose frontmatter config to process
 * @returns YAML frontmatter string (always present, includes at minimum name + description)
 */
function buildAgentFrontmatter(agent: BaseAgent): string {
  const cognition = agent.config.frontmatter.cognition;
  const context = agent.config.frontmatter.context;

  const frontmatterData: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };

  if (cognition) {
    frontmatterData.cognition = {
      default_tier: cognition.default_tier,
      promotable_to: cognition.promotable_to,
      memory_tags: cognition.memory_tags,
    };
  }

  if (context) {
    frontmatterData.context = {
      default_tier: context.default_tier,
      promotable_to: context.promotable_to,
      isolation: context.isolation,
    };
  }

  return formatFrontmatter(frontmatterData);
}
```

**`emitAgentMarkdown`** — extracted from `compileAgentClaude` at `src/compilers/__helpers/compile.ts` lines 92-96. This is the public function:

````typescript
/**
 * Compile an agent definition to Claude Code format markdown.
 *
 * Calls agent.toClaudeFormat() for the markdown body, then prepends
 * YAML frontmatter with name, description, and optional cognition/context config.
 *
 * This function produces byte-identical output to the original
 * compileAgentClaude() in src/compilers/__helpers/compile.ts.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string with YAML frontmatter prefix
 *
 * @example
 * ```typescript
 * import { emitAgentMarkdown } from "~/adapters/claude/agent-emitter";
 * const markdown = emitAgentMarkdown(myAgent);
 * // Returns: "---\nname: my-agent\ndescription: ...\n---\n\n# my-agent ..."
 * ```
 */
export function emitAgentMarkdown(agent: BaseAgent): string {
  const markdown = agent.toClaudeFormat();
  const frontmatter = buildAgentFrontmatter(agent);
  return `${frontmatter}\n\n${markdown}`;
}
````

### Imports

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";
```

### Exports

Only `emitAgentMarkdown` is exported. `buildAgentFrontmatter` is a private helper.

```typescript
export { emitAgentMarkdown };
```

### Backward Compatibility

The original `compileAgentClaude` in `src/compilers/__helpers/compile.ts` is NOT modified in this task. The refactoring of `compile.ts` to delegate to this emitter happens in B08.

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/claude/agent-emitter.ts` exists
- Exports `emitAgentMarkdown` function with signature `(agent: BaseAgent) => string`
- Uses `formatFrontmatter` from `~/shared/__helpers/utils`
- Imports `BaseAgent` from `~/agents/__schemas/agent.schemas`
- No TypeScript errors
- No classes used
- File uses kebab-case naming

## Notes

- The function is named `emitAgentMarkdown` (not `compileAgentClaude`) to match the adapter domain's "emitter" naming convention. The old name is preserved in `src/compilers/` for backward compatibility.
- `buildAgentFrontmatter` is intentionally NOT exported. It is an implementation detail of the Claude adapter's agent emitter. If other adapters need frontmatter generation, they should use `formatFrontmatter` from shared directly.
