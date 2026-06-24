---
phase: 1
plan: 3
type: feature
autonomous: true
wave: 1
depends_on: [0]
---

# Phase 1 Plan 3: VS Code / Copilot Adapter (E03)

## Objective

Implement the VS Code / GitHub Copilot adapter that compiles Luca definitions to `.github/` format. Key challenges: tool name translation in hook matchers, `.agent.md` format with richer frontmatter, single-file `copilot-instructions.md` for rules, and hooks marked as Preview/unstable.

## Context

@src/adapters/**schemas/adapter.schemas.ts (Adapter interface, EmitResult with warnings)
@src/adapters/claude/claude-adapter.ts (reference implementation pattern)
@src/adapters/**helpers/character-budget.ts (enforceCharacterBudget -- for 30K agent profiles)
@src/agents/**schemas/agent.schemas.ts (BaseAgent, AgentFrontmatter with name/description/cognition/context)
@src/skills/**schemas/skill.schemas.ts (BaseSkill, SkillFrontmatter with name/description)
@src/rules/**schemas/rule.schemas.ts (BaseRule, RuleFrontmatter with description/globs/alwaysApply)
@src/shared/**helpers/utils.ts (formatFrontmatter)
@src/shared/\_\_helpers/format.ts (SectionSchema)
@.planning/todos/pending/runtime-e03-vscode-adapter.md (full spec)
@.planning/phases/01-ide-adapters/PREMORTEM.md (Risk #1: no toClaudeFormat, Risk #3: tool name translation validation)

## Tasks

### 1. Create vscode-adapter.ts with Adapter implementation

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/vscode/vscode-adapter.ts` with a `createVscodeAdapter()` factory function.

**Adapter config:**

```typescript
config: {
  name: "vscode",
  description: "VS Code / GitHub Copilot (.github/ directory artifacts)",
  supportedFeatures: {
    agents: true,     // .github/agents/{name}.agent.md
    skills: true,     // .github/skills/{name}/SKILL.md
    rules: true,      // .github/copilot-instructions.md (single file)
    hooks: true,      // .github/hooks/ (Preview API)
    workflows: false,
    headless: false,
  },
}
```

**compileAgent implementation (CRITICAL -- compile from config, NOT toClaudeFormat):**

Read from `agent.config.frontmatter` and `agent.config.sections` directly.

Frontmatter mapping:

- `name` -> `name` (lowercase, hyphens, max 64 chars)
- `description` -> `description` (passthrough)
- `model_routing` -> `model` (map tier to model string if present, otherwise omit)
- Always include `tools: ["*"]`
- Always include `user-invocable: true`

Body: concatenate `agent.config.sections` in order.

Apply `enforceCharacterBudget` with 30,000 char limit per agent profile.

**compileSkill implementation (CRITICAL -- compile from config, NOT toClaudeFormat):**

VS Code SKILL.md requires `name` and `description` in frontmatter (Claude Code does not require frontmatter).

If source skill lacks frontmatter fields in the output, prepend:

```yaml
---
name: { skill.config.frontmatter.name }
description: { skill.config.frontmatter.description }
user-invocable: true
---
```

Body: concatenate `skill.config.sections` in order.

**compileRule implementation (single-file concatenation):**

VS Code uses a single `.github/copilot-instructions.md` file. The compile step is different from Cursor/Windsurf:

1. This method compiles a SINGLE rule to a section. The `emit()` method (or the build pipeline) is responsible for concatenating all `alwaysApply` rules.
2. For each rule: return `## {rule.name}\n\n{sections concatenated}`
3. Rules with `globs` patterns are NOT included in `copilot-instructions.md` (VS Code does not support per-file scoping). These should produce a warning.

Read from `rule.config.frontmatter` and `rule.config.sections` directly.

**emit implementation (stub):**

Stub returning empty EmitResult.

**detect implementation:**

Check for `.github/agents` directory existence at `projectRoot`.

**Files to create/edit:**

- `src/adapters/vscode/vscode-adapter.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Agent profiles have YAML frontmatter with `name`, `description`, `tools`, `user-invocable`
- Agent profiles truncated at 30K with warning
- Skills have `name` and `description` in frontmatter
- Rule compilation reads from `config.frontmatter` and `config.sections` -- NOT `toClaudeFormat()`

### 2. Create VS Code tool name translation map

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/vscode/vscode-tool-map.ts` with the tool name translation const and validation function.

**Tool name mapping (Claude -> VS Code):**

| Claude Code tool | VS Code tool           |
| ---------------- | ---------------------- |
| Write            | create_file            |
| Edit             | replace_string_in_file |
| Bash             | run_in_terminal        |
| Read             | get_file_contents      |

Export:

- `VSCODE_TOOL_MAP: Record<string, string>` -- exhaustive mapping of known tools
- `translateVscodeToolName(claudeTool: string): { translated: string; warning: string | null }` -- returns translated name and warning if unmapped

**PREMORTEM constraint #3:** Unmapped tools MUST produce a warning, not a silent drop. The `translateVscodeToolName` function returns a warning string when a tool name is not in the map. The original tool name is kept as-is in the output (best-effort), and the warning is collected into `EmitResult.warnings`.

**Files to create/edit:**

- `src/adapters/vscode/vscode-tool-map.ts` (new)

**Verification:**

- All 4 known Claude tools are mapped
- `translateVscodeToolName("Edit")` returns `{ translated: "replace_string_in_file", warning: null }`
- `translateVscodeToolName("UnknownTool")` returns `{ translated: "UnknownTool", warning: "..." }`

### 3. Create VS Code hook event mapping helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/vscode/vscode-hook-map.ts` with the event mapping table.

**Event mapping (Claude -> VS Code):**

| Claude Code event | VS Code event    | Supported  | Status  |
| ----------------- | ---------------- | ---------- | ------- |
| PreToolUse        | PreToolUse       | yes        | Preview |
| PostToolUse       | PostToolUse      | yes        | Preview |
| Stop              | Stop             | yes        | Preview |
| SessionStart      | SessionStart     | yes        | Preview |
| UserPromptSubmit  | UserPromptSubmit | yes        | Preview |
| SubagentStart     | SubagentStart    | yes        | Preview |
| SubagentStop      | SubagentStop     | yes        | Preview |
| SessionEnd        | (unsupported)    | no -- drop | --      |
| Notification      | (unsupported)    | no -- drop | --      |

Export:

- `VSCODE_EVENT_MAP: Record<string, { event: string; stable: boolean } | null>`
- `translateVscodeEvent(claudeEvent: string): { event: string; stable: boolean } | null`

All supported events are marked `stable: false` (Preview API). Each emitted hook JSON file must include the `_warning` field about Preview instability.

**Files to create/edit:**

- `src/adapters/vscode/vscode-hook-map.ts` (new)

**Verification:**

- All 9 Claude events mapped (7 supported with Preview status, 2 null)
- All supported events have `stable: false`
- `translateVscodeEvent("SessionEnd")` returns null

### 4. Create barrel index

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Create `src/adapters/vscode/index.ts` as a barrel re-exporting `createVscodeAdapter`, tool map, and hook map.

**Files to create/edit:**

- `src/adapters/vscode/index.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createVscodeAdapter` is importable from `~/adapters/vscode`

## Verification

- `bunx --bun tsc --noEmit` passes with all VS Code adapter code
- `bun run scripts/check-domain-boundaries.ts` reports no violations
- All compilation methods read from `config.frontmatter` and `config.sections` directly (PREMORTEM constraint #1)
- Tool name translation warns on unmapped tools (PREMORTEM constraint #3)
- Hook output includes Preview stability warning
- Agent profiles have correct VS Code `.agent.md` frontmatter
- Skills have required `name`/`description` frontmatter
- Rule compilation distinguishes `alwaysApply` rules (included) from `globs` rules (warned)

## Success Criteria

- VS Code adapter compiles agents to `.agent.md` format with richer frontmatter
- Skills get `name`/`description` frontmatter prepended
- Rules compile to single-file sections (for `copilot-instructions.md`)
- Tool name translation validates at emit-time with warnings for unknowns
- Hook compilation marks all output as Preview/unstable
- Glob-scoped rules produce compatibility warnings

## Output Specification

- `src/adapters/vscode/vscode-adapter.ts` -- main adapter
- `src/adapters/vscode/vscode-tool-map.ts` -- tool name translation with validation
- `src/adapters/vscode/vscode-hook-map.ts` -- event mapping with Preview status
- `src/adapters/vscode/index.ts` -- barrel
