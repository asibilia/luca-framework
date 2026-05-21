---
phase: 177
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: [172, 175]
---

# Phase 177 Plan 1: Doctor Expansion, Update & Reinit

## Objective

Expand `luca doctor` from a project-scoped health checker to a comprehensive diagnostic tool that validates prerequisites, global artifacts, framework runtime, and project configuration. Implement the `luca update` global deploy flow and the `luca reinit` force-rebuild command.

The current doctor only checks 5 things (Bun runtime, Cursor IDE, config validation, harness installation, drift detection) -- all project-scoped. The global context (MuninnDB, ~/.claude/ artifacts, settings.json hooks, deploy manifest, state machine, bridge CLI) is unchecked.

## Context

@packages/luca-framework/src/commands/doctor.ts -- doctor command entry point
@packages/luca-framework/src/utils/doctor/run-doctor.ts -- orchestrator
@packages/luca-framework/src/utils/doctor/types.ts -- CheckResult / DoctorCheck interfaces
@packages/luca-framework/src/utils/doctor/checks/ -- existing 5 checks
@packages/luca-framework/src/commands/init.ts -- init orchestrator (deploy step pattern)
@packages/luca-framework/src/commands/update.ts -- per-project update (already functional)
@packages/luca-framework/src/commands/reinit.ts -- stub only
@packages/luca-framework/src/utils/muninndb-health.ts -- MuninnDB binary + service checks
@packages/luca-framework/src/utils/prerequisites.ts -- Bun prerequisite detection
@packages/luca-framework/src/utils/luca-home.ts -- ~/.luca/ path resolution
@packages/luca-framework/src/utils/deploy-manifest-writer.ts -- deploy manifest read/write
@packages/luca-framework/src/utils/deploy-manifest.schemas.ts -- DeployManifest schema
@scripts/deploy-global.ts -- full deploy logic for reference

## Tasks

### 1. Add MuninnDB health check to doctor

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/doctor/checks/muninndb-health.ts` that:

- Imports `checkMuninndbBinary` and `checkMuninndbService` from `../../muninndb-health`
- Check 1: Binary installed at ~/.luca/bin/muninndb and executable
- Check 2: Service running and healthy (HTTP health endpoint)
- Returns pass/fail/warning with fix commands (`luca init` for binary, `muninndb` for service)
- If binary not found: fail with "Install with: luca init"
- If binary found but service not running: warning with "Start with: muninndb"
- If service running but unhealthy: warning with "Restart MuninnDB"

**Files to create/edit:**

- `packages/luca-framework/src/utils/doctor/checks/muninndb-health.ts` (new)
- `packages/luca-framework/src/utils/doctor/run-doctor.ts` (register check)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca doctor` output shows MuninnDB check

