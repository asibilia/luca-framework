---
title: "Runtime E03: VS Code / Copilot adapter — compile to .github/ format with .claude/ passthrough"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/research/ide-ecosystems.md
depends_on: [B01, B02]
phase: runtime-e
estimated_files: 4
---

## Context

VS Code / GitHub Copilot is Tier 2. It deliberately reads `.claude/agents/` and `.claude/settings.json` natively, mapping Claude tool names to VS Code equivalents. The native format uses `.github/agents/` for agent profiles, `.github/skills/` for skills, and `.github/hooks/` for hooks (Preview API). Hooks are still in Preview as of March 2026 — mark all hook compilation as unstable.

Research source: `docs/runtime-architecture/research/ide-ecosystems.md` (VS Code section + Pre-Grooming Notes confirming `.claude/agents/` reading, hook Preview status, tool name differences).

## Task

### 1. Create adapter file

**File:** `src/adapters/vscode/vscode-adapter.ts`

Implement a `vscodeAdapter` object satisfying the `Adapter` interface:

```typescript
export const vscodeAdapter: Adapter = {
  id: "vscode",
  name: "VS Code / GitHub Copilot",
  version: "1.0.0",
  outputDir: ".github",

  compileAgent(agent: AgentConfig): string { ... },
  compileSkill(skill: SkillConfig): string { ... },
  compileRule(rule: RuleConfig): string { ... },
  compileHooks(hooks: HookConfig[]): Record<string, unknown> { ... },
  validate(output: AdapterOutput): CompatibilityReport { ... },
  emit(output: AdapterOutput, targetDir: string): void { ... },
}
```

### 2. Agent compilation: emit `.github/agents/{name}.agent.md`

VS Code agent profiles use `.agent.md` files with YAML frontmatter.

**Output format per agent:**

```markdown
---
name: { agent.name }
description: { agent.description }
tools: ["*"]
user-invocable: true
---

{agent.body}
```

**Frontmatter mapping:**

| Luca agent field | VS Code `.agent.md` field | Notes                               |
| ---------------- | ------------------------- | ----------------------------------- |
| `name`           | `name`                    | Lowercase, hyphens, max 64 chars    |
| `description`    | `description`             | Direct passthrough                  |
| `model_routing`  | `model`                   | Map tier to model string if present |
| (always)         | `tools`                   | Default to `["*"]`                  |
| (always)         | `user-invocable`          | Default to `true`                   |

**Character limit:** 30,000 chars per agent profile. If exceeded, truncate body with `[Truncated — see source at src/agents/...]` marker.

**Note on .claude/ passthrough:** Since VS Code reads `.claude/agents/` natively, the `.github/agents/` output is technically redundant for Claude-format agents. However, the `.github/agents/` format supports additional frontmatter fields (`handoffs`, `hooks`, `agents` for subagent routing) that `.claude/agents/` does not. Compile to `.github/agents/` as the primary output; the `.claude/agents/` passthrough is a bonus.

### 3. Skill compilation: emit `.github/skills/{name}/SKILL.md`

VS Code uses the agentskills.io SKILL.md standard, same as Claude Code and Cursor.

**Frontmatter additions for VS Code:**

```yaml
---
name: { skill.name }
description: { skill.description }
user-invocable: true
---
```

VS Code SKILL.md requires `name` and `description` in frontmatter (Claude Code does not require frontmatter in SKILL.md). If the source SKILL.md lacks frontmatter, prepend it.

Output directory: `.github/skills/{skill-name}/SKILL.md`.

### 4. Rule compilation: emit `.github/copilot-instructions.md`

