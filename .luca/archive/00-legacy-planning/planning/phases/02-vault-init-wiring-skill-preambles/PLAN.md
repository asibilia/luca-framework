---
phase: 2
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: ["phase-1"]
---

# Phase 2 Plan 1: Vault-Init Wiring + Skill Preambles

## Objective

Wire Phase 1's `createAliasSkill()` / `cleanupStaleAlias()` into the vault-init success path so alias skills are created during project initialization, and prepend branding-aware preambles to `lu.skill.ts` and `help.skill.ts` so user-facing skills respect the configured command prefix and framework name at runtime.

> Appetite: Small (remaining budget within 50000 token ceiling, target ~40% context)

## Context

- @packages/luca-framework/src/commands/vault-init.ts -- wire alias calls after generateFiles() success (line 208-223)
- @packages/luca-framework/src/utils/alias-skill.ts -- createAliasSkill(), cleanupStaleAlias() (created in Phase 1)
- @src/skills/luca/lu.skill.ts -- main section content starts at line 21
- @src/skills/general/help.skill.ts -- main section content starts at line 16
- @.planning/phases/01-core-branding-infrastructure/01-CONTEXT.md -- Phase 1 decisions (deferred items: vault-init wiring, skill preambles)

## Tasks

### 1. Wire alias creation into vault-init.ts

**Type:** auto
**TDD:** false
**Depends on:** none

After `generateFiles()` succeeds and before the vault-setup step (between lines 223 and 225), insert two calls:

1. `await cleanupStaleAlias(config.branding.commandPrefix);`
2. `await createAliasSkill(config.branding.commandPrefix, config.branding.frameworkName);`

Add the import at the top of vault-init.ts:

```typescript
import { createAliasSkill, cleanupStaleAlias } from "../utils/alias-skill";
```

Wrap the calls in a try/catch that logs a warning on failure but does not abort init. Add an alias summary line to the success output box (near line 312) when the prefix is not `'lu'`.

**Files to create/edit:**

- `packages/luca-framework/src/commands/vault-init.ts` (edit -- ~8 lines added)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- Alias calls only fire in the success path (after `result.success` check)
- Failure in alias creation does not abort vault-init
- Summary box mentions the alias when prefix differs from `'lu'`

### 2. Add branding preamble to lu.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Prepend a branding instruction block to the beginning of the `main` section content string (line 21). The preamble reads:

```
**Branding:** Read \`.planning/config.json\` branding section at session start. Use \`/{commandPrefix}\` instead of \`/lu\` and \`{frameworkName}\` instead of \`Luca\` in ALL user-facing output (logs, summaries, help text, error messages). If config is missing or branding is absent, fall back to defaults (\`/lu\`, \`Luca\`).
```

Insert this as the first paragraph of the main section content, followed by a blank line before the existing text.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (edit -- ~3 lines added)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- Preamble appears before the existing "The single entry point..." paragraph
- No changes to the skill's frontmatter or other sections

### 3. Add branding preamble to help.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Prepend the same branding instruction block to the beginning of the `main` section content string (line 16, inside the `<main>` tag). The preamble reads:

```
**Branding:** Read \`.planning/config.json\` branding section at session start. Use \`/{commandPrefix}\` instead of \`/lu\` and \`{frameworkName}\` instead of \`Luca\` in ALL user-facing output. If config is missing or branding is absent, fall back to defaults (\`/lu\`, \`Luca\`).
```

Insert this immediately after the opening `<main>` tag and before `# Luca Help`.

**Files to create/edit:**

- `src/skills/general/help.skill.ts` (edit -- ~3 lines added)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- Preamble appears inside `<main>` before `# Luca Help`
- No changes to the skill's frontmatter or other sections

## Verification

1. Run `bunx --bun tsc --noEmit` from repo root -- zero type errors
2. Confirm vault-init.ts imports `createAliasSkill` and `cleanupStaleAlias` from `../utils/alias-skill`
3. Confirm alias calls are in the success path only, wrapped in try/catch
4. Confirm lu.skill.ts main section starts with the branding preamble
5. Confirm help.skill.ts main section starts with the branding preamble
6. Confirm no new dependencies added

## Success Criteria

- vault-init creates alias skills automatically after file generation succeeds
- Both user-facing skills instruct the LLM to respect branding config at runtime
- All three edits are additive (no existing behavior changed)
- Type-check passes cleanly
- Ready for Phase 3 to integrate end-to-end branding flow

## Output Specification

- **Modified:** `packages/luca-framework/src/commands/vault-init.ts` -- wires alias creation into init flow
- **Modified:** `src/skills/luca/lu.skill.ts` -- adds branding preamble to main section
- **Modified:** `src/skills/general/help.skill.ts` -- adds branding preamble to main section
