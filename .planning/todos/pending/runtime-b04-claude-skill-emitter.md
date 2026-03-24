---
title: "Runtime B04: Claude adapter skill emitter — extract compileSkillClaude and compileSkillPlugin"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01]
phase: runtime-b
estimated_files: 1
---

## Context

The existing `compileSkillClaude` and `compileSkillPlugin` functions live in `src/compilers/__helpers/compile.ts` (lines 104-174). `compileSkillClaude` calls `skill.toClaudeFormat()` directly. `compileSkillPlugin` adds YAML frontmatter with the skill's description before the markdown body. This task extracts both into `src/adapters/claude/skill-emitter.ts`.

This is a **pure extraction** — no behavioral changes.

## Task

Create the file `src/adapters/claude/skill-emitter.ts`.

### Functions to Implement

**`emitSkillMarkdown`** — extracted from `compileSkillClaude` at `src/compilers/__helpers/compile.ts` lines 104-106:

```typescript
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";

/**
 * Compile a skill definition to Claude Code format markdown.
 *
 * Calls skill.toClaudeFormat() to generate the markdown body.
 * No frontmatter is added for the standard Claude format — Claude Code
 * discovers skills by directory structure, not by frontmatter.
 *
 * This function produces byte-identical output to the original
 * compileSkillClaude() in src/compilers/__helpers/compile.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string
 */
export function emitSkillMarkdown(skill: BaseSkill): string {
  return skill.toClaudeFormat();
}
```

**`emitSkillPluginMarkdown`** — extracted from `compileSkillPlugin` at `src/compilers/__helpers/compile.ts` lines 170-174:

```typescript
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Compile a skill definition to Claude Code plugin format markdown.
 *
 * Plugin skills require YAML frontmatter with at least a `description` field
 * for discoverability in the plugin marketplace. The markdown body is the
 * same as the standard Claude format.
 *
 * This function produces byte-identical output to the original
 * compileSkillPlugin() in src/compilers/__helpers/compile.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with description frontmatter
 */
export function emitSkillPluginMarkdown(skill: BaseSkill): string {
  const markdown = skill.toClaudeFormat();
  const frontmatter = formatFrontmatter({ description: skill.description });
  return `${frontmatter}\n\n${markdown}`;
}
```

### Imports

```typescript
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";
```

### Exports

```typescript
export { emitSkillMarkdown, emitSkillPluginMarkdown };
```

### Backward Compatibility

The original `compileSkillClaude` and `compileSkillPlugin` in `src/compilers/__helpers/compile.ts` are NOT modified in this task. The refactoring happens in B08.

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/claude/skill-emitter.ts` exists
- Exports `emitSkillMarkdown` with signature `(skill: BaseSkill) => string`
- Exports `emitSkillPluginMarkdown` with signature `(skill: BaseSkill) => string`
- Uses `formatFrontmatter` from `~/shared/__helpers/utils`
- Imports `BaseSkill` from `~/skills/__schemas/skill.schemas`
- No TypeScript errors
- No classes used
- File uses kebab-case naming

## Notes

- Both functions are extracted because the Claude adapter needs both the standard and plugin compilation paths. The plugin format is a superset of the standard format (adds frontmatter).
- `emitSkillMarkdown` is trivially simple (one-liner) but is extracted as a named function for consistency with the emitter pattern and to decouple the adapter from the compiler's `skill.toClaudeFormat()` call chain.
