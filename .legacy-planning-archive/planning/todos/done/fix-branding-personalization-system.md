---
title: Fix Branding / Personalization System — Complete End-to-End
area: init
created: 2026-03-18T21:30:00Z
source: conversation
---

## Context

Users configure `commandPrefix` (e.g. "pt") and `frameworkName` (e.g. "Cent") during `vault:init`, but deployed skills all use hardcoded "lu" and "Luca". The branding config in `.planning/config.json` is never applied to the actual user experience. A company adopting this framework has no way to make it "theirs."

## Root Cause

Skills are deployed globally to `~/.claude/skills/` with hardcoded names. Global artifacts are shared across projects and can't be renamed per-project. The branding infrastructure (`branding.ts`, template transforms) exists but was never wired up.

## Task

Implement thin alias skill + runtime branding instructions. Internal names (`lu-router`, `luca-bridge`, `Skill(skill: "lu")`) stay unchanged — users never see them. Fix the user-facing surface: entry command, help text, tour messages, status output.

### Changes Required

1. **NEW: `packages/luca-framework/src/utils/alias-skill.ts`** (~80 lines)
   - `createAliasSkill(prefix, frameworkName, projectDir?)` — creates project-local `.claude/skills/{prefix}/SKILL.md` that delegates to `/lu`
   - `cleanupStaleAlias(newPrefix, projectDir)` — removes old alias if prefix changed
   - Skip creation if prefix === "lu"
   - Alias SKILL.md contains marker comment `<!-- luca-alias: auto-generated -->` for identification

2. **MODIFY: `packages/luca-framework/src/commands/vault-init.ts`** (~10 lines)
   - After `generateFiles()` succeeds, call `createAliasSkill()` if prefix !== "lu"
   - Update "Files created" summary to mention the alias skill

3. **MODIFY: `src/skills/luca/lu.skill.ts`** (~3 lines)
   - Add branding preamble to `main` section: "Read .planning/config.json, use /{commandPrefix} instead of /lu and {frameworkName} instead of Luca in user-facing output"

4. **MODIFY: `src/skills/general/help.skill.ts`** (~3 lines)
   - Add branding preamble: "Read .planning/config.json, replace /lu with /{commandPrefix} and Luca with {frameworkName} in all output"

5. **MODIFY: `packages/luca-framework/src/utils/branding.ts`** (~15 lines)
   - Add `readProjectBranding(projectDir?)` helper that reads `.planning/config.json` and returns merged branding config with defaults

6. **Version bump** in `packages/luca-framework/package.json`

### NOT Changing

- Agent names (`lu-router`, `lu-executor`) — internal, never typed by users
- `luca-bridge` binary — internal CLI tool
- Skill registry keys — global install, shared across projects
- Internal `Skill(skill: "lu", ...)` calls — reference canonical directory names
- Global deploy pipeline — always uses default branding

### Verification

1. `bunx --bun tsc --noEmit` — zero errors
2. `bun run build:all` — clean build
3. `luca vault:init` with custom prefix "pt" -> `.claude/skills/pt/SKILL.md` exists
4. `/pt "hello"` in Claude Code -> delegates to `/lu`
5. `/help` -> shows `/{prefix}` not `/lu`
6. Re-run vault:init with different prefix -> old alias cleaned up
7. Default prefix "lu" -> no alias created

## Notes

Full plan at: `/Users/alecsibilia/.claude/plans/warm-percolating-unicorn.md`

Exploration found ~1,332 total references to "lu"/"luca" across the codebase, but the vast majority are internal (agent names, bridge calls, registry keys). Only ~50 are user-facing and need branding treatment.
