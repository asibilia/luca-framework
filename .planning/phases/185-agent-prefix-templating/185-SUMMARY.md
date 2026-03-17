# Phase 185 Summary: Agent Prefix Templating

## Objective

Make agent template filenames and content use the configurable branding prefix instead of hardcoded `lu-`, so that `luca init` with custom branding produces correctly prefixed agent files.

## Completed Tasks

### Task 1: Rename 29 lu-prefixed agent template files

- **Commit**: `6648a6c6` — feat(185): rename agent templates to use branding prefix pattern
- Renamed all 29 `lu-*.md` files to `__branding.commandPrefix__-*.md` in `packages/luca-framework/templates/harness/claude/agents/`
- Updated `.gitignore` to un-gitignore the agents template directory (these are now EJS source files, not plain compiled output)
- 10 non-prefixed agent files (code-architect, code-developer, code-simplifier, dx-advocate, performance-auditor, product, qa-plan-generator, security-auditor, ui, ux) left unchanged

### Task 2: Update YAML frontmatter `name:` field in all 29 renamed templates

- **Commit**: `fc14721d` — feat(185): template agent frontmatter name fields with EJS
- Replaced `name: lu-{agent}` with `name: <%= branding.commandPrefix %>-{agent}` in all 29 files

### Task 3: Update content references in all 39 templates

- **Commit**: `72b2fb96` — feat(185): template agent content references with EJS branding
- Replaced agent name references: `lu-router` -> `<%= branding.commandPrefix %>-router` (all 29 agent names)
- Replaced slash command references: `` `/lu` `` -> `` `<%= branding.commandSlash %>` `` (3 files)
- Replaced framework name references: `Luca` -> `<%= branding.frameworkName %>` where used as brand name
- Preserved file path references: `lu-router.agent.ts`, `src/agents/luca/`, `packages/luca-framework/` left as literal strings

### Task 4: Type-check verification

- `bunx --bun tsc --noEmit` confirmed no new errors introduced
- 4 pre-existing errors in `dist/plugin/scripts/` (unrelated to this phase)

## Deviations

- **[Rule 3 - Blocking] .gitignore update**: The template files were gitignored (`packages/luca-framework/templates/harness` in .gitignore) so commits were blocked. Updated .gitignore to un-gitignore the agents directory specifically while keeping hooks/rules/skills/settings.json gitignored. These agent templates are now EJS source files with branding placeholders, not plain copies of compiled output.

## Verification Checklist

- [x] All 29 previously `lu-*` prefixed agent templates are now named `__branding.commandPrefix__-*.md`
- [x] All YAML `name:` fields in the 29 renamed templates use EJS substitution
- [x] All prose/heading references to `lu-{agent}` use EJS substitution
- [x] The 10 non-prefixed agents still have their original filenames
- [x] Type-check passes cleanly (no new errors)
- [x] No template engine code was modified (template.ts and branding.ts remain unchanged)

## Files Modified

- `.gitignore` — Updated harness template gitignore rules
- 29 renamed agent templates in `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-*.md`
- 10 non-prefixed agent templates with updated cross-references to lu-\* agents
