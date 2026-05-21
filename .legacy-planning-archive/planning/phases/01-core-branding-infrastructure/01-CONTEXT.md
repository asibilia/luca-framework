# Phase 1 Context: Core Branding Infrastructure

## Decisions

### 1. Alias SKILL.md Content Format [researched — codebase patterns]

The generated alias SKILL.md at `.claude/skills/{prefix}/SKILL.md` should:

- Contain a marker comment `<!-- luca-alias: auto-generated -->` as the first line for identification by `cleanupStaleAlias()`
- Be a minimal skill definition that delegates to `/lu` by instructing the agent to invoke `Skill(skill: "lu", args: "...")` with the user's arguments
- Include the configured `frameworkName` so the skill's display name matches branding
- Must NOT duplicate the full lu.skill.ts content — thin wrapper only

### 2. Config Reading Pattern [researched — codebase patterns]

`readProjectBranding(projectDir?)` should:

- Read `.planning/config.json` from the project directory (default: `process.cwd()`)
- Use `Bun.file()` for file I/O (per bun-preference rule)
- Extract `branding` section from config JSON
- Pass through existing `mergeBranding()` to fill defaults from `defaultBranding`
- Return `BrandingConfig` (complete, never partial)
- Gracefully degrade: if config missing or malformed, return `defaultBranding` (no throw)
- Use `safeParse` pattern if adding Zod validation for the branding section

### 3. alias-skill.ts File Structure [decided]

- Export two functions: `createAliasSkill()` and `cleanupStaleAlias()`
- Both accept optional `projectDir` parameter (default: `process.cwd()`)
- `createAliasSkill(prefix, frameworkName, projectDir?)`:
  - Skip if `prefix === 'lu'` (no alias needed for default)
  - Create directory `.claude/skills/{prefix}/` if missing
  - Write SKILL.md with marker and delegation content
- `cleanupStaleAlias(newPrefix, projectDir?)`:
  - Scan `.claude/skills/*/SKILL.md` for marker comment
  - Remove any alias that doesn't match `newPrefix`
  - Remove empty parent directories after cleanup
- Use `Bun.file()` and `Bun.write()` for all file operations

## Constraints

- No new dependencies — use Bun built-in APIs only
- Must follow functional patterns (no classes)
- Kebab-case file naming (alias-skill.ts)
- JSDoc documentation mandatory for all exports
- BrandingConfig type imported from `../types`

## Deferred

- vault-init.ts wiring (Phase 2)
- Skill preamble additions (Phase 2)
- Version bump (Phase 3)
