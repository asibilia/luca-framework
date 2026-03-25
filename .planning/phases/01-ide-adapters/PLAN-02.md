---
phase: 1
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: [0]
---

# Phase 1 Plan 2: Windsurf Adapter (E02)

## Objective

Implement the Windsurf (Codeium) adapter that compiles Luca definitions to `.windsurf/` format with character budget enforcement. Key challenges: 12K per workspace rule file, 6K global rules, trigger-based frontmatter mapping, and skills-to-Workflows translation.

## Context

@src/adapters/**schemas/adapter.schemas.ts (Adapter interface, EmitResult with warnings)
@src/adapters/claude/claude-adapter.ts (reference implementation pattern)
@src/adapters/**helpers/character-budget.ts (enforceCharacterBudget -- created in Plan 0)
@src/rules/**schemas/rule.schemas.ts (BaseRule, RuleFrontmatter)
@src/skills/**schemas/skill.schemas.ts (BaseSkill, SkillFrontmatter)
@src/agents/**schemas/agent.schemas.ts (BaseAgent -- Windsurf has no agent format)
@src/shared/**helpers/utils.ts (formatFrontmatter)
@src/shared/\_\_helpers/format.ts (SectionSchema, toClaudeFormat)
@.planning/todos/pending/runtime-e02-windsurf-adapter.md (full spec)
@.planning/phases/01-ide-adapters/PREMORTEM.md (Risk #1: no toClaudeFormat, Risk #2: section-boundary truncation)

## Tasks

### 1. Create windsurf-adapter.ts with Adapter implementation

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/windsurf/windsurf-adapter.ts` with a `createWindsurfAdapter()` factory function.

**Adapter config:**

```typescript
config: {
  name: "windsurf",
  description: "Windsurf / Codeium (.windsurf/ directory artifacts)",
  supportedFeatures: {
    agents: false,    // No Windsurf agent format
    skills: true,     // Mapped to Workflows
    rules: true,      // With character budget enforcement
    hooks: true,      // Partial (no subagent events)
    workflows: false,
    headless: false,
  },
}
```

Include a `formatVersion: "2026.03"` constant for future-proofing per 01-CONTEXT.md Risk Notes.

**compileRule implementation (CRITICAL -- compile from config, NOT toClaudeFormat):**

Read from `rule.config.frontmatter` and `rule.config.sections` directly.

Trigger mapping:

- `alwaysApply: true` -> `trigger: always_on`
- `globs` present (no `alwaysApply`) -> `trigger: glob`
- Neither -> `trigger: model_decision`

Frontmatter format:

```yaml
---
trigger: { mapped trigger }
description: { description }
globs: { glob patterns, only if trigger is "glob" }
---
```

Body: concatenate `rule.config.sections` in order.

**Character budget enforcement:**

- Import `enforceCharacterBudget` from `~/adapters/__helpers/character-budget`
- Apply 12,000 char limit to each compiled workspace rule
- Collect warnings from truncation into `EmitResult.warnings`

**compileSkill implementation (Workflows translation):**

Windsurf uses "Workflows" instead of Skills.

Output format:

```markdown
# {skill.config.frontmatter.name}

{skill.config.frontmatter.description}

## Steps

{sections concatenated}
```

Apply `enforceCharacterBudget` with 12,000 char limit per workflow.

**compileAgent implementation:**

Return empty string. Windsurf has no agent profile format.

**emit implementation (stub):**

Stub returning empty EmitResult, same as Claude adapter pattern.

**detect implementation:**

Check for `.windsurf` directory existence at `projectRoot`.

**Files to create/edit:**

- `src/adapters/windsurf/windsurf-adapter.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `compileRule` reads from `config.frontmatter` and `config.sections` -- NOT `toClaudeFormat()`
- Trigger mapping is correct for all 3 cases (always_on, glob, model_decision)
- Rules exceeding 12K are truncated at section boundaries with warning
- Compiled workflows follow the Windsurf `# Title\n\nDescription\n\n## Steps` format

### 2. Create windsurf hook event mapping helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/windsurf/windsurf-hook-map.ts` with the event mapping table.

**Event mapping (Claude -> Windsurf):**

| Claude Code event | Windsurf event | Supported                  |
| ----------------- | -------------- | -------------------------- |
| PreToolUse        | pre_tool_use   | yes                        |
| PostToolUse       | post_tool_use  | yes                        |
| Stop              | agent_response | yes (closest equivalent)   |
| SessionStart      | session_start  | yes                        |
| SessionEnd        | session_end    | yes                        |
| UserPromptSubmit  | user_prompt    | yes                        |
| SubagentStart     | (unsupported)  | no -- drop, note in report |
| SubagentStop      | (unsupported)  | no -- drop, note in report |
| Notification      | (unsupported)  | no -- drop, note in report |

Export:

- `WINDSURF_EVENT_MAP: Record<string, string | null>`
- `translateWindsurfEvent(claudeEvent: string): string | null`

**Files to create/edit:**

- `src/adapters/windsurf/windsurf-hook-map.ts` (new)

**Verification:**

- All 9 Claude events mapped (6 supported, 3 null)
- `translateWindsurfEvent("Stop")` returns `"agent_response"`
- Subagent events return null

### 3. Create barrel index

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create `src/adapters/windsurf/index.ts` as a barrel re-exporting `createWindsurfAdapter` and the hook map.

**Files to create/edit:**

- `src/adapters/windsurf/index.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createWindsurfAdapter` is importable from `~/adapters/windsurf`

## Verification

- `bunx --bun tsc --noEmit` passes with all Windsurf adapter code
- `bun run scripts/check-domain-boundaries.ts` reports no violations
- Rule compilation reads from `config.frontmatter` and `config.sections` directly (PREMORTEM constraint #1)
- Character budget enforcement uses section-boundary truncation (PREMORTEM constraint #2)
- Trigger mapping covers all 3 cases: `always_on`, `glob`, `model_decision`
- Hook event mapping covers all 9 Claude events
- `formatVersion` field is present for future-proofing

## Success Criteria

- Windsurf adapter compiles rules with correct `trigger` frontmatter
- Character budget enforcement truncates at section boundaries, not raw offsets
- Truncation produces warning strings for `EmitResult.warnings`
- Skills are mapped to Windsurf Workflow format
- Agent compilation returns empty string (no format exists)
- Hook map handles 6 supported events + 3 unsupported

## Output Specification

- `src/adapters/windsurf/windsurf-adapter.ts` -- main adapter with character budget
- `src/adapters/windsurf/windsurf-hook-map.ts` -- event name mapping
- `src/adapters/windsurf/index.ts` -- barrel
