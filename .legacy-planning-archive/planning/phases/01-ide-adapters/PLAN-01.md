---
phase: 1
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: [0]
---

# Phase 1 Plan 1: Cursor Adapter (E01)

## Objective

Implement the Cursor IDE adapter that compiles Luca definitions to `.cursor/` format. Cursor is the thinnest adapter -- rules need `.mdc` frontmatter compilation, hooks need camelCase event name mapping, skills are a passthrough, and agents return Claude-format markdown (Cursor has no dedicated agent format).

## Context

@src/adapters/**schemas/adapter.schemas.ts (Adapter interface, EmitResult)
@src/adapters/claude/claude-adapter.ts (reference implementation pattern)
@src/adapters/claude/rule-emitter.ts (rule compilation pattern -- NOTE: Cursor MUST NOT call toClaudeFormat)
@src/rules/**schemas/rule.schemas.ts (BaseRule type, RuleFrontmatter with description/globs/alwaysApply)
@src/skills/**schemas/skill.schemas.ts (BaseSkill type, SkillFrontmatter with name/description)
@src/agents/**schemas/agent.schemas.ts (BaseAgent type, AgentFrontmatter)
@src/shared/**helpers/utils.ts (formatFrontmatter utility)
@src/shared/**helpers/format.ts (SectionSchema -- title + content + order, toClaudeFormat)
@.planning/todos/pending/runtime-e01-cursor-adapter.md (full spec)
@.planning/phases/01-ide-adapters/PREMORTEM.md (Risk #1: never call toClaudeFormat)

## Tasks

### 1. Create cursor-adapter.ts with Adapter implementation

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/cursor/cursor-adapter.ts` with a `createCursorAdapter()` factory function returning an `Adapter` object.

**Adapter config:**

```typescript
config: {
  name: "cursor",
  description: "Cursor IDE (.cursor/ directory artifacts)",
  supportedFeatures: {
    agents: false,    // No dedicated Cursor agent format
    skills: true,     // SKILL.md passthrough
    rules: true,      // .mdc compilation
    hooks: true,      // hooks.json with camelCase events
    workflows: false,
    headless: false,
  },
}
```

**compileRule implementation (CRITICAL -- compile from config, NOT toClaudeFormat):**

Read from `rule.config.frontmatter` and `rule.config.sections` directly. Never call `rule.toClaudeFormat()`.

Frontmatter mapping:

- `description` -> `description` (passthrough)
- `globs` (array) -> `globs` (join with `, ` if array)
- `alwaysApply` -> `alwaysApply` (boolean, default false)
- If no `globs` and no `alwaysApply`, set `alwaysApply: true`

Body: concatenate `rule.config.sections` in order, each as `## {section.title}\n\n{section.content}`.

Output format:

```
---
description: {description}
globs: {joined globs}
alwaysApply: {boolean}
---

{sections concatenated}
```

**compileSkill implementation:**

Passthrough -- return skill sections concatenated as markdown. Cursor uses agentskills.io SKILL.md format identical to Claude Code.

**compileAgent implementation:**

Return Claude-format markdown (Cursor reads general markdown context via rules). Use `agent.config.sections` to build markdown body. Agent compilation returns a string but Cursor has no dedicated agent directory.

**emit implementation (stub):**

Same pattern as Claude adapter -- stub that returns empty EmitResult. Will be wired when build pipeline becomes adapter-aware.

**detect implementation:**

Check for `.cursor` directory existence at `projectRoot`.

**Files to create/edit:**

- `src/adapters/cursor/cursor-adapter.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `compileRule` reads from `rule.config.frontmatter` and `rule.config.sections` -- NOT `toClaudeFormat()`
- `compileRule` output has valid YAML frontmatter with `description`, `globs`, `alwaysApply`
- If rule has no globs and no alwaysApply, output sets `alwaysApply: true`

### 2. Create cursor hook event mapping helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/cursor/cursor-hook-map.ts` with the event mapping table as a typed const.

**Event mapping (Claude -> Cursor):**

| Claude Code event | Cursor event       | Supported           |
| ----------------- | ------------------ | ------------------- |
| PreToolUse        | preToolUse         | yes                 |
| PostToolUse       | postToolUse        | yes                 |
| Stop              | stop               | yes                 |
| SessionStart      | sessionStart       | yes                 |
| SessionEnd        | sessionEnd         | yes                 |
| SubagentStop      | subagentStop       | yes                 |
| SubagentStart     | subagentStart      | yes                 |
| UserPromptSubmit  | beforeSubmitPrompt | yes                 |
| Notification      | (unsupported)      | no -- drop silently |

Export:

- `CURSOR_EVENT_MAP: Record<string, string | null>` -- maps Claude event names to Cursor event names (null = unsupported)
- `translateCursorEvent(claudeEvent: string): string | null` -- lookup function

**Files to create/edit:**

- `src/adapters/cursor/cursor-hook-map.ts` (new)

**Verification:**

- All 9 Claude events are mapped (8 to Cursor events, 1 to null)
- `translateCursorEvent("UserPromptSubmit")` returns `"beforeSubmitPrompt"`
- `translateCursorEvent("Notification")` returns `null`

### 3. Create barrel index

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create `src/adapters/cursor/index.ts` as a barrel re-exporting `createCursorAdapter` and the hook map.

**Files to create/edit:**

- `src/adapters/cursor/index.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createCursorAdapter` is importable from `~/adapters/cursor`

## Verification

- `bunx --bun tsc --noEmit` passes with all Cursor adapter code
- `bun run scripts/check-domain-boundaries.ts` reports no violations (adapters T3 imports from T0-T2 only)
- Rule compilation reads from `config.frontmatter` and `config.sections` directly (PREMORTEM constraint #1)
- Hook event mapping covers all 9 Claude events
- `createCursorAdapter()` returns an object satisfying the `Adapter` type

## Success Criteria

- Cursor adapter compiles rules to `.mdc` format with valid YAML frontmatter
- Hook event map correctly translates all supported events to camelCase
- Skills are a passthrough (no transformation)
- Agent compilation returns markdown (no Cursor agent format exists)
- Adapter passes TypeScript type checking as a valid `Adapter` implementation

## Output Specification

- `src/adapters/cursor/cursor-adapter.ts` -- main adapter
- `src/adapters/cursor/cursor-hook-map.ts` -- event name mapping
- `src/adapters/cursor/index.ts` -- barrel