VS Code uses a single `.github/copilot-instructions.md` file for custom instructions (equivalent to Claude Code's multi-file rules).

**Compilation strategy:**

1. Collect all rules that have `alwaysApply: true`
2. Sort by rule name alphabetically for deterministic output
3. Concatenate into a single markdown file with section headers:

```markdown
# Project Instructions

## {Rule 1 Name}

{Rule 1 body}

---

## {Rule 2 Name}

{Rule 2 body}

---
```

Rules with `globs` patterns (file-scoped rules) cannot be represented in the single-file format. Document these in the compatibility report as "partially mapped — VS Code does not support per-file rule scoping."

### 5. Hook compilation (UNSTABLE — Preview API)

VS Code hooks are in Preview as of March 2026. The adapter compiles hooks but marks all output as unstable.

**Event mapping:**

| Claude Code event  | VS Code event      | Status  | Notes                                       |
| ------------------ | ------------------ | ------- | ------------------------------------------- |
| `PreToolUse`       | `PreToolUse`       | Preview | Same name, different tool names in matchers |
| `PostToolUse`      | `PostToolUse`      | Preview | Same name                                   |
| `Stop`             | `Stop`             | Preview | Same name                                   |
| `SessionStart`     | `SessionStart`     | Preview | Same name                                   |
| `UserPromptSubmit` | `UserPromptSubmit` | Preview | Same name                                   |
| `SubagentStart`    | `SubagentStart`    | Preview | Same name                                   |
| `SubagentStop`     | `SubagentStop`     | Preview | Same name                                   |
| `SessionEnd`       | (unsupported)      | —       | No equivalent in VS Code 8-event set        |
| `Notification`     | (unsupported)      | —       | No equivalent                               |

**Tool name translation in matchers:**

Claude Code and VS Code use different tool names. When compiling hook matchers, translate:

| Claude Code tool name | VS Code tool name        |
| --------------------- | ------------------------ |
| `Write`               | `create_file`            |
| `Edit`                | `replace_string_in_file` |
| `Bash`                | `run_in_terminal`        |
| `Read`                | `get_file_contents`      |

**Property name translation:**

Claude Code uses `snake_case` in tool input properties; VS Code uses `camelCase`. The adapter must note this in the compatibility report but cannot translate property references inside hook scripts (the scripts themselves must handle both formats).

**Output format:** `.github/hooks/{event-name}.json` files:

```json
{
  "event": "PreToolUse",
  "command": ".github/hooks/pre-tool-use.sh",
  "blocking": true,
  "matchers": [{ "toolName": "replace_string_in_file" }]
}
```

**Stability warning:** Add a comment at the top of each emitted hook JSON:

```json
{
  "_warning": "VS Code hooks are in Preview (March 2026). This configuration may break in future VS Code releases.",
  "event": "..."
}
```

### 6. Register and barrel

**File:** `src/adapters/vscode/index.ts`

```typescript
export { vscodeAdapter } from "./vscode-adapter";
```

Add to `src/adapters/index.ts` registry.

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` reports no violations
- Agent profiles have valid YAML frontmatter with required fields (`name`, `description`, `tools`)
- Agent profiles do not exceed 30,000 characters
- Skills have `name` and `description` in frontmatter
- `.github/copilot-instructions.md` is generated with all `alwaysApply` rules concatenated
- Hook JSON files use VS Code tool names (not Claude Code tool names) in matchers
- Hook JSON files include the Preview stability warning
- Compatibility report documents: agents (fully mapped), skills (fully mapped), rules (partially mapped — no per-file scoping), hooks (mapped but unstable — Preview API)

## Notes

- VS Code reading `.claude/agents/` means users get partial Luca support "for free" even without running the VS Code adapter. The adapter adds value by: (a) proper `.github/agents/` format with richer frontmatter, (b) `copilot-instructions.md` for rules, (c) hook compilation.
- The Copilot coding agent (GitHub Actions autonomous mode) also reads `.github/agents/`. This means the VS Code adapter output works in both VS Code and GitHub Copilot agent mode.
- Wait for hooks to reach stable before investing heavily in hook script compatibility. The current adapter should compile the config but flag it as Preview.