### 2. Add global artifacts check to doctor

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/doctor/checks/global-artifacts.ts` that:

- Checks `~/.claude/` exists
- Counts agents in `~/.claude/agents/*.md`
- Counts skills in `~/.claude/skills/` (directories)
- Counts hooks in `~/.claude/hooks/*.sh`
- Checks `~/.claude/settings.json` exists and is parseable
- Verifies settings.json has `hooks` section with Luca hooks (check for known script names)
- Reads deploy manifest from `~/.luca/manifests/deploy-manifest.json` using `readDeployManifest`
- Reports version from manifest `package_version` and deploy timestamp

Returns pass if all artifacts present, warning if partial, fail if `~/.claude/` missing.

**Files to create/edit:**

- `packages/luca-framework/src/utils/doctor/checks/global-artifacts.ts` (new)
- `packages/luca-framework/src/utils/doctor/run-doctor.ts` (register check)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca doctor --verbose` shows artifact counts

### 3. Add framework runtime check to doctor

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/doctor/checks/framework-runtime.ts` that:

- Checks `luca-bridge` is available on PATH (via `Bun.which("luca-bridge")`)
- If found, runs `luca-bridge read-status` and checks if state machine is initialized
- Checks `~/.luca/` directory structure exists (root, bin, manifests, backups)
- Reports bridge version and state machine status

Returns pass if bridge available and state initialized, warning if bridge missing but ~/.luca/ exists, fail if ~/.luca/ missing.

**Files to create/edit:**

- `packages/luca-framework/src/utils/doctor/checks/framework-runtime.ts` (new)
- `packages/luca-framework/src/utils/doctor/run-doctor.ts` (register check)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca doctor` shows framework runtime check

### 4. Add project context check to doctor

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/doctor/checks/project-context.ts` that:

- Checks `.planning/config.json` exists (this overlaps with config-validation but focuses on project-level context)
- Reads `muninn.vault` from config and reports vault name
- Checks `.env` exists and reports presence (not contents)
- Checks `.planning/STATE.md` exists
- Checks `.planning/ROADMAP.md` exists

Returns pass if config + vault configured, warning if partial, fail if no .planning/ at all.

Note: Distinct from existing `config-validation` check which validates branding/stack/workTracker fields. This check focuses on the broader project context (.env, STATE, ROADMAP, vault).

**Files to create/edit:**

- `packages/luca-framework/src/utils/doctor/checks/project-context.ts` (new)
- `packages/luca-framework/src/utils/doctor/run-doctor.ts` (register check)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca doctor --verbose` shows vault name and project context

### 5. Add `--scope` flag to doctor command

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Update the doctor command to support `--scope` filtering:

- `luca doctor` -- run all checks (default)
- `luca doctor --scope=prerequisites` -- Bun runtime only
- `luca doctor --scope=global` -- global artifacts + MuninnDB + framework runtime
- `luca doctor --scope=project` -- config validation + harness installation + drift + project context

Update `run-doctor.ts` to accept a scope parameter and filter checks accordingly. Tag each check with a scope.

**Files to create/edit:**

- `packages/luca-framework/src/commands/doctor.ts` (add --scope arg)
- `packages/luca-framework/src/utils/doctor/types.ts` (add scope to DoctorCheck)
- `packages/luca-framework/src/utils/doctor/run-doctor.ts` (filter by scope)
- All check files (add scope tag)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca doctor --scope=global` only runs global checks

### 6. Implement `luca reinit` command

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the stub in `reinit.ts` with a functional implementation:

- Detect runtime context (dev vs global)
- Confirm with user (unless `--force`)
- Run the deploy step from init (reuse `runDeployStep` pattern from init.ts)
- Force-rebuild: remove deployed artifacts first, then re-deploy
- Write new deploy manifest
- Show summary of what was rebuilt

The reinit command should:

1. Read current deploy manifest to know what was previously deployed
2. Remove all previously deployed artifacts from `~/.claude/`
3. Re-run the full deploy step (agents, skills, hooks, rules, statusline, settings merge)
4. Write new deploy manifest

**Files to create/edit:**

- `packages/luca-framework/src/commands/reinit.ts` (replace stub)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca reinit --force` completes without error
- Deploy manifest updated after reinit

### 7. Implement `luca update` global deploy flow

**Type:** auto
**TDD:** false
**Depends on:** none

The existing `update.ts` handles per-project template updates. Add a global update mode that:

- Detects if running in global context (no `.planning/config.json` in cwd)
- In global mode: runs the deploy step (same as init deploy), comparing with existing deploy manifest
- Shows diff: new files, updated files (hash changed), removed files
- Writes updated deploy manifest
- Supports `--dry-run` for preview

This is a separate code path from the per-project update. Add a `--global` flag or auto-detect based on context.

Alternatively, create a new utility `packages/luca-framework/src/utils/global-update.ts` that the update command delegates to when `--global` is passed or when no project config is found and global artifacts exist.

**Files to create/edit:**

- `packages/luca-framework/src/utils/global-update.ts` (new)
- `packages/luca-framework/src/commands/update.ts` (add --global flag, delegate)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `luca update --global --dry-run` shows what would be deployed
- `luca update --global` deploys artifacts and updates manifest

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Doctor runs all scopes**: `luca doctor` shows 9 checks (5 existing + 4 new)
3. **Doctor scoping works**: `luca doctor --scope=global` shows only global checks
4. **Reinit works**: `luca reinit --force` removes and redeploys all global artifacts
5. **Global update works**: `luca update --global --dry-run` shows deployment preview
6. **Manifest integrity**: After reinit/update, `~/.luca/manifests/deploy-manifest.json` is valid

## Success Criteria

- Doctor detects and reports MuninnDB binary/service health
- Doctor reports global artifact counts and deploy manifest version
- Doctor reports bridge CLI availability and state machine status
- Doctor reports project vault, .env presence, STATE.md/ROADMAP.md
- Doctor supports `--scope` to filter checks by category
- `luca reinit --force` fully removes and redeploys global artifacts
- `luca update --global` intelligently updates changed artifacts
- All commands follow existing patterns: citty, @clack/prompts, Zod schemas, JSDoc

## Output Specification

- 4 new doctor check files in `packages/luca-framework/src/utils/doctor/checks/`
- 1 new global update utility in `packages/luca-framework/src/utils/`
- Modified: doctor command, run-doctor, types, reinit command, update command
