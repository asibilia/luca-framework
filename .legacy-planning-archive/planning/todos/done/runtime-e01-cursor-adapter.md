---
title: "Runtime E01: Cursor adapter — compile Luca definitions to .cursor/ format"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/research/ide-ecosystems.md
depends_on: [B01, B02]
phase: runtime-e
estimated_files: 4
---

## Context

Cursor is co-Tier-1 with Claude Code. It uses the same JSON stdio hook protocol, the same SKILL.md format (agentskills.io standard, stable since Cursor 2.4 in January 2026), and `.mdc` frontmatter rules. The adapter delta from Claude Code is small: rules need `.mdc` frontmatter compilation, hooks need event name mapping, and skills are a passthrough.

Research source: `docs/runtime-architecture/research/ide-ecosystems.md` (Pre-Grooming Notes section confirms Cursor skills are STABLE, hooks use Claude-compatible JSON stdio protocol with `CLAUDE_PROJECT_DIR` alias).

## Task

### 1. Create adapter file

**File:** `src/adapters/cursor/cursor-adapter.ts`

Implement a `cursorAdapter` object satisfying the `Adapter` interface from `src/workflow/__schemas/adapter.schemas.ts` (defined in Phase B). The adapter must export:

```typescript
export const cursorAdapter: Adapter = {
  id: "cursor",
  name: "Cursor IDE",
  version: "1.0.0",
  outputDir: ".cursor",

  compileAgent(agent: AgentConfig): string { ... },
  compileSkill(skill: SkillConfig): string { ... },
  compileRule(rule: RuleConfig): string { ... },
  compileHooks(hooks: HookConfig[]): Record<string, unknown> { ... },
  validate(output: AdapterOutput): CompatibilityReport { ... },
  emit(output: AdapterOutput, targetDir: string): void { ... },
}
```

### 2. Rule compilation: internal rules to `.mdc` format

Each Luca rule definition (from `src/rules/`) must be compiled to a `.cursor/rules/{name}.mdc` file with YAML frontmatter.

**Frontmatter mapping:**

| Luca rule field | Cursor `.mdc` field | Notes |
|---|---|---|
| `description` | `description` | Direct passthrough |
| `globs` (array) | `globs` | Join with `, ` if array |
| `alwaysApply` | `alwaysApply` | Boolean, default `false` |

**Output format for each rule:**

```
---
description: {rule.description}
globs: {rule.globs joined with ", "}
alwaysApply: {rule.alwaysApply ?? false}
---

{rule.body}
```

If a rule has no `globs` and no `alwaysApply`, set `alwaysApply: true` (Cursor treats rules without frontmatter as "always apply" but explicit is better).

### 3. Skill compilation: passthrough SKILL.md

Cursor uses the agentskills.io SKILL.md format, identical to Claude Code. The `compileSkill` method copies the SKILL.md content verbatim. Output directory: `.cursor/skills/{skill-name}/SKILL.md`.

No format transformation needed. This is a filesystem passthrough.

### 4. Hook compilation: map event names and emit `.cursor/hooks.json`

Cursor hooks use the same JSON stdio protocol as Claude Code but with different event names (camelCase).

**Event mapping table:**

| Claude Code event | Cursor event | Notes |
|---|---|---|
| `PreToolUse` | `preToolUse` | Same semantics |
| `PostToolUse` | `postToolUse` | Same semantics |
| `Stop` | `stop` | Same semantics |
| `SessionStart` | `sessionStart` | Fire-and-forget |
| `SessionEnd` | `sessionEnd` | Fire-and-forget |
| `SubagentStop` | `subagentStop` | Same semantics |
| `SubagentStart` | `subagentStart` | Same semantics |
| `UserPromptSubmit` | `beforeSubmitPrompt` | Name differs |
| `Notification` | (unsupported) | Drop silently |

**Output format:** `.cursor/hooks.json` — a JSON object where keys are event names and values are arrays of hook definitions:

```json
{
  "preToolUse": [
    {
      "command": ".cursor/hooks/pre-tool-use.sh",
      "blocking": true,
      "matchers": [{ "tool_name": "Edit" }, { "tool_name": "Write" }]
    }
  ]
}
```

Each hook script from `.claude/hooks/` is copied to `.cursor/hooks/` and referenced with the new path.

### 5. Agent compilation

Cursor does not have a dedicated agent format like `.claude/agents/`. Skip agent compilation. Set `compileAgent` to return the Claude-format agent markdown (Cursor can read general markdown context via rules). Document this gap in the compatibility report.

### 6. Register in adapter registry

**File:** `src/adapters/index.ts`

Add `cursorAdapter` to the adapter registry export alongside `claudeAdapter`.

### 7. Create barrel

**File:** `src/adapters/cursor/index.ts`

```typescript
export { cursorAdapter } from "./cursor-adapter";
```

## Verification

- `bunx --bun tsc --noEmit` passes with all adapter code
- `bun run scripts/check-domain-boundaries.ts` reports no violations (adapters is T3, imports from T0-T2 are downward)
- Compiled `.mdc` rule files contain valid YAML frontmatter with `description`, `globs`, `alwaysApply` fields
- Compiled `.cursor/hooks.json` is valid JSON with correct event name mapping
- Skills are copied verbatim as SKILL.md files
- Compatibility report documents: rules (fully mapped), skills (fully mapped), hooks (partially mapped — Notification dropped), agents (not mapped — no Cursor agent format)
- No rule file exceeds Cursor's undocumented but reasonable size limits

## Notes

- Cursor's deliberate Claude Code compatibility (same hook protocol, same exit code `2` semantics, `CLAUDE_PROJECT_DIR` env var) means this adapter is the thinnest of the three Phase E adapters.
- Hook scripts do NOT need rewriting — they use the same JSON stdio protocol. Only the config file format changes (`.cursor/hooks.json` vs `.claude/settings.json` hooks section).
