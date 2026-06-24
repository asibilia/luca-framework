# Phase 2 Context: Vault-Init Wiring + Skill Preambles

## Decisions

### 1. vault-init.ts Wiring Point [decided]

After `generateFiles()` succeeds (line 208 of vault-init.ts), call:

- `cleanupStaleAlias(config.branding.commandPrefix, projectDir)` first (remove old aliases)
- `createAliasSkill(config.branding.commandPrefix, config.branding.frameworkName, projectDir)` second (create new)
- Import both from `../utils/alias-skill`
- Only call if result.success is true (inside the success path)
- Log alias creation in the "Files created" summary output

### 2. Branding Preamble for lu.skill.ts [decided]

Add a branding instruction at the start of the `main` section content:

- Prepend text instructing the agent to read `.planning/config.json` branding section
- Use `{commandPrefix}` instead of `/lu` and `{frameworkName}` instead of "Luca" in all user-facing output
- Keep it brief (~3 lines) — this is a runtime instruction, not a template

### 3. Branding Preamble for help.skill.ts [decided]

Same pattern as lu.skill.ts:

- Add branding instruction at the start of the `main` section
- "Read .planning/config.json branding section. Use /{commandPrefix} instead of /lu and {frameworkName} instead of Luca in all user-facing output."

## Constraints

- vault-init.ts changes are ~10 lines (import + 2 function calls + summary update)
- Skill preambles are ~3 lines each (prepended to existing main section content)
- No new dependencies
- Functions imported from Phase 1's alias-skill.ts
