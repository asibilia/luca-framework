---
id: 19-02
title: Plugin Compiler
phase: 19-plugin-infrastructure
wave: 1
delivers: PLUG-03
depends_on: null
tasks: 2
---

# Plan 19-02: Plugin Compiler

## Objective

Create the `PluginCompiler` that extends `BaseCompiler` and generates Claude Code plugin-format output. The plugin format reuses the Claude markdown format (H1 heading + H2 sections) since plugins use the same SKILL.md and agent markdown files as .claude/ output. The compiler adds plugin-specific behavior: YAML frontmatter for agents (with cognition/context config) and skill description metadata.

## Context

- **ClaudeCompiler precedent:** `src/compilers/claude.compiler.ts` — closest format to plugin output
- **Plugin skills use same SKILL.md format** as `.claude/skills/<name>/SKILL.md`
- **Plugin agents use same .md format** as `.claude/agents/<name>.md`
- **Key difference:** Plugin compiler does NOT need to generate rules (plugins can't inject rules). Rules are handled in Phase 20 (rules-as-skills conversion).

## Design Decision

The `PluginCompiler` delegates to the entity's `toClaudeFormat()` method since plugin content format matches Claude format exactly. The compiler adds the same YAML frontmatter as `ClaudeCompiler` for agents with cognition/context config. This avoids adding `toPluginFormat()` methods to every entity class — the structural differences (directory layout) are handled by the build script, not the compiler.

## Files

### Create

- `src/compilers/plugin.compiler.ts` — Plugin compiler extending BaseCompiler

## Tasks

### Task 1: Create src/compilers/plugin.compiler.ts

**Goal:** Implement the PluginCompiler class.

**File:** `src/compilers/plugin.compiler.ts` (new)

```typescript
/**
 * Compiler for generating Claude Code plugin output.
 *
 * The plugin format reuses Claude markdown format (H1 + H2 sections)
 * since Claude Code plugins use the same SKILL.md and agent .md files.
 * YAML frontmatter is emitted for agents with cognition/context config,
 * matching the ClaudeCompiler behavior.
 *
 * Key difference from ClaudeCompiler: plugins do NOT compile rules
 * (plugins cannot inject .claude/rules/). Rules are converted to
 * skills in Phase 20 (PACK-04).
 */
import { BaseCompiler } from "./base.compiler";
import type { BaseAgent } from "../agents/types/agent.types";
import type { BaseSkill } from "../skills/types/skill.types";
import type { BaseRule } from "../rules/types/rule.types";
import type { SupportedFormat } from "./base.compiler";
import { formatFrontmatter } from "../shared/utils";

export class PluginCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    const markdown = agent.toClaudeFormat();

    const cognition = agent.config.frontmatter.cognition;
    const context = agent.config.frontmatter.context;

    // Emit YAML frontmatter for cognition/context (same as ClaudeCompiler)
    if (cognition || context) {
      const frontmatterData: Record<string, unknown> = {
        name: agent.name,
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

      const yamlBlock = formatFrontmatter(frontmatterData);
      return `${yamlBlock}\n\n${markdown}`;
    }

    return markdown;
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toClaudeFormat();
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    // Plugins cannot inject rules directly.
    // Rules are compiled as skills in Phase 20 (rules-as-skills).
    // This method still works for any callers that invoke it,
    // returning Claude-format markdown.
    return rule.toClaudeFormat();
  }
}
```

### Task 2: Create plugin compiler tests

**Goal:** Validate the plugin compiler produces correct output.

**File:** `src/compilers/plugin.compiler.test.ts` (new)

Test:

1. `compileAgent()` produces Claude-format markdown for agent without cognition
2. `compileAgent()` includes YAML frontmatter for agent with cognition config
3. `compileAgent()` includes YAML frontmatter for agent with context config
4. `compileSkill()` produces Claude-format markdown
5. `compileRule()` produces Claude-format markdown (fallback behavior)
6. Output matches ClaudeCompiler output for same input (parity check)

## Verification

- [ ] `PluginCompiler` extends `BaseCompiler`
- [ ] Agent output includes YAML frontmatter when cognition/context present
- [ ] Skill output matches Claude format
- [ ] All tests pass: `bun test src/compilers/plugin.compiler.test.ts`
- [ ] No existing tests broken
