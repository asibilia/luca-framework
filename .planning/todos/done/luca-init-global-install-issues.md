---
title: Fix luca init global install issues (4 bugs)
area: cli
created: 2026-03-17
source: conversation
---

## Context

After publishing `@alecsibilia/luca-framework` to npm and running `luca init` on another machine, four issues were identified with the global install experience.

## Task

Fix the following four issues with the `luca init` flow when installed globally via npm.

### Issue 1: Platform selection still shows Cursor and Pi (P2 — Low/Low)

**Location:** `packages/luca-framework/src/utils/wizard.ts:158-167`, `packages/luca-framework/src/utils/presets.ts`

The wizard multiselect shows all three platforms (Claude, Cursor, Pi). The decision was made to only support Claude, but the options remain. `initialValues` from presets only controls pre-selection, not which options are visible. Preset defaults in `presets.ts` still include `cursor` in `standard` and `full`.

**Fix:** Remove Cursor/Pi from multiselect (or hide question entirely, hardcode `["claude"]`). Update preset defaults. Remove Cursor/Pi directory creation in `files.ts:159-175`.

### Issue 2: vault:init deploys to project `.claude/` instead of `~/.claude/` (P0 — High/Medium)

**Location:** `packages/luca-framework/src/commands/vault-init.ts`, `packages/luca-framework/src/utils/files.ts`

When `luca init` runs Step 4 (vault:init), `generateFiles()` unpacks the full harness (39 agents, 49 skills, 23 rules, 9 hooks, settings.json) into the **project's** `.claude/`. Wrong for global installs — Step 3 already deploys to `~/.claude/`. vault:init should only create `.planning/` config files (config.json, BRAIN.md, WORKING.md, MEMORY.md).

**Fix:** Detect global install vs dev mode. In global install mode: skip harness file generation, only create `.planning/` files. In dev mode: keep current behavior.

### Issue 3: MuninnDB not installed/started before API key prompt (P0 — High/Low-Medium)

**Location:** `packages/luca-framework/src/commands/init.ts:557-619`, `packages/luca-framework/src/utils/muninndb-download.ts`, `packages/luca-framework/src/utils/vault-setup.ts`

**Sub-issue 3a — Download URL 404:** URL constructs `.../releases/download/latest/muninndb-darwin-arm64` but GitHub requires `latest` before `download`: `.../releases/latest/download/muninndb-...`, or resolve actual tag first via GitHub API.

**Sub-issue 3b — API key prompt without running MuninnDB:** Vault wizard shows "open MuninnDB Web UI" and prompts for API key even if download failed or service isn't started. User can't create a key if MuninnDB isn't running.

**Fix:** Fix download URL pattern. Verify binary after download. Wait for health endpoint after starting service. Check MuninnDB reachability before API key prompt; skip and advise `luca vault:init` later if unreachable.

### Issue 4: Custom prefix not applied to agent/skill names (P1 — Medium/High)

**Location:** `packages/luca-framework/src/utils/wizard.ts:69-78`, `packages/luca-framework/templates/harness/claude/`

Wizard captures custom prefix (e.g., `pt`) into `config.branding.commandPrefix`. Template engine supports EJS substitution. `.planning/BRAIN.md` and `config.json` correctly use the prefix. But:

- Agent filenames hardcoded: `lu-router.md`, `lu-executor.md`, etc.
- Skill directory names hardcoded: `skills/lu/SKILL.md` always `lu`
- Skill content references `/lu` literally throughout SKILL.md files
- Cross-skill references use hardcoded `Skill(skill: "lu")` calls
- Tour output hardcodes `/lu` as the first command

**Fix (significant):** Rename agent templates to `__branding.commandPrefix__` pattern. Rename skill directories similarly. Template-process all SKILL.md content to replace `/lu` with `<%= branding.commandSlash %>`. Update cross-skill references. Update tour output. Touches 39 agent files, 49 skill directories, and numerous cross-references.

## Notes

Priority ranking:

| # | Issue | Severity | Effort | Priority |
|---|-------|----------|--------|----------|
| 2 | Project `.claude/` vs `~/.claude/` | High | Medium | P0 |
| 3 | MuninnDB download 404 + ordering | High | Low-Medium | P0 |
| 4 | Custom prefix not applied | Medium | High | P1 |
| 1 | Cursor/Pi still shown | Low | Low | P2 |

Full assessment available at `.claude/plans/snug-wibbling-beaver.md`.
