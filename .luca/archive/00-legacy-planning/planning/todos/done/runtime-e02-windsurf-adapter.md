---
title: "Runtime E02: Windsurf adapter — compile Luca definitions to .windsurf/ format with character budget enforcement"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/research/ide-ecosystems.md
depends_on: [B01, B02]
phase: runtime-e
estimated_files: 4
---

## Context

Windsurf (Codeium/Cognition) is Tier 3 due to acquisition uncertainty, but has more extensibility than initially characterized: 12 hook events available to all users, frontmatter-based rule activation, and 12K per workspace rule file. The key constraint is character limits: 6K for global rules, 12K per individual workspace rule file.

Research source: `docs/runtime-architecture/research/ide-ecosystems.md` (Pre-Grooming Notes corrections: character limits are 6K global, 12K per workspace rule file; hooks are NOT enterprise-only; workspace rules DO use YAML frontmatter with `trigger` field).

## Task

### 1. Create adapter file

**File:** `src/adapters/windsurf/windsurf-adapter.ts`

Implement a `windsurfAdapter` object satisfying the `Adapter` interface:

```typescript
export const windsurfAdapter: Adapter = {
  id: "windsurf",
  name: "Windsurf (Codeium)",
  version: "1.0.0",
  outputDir: ".windsurf",

  compileAgent(agent: AgentConfig): string { ... },
  compileSkill(skill: SkillConfig): string { ... },
  compileRule(rule: RuleConfig): string { ... },
  compileHooks(hooks: HookConfig[]): Record<string, unknown> { ... },
  validate(output: AdapterOutput): CompatibilityReport { ... },
  emit(output: AdapterOutput, targetDir: string): void { ... },
}
```

### 2. Rule compilation with character budget enforcement

**Character limits (verified from Windsurf docs):**

- Global rules file: 6,000 characters max
- Individual workspace rule files: 12,000 characters max each

**Workspace rule frontmatter format:**

```
---
trigger: always_on | model_decision | glob | manual
description: {description}
globs: {glob patterns if trigger is "glob"}
---

{rule body}
```

**Trigger mapping from Luca rule types:**

| Luca rule property                 | Windsurf `trigger` value |
| ---------------------------------- | ------------------------ |
| `alwaysApply: true`                | `always_on`              |
| `globs` present (no `alwaysApply`) | `glob`                   |
| Neither `alwaysApply` nor `globs`  | `model_decision`         |

**Character budget enforcement algorithm:**

```typescript
function enforceCharacterBudget(
  compiledRule: string,
  maxChars: number,
  ruleName: string,
): string {
  if (compiledRule.length <= maxChars) return compiledRule;

  // Truncate body, preserve frontmatter
  const frontmatterEnd = compiledRule.indexOf("---", 4) + 3;
  const frontmatter = compiledRule.slice(0, frontmatterEnd);
  const truncationMarker = `\n\n[Truncated — full rule at src/rules/**/${ruleName}*.ts. ${compiledRule.length - maxChars} chars removed.]\n`;
  const availableBodyChars =
    maxChars - frontmatter.length - truncationMarker.length;
  const body = compiledRule.slice(
    frontmatterEnd,
    frontmatterEnd + availableBodyChars,
  );
  return frontmatter + body + truncationMarker;
}
```

**Rule prioritization when total exceeds budget:**

Rules are ranked by priority for inclusion. If the combined character count of all always_on rules exceeds 6K for the global file, lower-priority rules are truncated first. Priority order:

1. Rules with `alwaysApply: true` (highest)
2. Rules with `globs` patterns
3. Rules with `model_decision` trigger (lowest)

Each workspace rule file is independently capped at 12K.

### 3. Skill compilation: map to Windsurf Workflows

Windsurf uses "Workflows" instead of Skills. Key differences:

- **Format:** Markdown with title, description, numbered steps
- **Character limit:** 12,000 chars per workflow
- **Invocation:** Manual only via slash commands (Cascade NEVER auto-invokes)
- **Directory:** `.windsurf/workflows/{workflow-name}.md`

**Workflow output format:**

```markdown
# {skill.name}

{skill.description}

## Steps

{skill.body}
```

Apply the same `enforceCharacterBudget` function with a 12K limit. If a skill exceeds 12K after conversion, truncate the body with the same marker pattern.

### 4. Hook compilation

Windsurf supports 12 hook events. Available to all users (not enterprise-only as previously stated).

**Event mapping:**

| Claude Code event  | Windsurf event   | Notes                |
| ------------------ | ---------------- | -------------------- |
| `PreToolUse`       | `pre_tool_use`   | Available            |
| `PostToolUse`      | `post_tool_use`  | Available            |
| `Stop`             | `agent_response` | Closest equivalent   |
| `SessionStart`     | `session_start`  | Available            |
| `SessionEnd`       | `session_end`    | Available            |
| `UserPromptSubmit` | `user_prompt`    | Available            |
| `SubagentStart`    | (unsupported)    | Drop, note in report |
| `SubagentStop`     | (unsupported)    | Drop, note in report |
| `Notification`     | (unsupported)    | Drop, note in report |

Windsurf hooks are configured differently from Claude Code. Hook configuration is stored in Windsurf settings, not a project-level JSON file. The adapter should emit a `.windsurf/hooks/README.md` documenting how to manually configure hooks in Windsurf settings, with the shell scripts placed in `.windsurf/hooks/`.

### 5. Agent compilation

Windsurf does not have an agent profile format. The `compileAgent` method returns an empty string. Document this gap in the compatibility report.

### 6. Validate method

The `validate` method must check:

- No workspace rule file exceeds 12,000 characters
- Global rules total does not exceed 6,000 characters
- All workflow files are under 12,000 characters
- Required frontmatter fields are present in workspace rules

Return a `CompatibilityReport` with:

- `fully_mapped`: rules, workflows (with truncation notes if any)
- `partially_mapped`: hooks (subagent events unsupported)
- `unsupported`: agents, auto-trigger workflows

### 7. Register and barrel

**File:** `src/adapters/windsurf/index.ts`

```typescript
export { windsurfAdapter } from "./windsurf-adapter";
```

Add to `src/adapters/index.ts` registry.

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` reports no violations
- No compiled workspace rule file exceeds 12,000 characters
- No compiled global rules output exceeds 6,000 characters
- Truncated rules include the `[Truncated — full rule at ...]` marker
- Workspace rules have valid `trigger` frontmatter (one of: `always_on`, `model_decision`, `glob`, `manual`)
- Workflow files are under 12,000 characters
- Compatibility report accurately reflects: rules (fully mapped with possible truncation), workflows (mapped from skills, manual-only), hooks (partially mapped), agents (unsupported)

## Notes

- Cognition acquisition creates strategic uncertainty. Design for format versioning: the adapter should have a `formatVersion` field defaulting to `"2026.03"` that can be bumped if Cognition changes the format.
- Windsurf's character limits are the primary constraint. For complex rule sets, significant content may be truncated. The truncation marker pointing to the source file is critical for developer experience.
