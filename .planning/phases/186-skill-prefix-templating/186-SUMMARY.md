---
phase: 186
status: complete
---

# Phase 186: Skill Prefix Templating -- Summary

## Outcome

All 54 SKILL.md skill template files now use EJS branding variables for configurable content. The `lu/` skill directory was renamed to `__branding.commandPrefix__/` and the skills template directory was un-gitignored to enable tracking of EJS-branded templates.

## Changes

### Task 1: Rename skill template directory (commit 1810012b)

- Removed `packages/luca-framework/templates/harness/claude/skills` from `.gitignore`
- Updated gitignore comment to note both agents and skills have EJS branding
- Renamed `skills/lu/` to `skills/__branding.commandPrefix__/`
- All 54 skill template SKILL.md files are now tracked by git

### Task 2: Template skill content references (commit 1e36c4b6)

Replaced hard-coded branding references across 42 modified SKILL.md files (467 total EJS tags):

| Pattern                        | Replacement                                               | Count |
| ------------------------------ | --------------------------------------------------------- | ----- |
| `/lu` command references       | `<%= branding.commandSlash %>`                            | ~35   |
| `lu-*` agent name references   | `<%= branding.commandPrefix %>-*`                         | ~180  |
| `subagent_type="lu-*"`         | `subagent_type="<%= branding.commandPrefix %>-*"`         | ~35   |
| `agent: "lu-*"`                | `agent: "<%= branding.commandPrefix %>-*"`                | ~8    |
| `agentName: "lu-*"`            | `agentName: "<%= branding.commandPrefix %>-*"`            | ~3    |
| `team_name: "lu-*"`            | `team_name: "<%= branding.commandPrefix %>-*"`            | ~4    |
| `resolveModelForAgent("lu-*")` | `resolveModelForAgent("<%= branding.commandPrefix %>-*")` | ~6    |
| `--scope=lu`                   | `--scope=<%= branding.commandPrefix %>`                   | ~2    |
| `Luca` brand name              | `<%= branding.frameworkName %>`                           | ~146  |
| `.claude/luca/` paths          | `.claude/<%= branding.nameLowercase %>/`                  | ~12   |
| `/lu-join-discord`             | `/<%= branding.commandPrefix %>-join-discord`             | 1     |

**Exclusions preserved (not templated):**

- `luca-framework` project name (seed-memory/workflow-save examples)
- `LUCA_MUNINN_VAULT` environment variable (runtime API contract)
- `luca-bridge` CLI tool name (package binary reference)
- `rule-lu-workflow` skill name (rule reference, not branding)
- Source file paths like `src/complexity/__helpers/model-routing.ts`

### Task 3: Verification

- Type check (`bunx --bun tsc --noEmit`) passes with no new errors
- Pre-existing `dist/plugin/` errors unrelated to this phase
- All 467 EJS tags have matching opening/closing delimiters

## Deviations

- **[Rule 2 -- Missing Critical]** `.claude/luca/` directory path references (12 occurrences across 5 files) were discovered during execution and templated with `<%= branding.nameLowercase %>` to ensure consistent branding throughout the path structure.
- **[Rule 2 -- Missing Critical]** `Lu session complete` MuninnDB log message and commit message were discovered with hard-coded prefix and templated.

## Verification Checklist

- [x] `skills/__branding.commandPrefix__/SKILL.md` exists
- [x] No hard-coded `/lu` command references in any SKILL.md template
- [x] No hard-coded `lu-` agent name references (except excluded patterns)
- [x] No hard-coded "Luca" brand name (except excluded patterns)
- [x] Type check passes (no new errors)
- [x] All EJS tags syntactically valid
