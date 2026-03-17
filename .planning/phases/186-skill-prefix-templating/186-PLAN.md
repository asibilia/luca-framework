---
phase: 186
plan: 1
type: execution
autonomous: true
complexity: SIMPLE
---

# Phase 186: Skill Prefix Templating

## Objective

Make skill directory names, SKILL.md content, and cross-skill references use the configurable branding prefix via EJS template variables. This extends the branding pattern established in Phase 185 (agent templates) to the skill template layer.

## Context

- Phase 185 established the pattern for agent templates: `__branding.commandPrefix__` for filenames, `<%= branding.commandSlash %>` for `/lu` command refs, `<%= branding.commandPrefix %>` for agent name prefixes, and `<%= branding.frameworkName %>` for "Luca" brand references.
- The skill templates in `packages/luca-framework/templates/harness/claude/skills/` were previously gitignored as compiled output.
- 54 SKILL.md files contain hard-coded `/lu`, `lu-*` agent names, and "Luca" brand references.

## Requirements

- REQ-09: Skill directory and SKILL.md filenames must use configurable branding prefix
- REQ-10: All SKILL.md content must template-process /lu command references to use dynamic prefix
- REQ-11: Cross-skill Skill(skill: "lu") references in SKILL.md files must use dynamic prefix

## Tasks

### Task 1: Rename lu/ skill template directory

- Un-gitignore `packages/luca-framework/templates/harness/claude/skills/` so files become tracked
- Rename `skills/lu/` to `skills/__branding.commandPrefix__/`
- Stage and track all 54 skill template files

### Task 2: Template /lu command references in all SKILL.md files

- `/lu` command references -> `<%= branding.commandSlash %>`
- `lu-` agent name references -> `<%= branding.commandPrefix %>-`
- Agent invocation patterns (subagent_type, agent, agentName, team_name) -> EJS templated
- `resolveModelForAgent("lu-*")` -> EJS templated
- JSON agent references (source_agent, agent_name) -> EJS templated
- `--scope=lu` -> `--scope=<%= branding.commandPrefix %>`
- "Luca" brand name -> `<%= branding.frameworkName %>`
- `.claude/luca/` paths -> `.claude/<%= branding.nameLowercase %>/`
- `/lu-join-discord` -> `/<%= branding.commandPrefix %>-join-discord`

**Exclusions:**

- `luca-framework` project name references (documentation examples)
- `LUCA_MUNINN_VAULT` env var (runtime API contract)
- `luca-bridge` CLI tool name (package binary)
- `rule-lu-workflow` skill name (references rule file, not branding)
- Source file paths (e.g., `src/complexity/__helpers/model-routing.ts`)

### Task 3: Verify and create plan/summary

- Run `bunx --bun tsc --noEmit` to confirm no regressions
- Create 186-PLAN.md and 186-SUMMARY.md

## Verification

- [ ] `skills/__branding.commandPrefix__/SKILL.md` exists (was `skills/lu/`)
- [ ] No hard-coded `/lu` command references in any SKILL.md template
- [ ] No hard-coded `lu-` agent name references (except excluded patterns)
- [ ] No hard-coded "Luca" brand name (except excluded patterns)
- [ ] Type check passes (no new errors)
- [ ] EJS tags are syntactically valid (all `<%=` have matching `%>`)

## Success Criteria

- All 54 SKILL.md files use EJS branding variables for configurable content
- The `lu/` skill directory uses `__branding.commandPrefix__` pattern
- Template processing will correctly resolve all variables during `luca init`
