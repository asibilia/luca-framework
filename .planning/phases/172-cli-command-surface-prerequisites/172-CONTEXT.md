# Phase 172 Context — CLI Command Surface & Prerequisites

## Decisions

### 1. Init Command Restructuring [researched]

**Decision:** Keep current `init` as the global setup flow. Move per-project scaffolding to `vault:init`.

**Rationale:**

- Current `init` (wizard.ts, files.ts, detect.ts) scaffolds per-project `.planning/`, IDE config, etc.
- New `init` needs to be global: prerequisites → MuninnDB → build → deploy → vault
- The per-project wizard code stays mostly intact but gets called from `vault:init` instead
- If user runs `luca init` in a project that already has global Luca: guide them to `vault:init`

**Implementation:**

- `commands/init.ts` → becomes global setup orchestrator (5-step flow from todo spec)
- New `commands/vault-init.ts` → absorbs current per-project wizard behavior
- `utils/wizard.ts`, `utils/files.ts`, `utils/detect.ts` → reused by vault-init

### 2. Global vs Local Context Detection [researched]

**Decision:** Use `import.meta.dir` (Bun-native) with a monorepo indicator check.

**Rationale:**

- `import.meta.dir` gives the absolute directory of the running script
- If the resolved path contains `packages/luca-framework/` → dev mode (monorepo)
- Otherwise → global mode (installed package)
- This is simple, deterministic, and Bun-native

**Implementation:**

- New `utils/runtime-context.ts` with `detectRuntimeContext()` function
- Returns `{ mode: 'global' | 'dev', packageDir: string, homeDir: string }`
- Used by init, doctor, update to resolve paths

### 3. citty Subcommand Pattern [researched]

**Decision:** Use colon-namespaced commands (`vault:init`) following existing `run:claude` / `run:cursor` pattern.

**Rationale:**

- citty already uses this pattern in the existing CLI: `run:claude`, `run:cursor`
- Avoids nested subcommand complexity
- User types `luca vault:init` (consistent with existing patterns)
- Alternative `vault-init` is also acceptable but less consistent with existing naming

**Implementation:**

- Add to `cli.ts` subCommands: `"vault:init": () => import("./commands/vault-init").then(...)`
- Add `reinit`, `version` as top-level subcommands

### 4. ~/.luca/ Directory Structure [researched]

**Decision:** Create lazily on first `luca init`. Structure: `bin/`, `manifests/`, `backups/`.

**Rationale:**

- No point creating before first init (user hasn't installed anything yet)
- Use `mkdir -p` equivalent (Bun.write with recursive)
- Store binary (MuninnDB), deployment tracking, settings backups

**Implementation:**

- New `utils/luca-home.ts` with `ensureLucaHome()` function
- Returns paths: `{ root, bin, manifests, backups }`
- Creates directories if they don't exist
- Uses `Bun.env.HOME` or `os.homedir()` for home directory

### 5. Prerequisite Detection UX [researched]

**Decision:** Use @clack/prompts for all interactive prompts. Check `which bun` equivalent. Abort with clear error.

**Rationale:**

- @clack/prompts already used by existing init command
- Bun detection: `Bun.which('bun')` or check `process.versions.bun`
- OS/arch: `process.platform` + `process.arch`
- Keep it simple: detect → prompt if missing → abort if declined

**Implementation:**

- New `utils/prerequisites.ts` with `checkPrerequisites()` function
- Returns `{ bun: { installed, version, path }, os, arch }`
- If Bun missing: show install instructions via @clack, abort if declined

## Scope Guardrail

This phase ONLY covers:

- CLI command surface restructuring (citty subCommands)
- Prerequisite detection utilities
- ~/.luca/ directory structure creation
- Runtime context detection (global vs dev mode)

Does NOT cover:

- MuninnDB download/install (Phase 173)
- Build pipeline changes (Phase 174)
- Settings merge logic (Phase 175)
- Vault wizard implementation (Phase 176)

## Files Expected to Change

- `packages/luca-framework/src/cli.ts` — Add new subcommands
- `packages/luca-framework/src/commands/init.ts` — Restructure as global setup entry
- `packages/luca-framework/src/commands/vault-init.ts` — NEW: per-repo wizard (moved from init)
- `packages/luca-framework/src/commands/reinit.ts` — NEW: force rebuild stub
- `packages/luca-framework/src/commands/version.ts` — NEW: version + update check
- `packages/luca-framework/src/utils/prerequisites.ts` — NEW: Bun/OS detection
- `packages/luca-framework/src/utils/runtime-context.ts` — NEW: global vs dev mode
- `packages/luca-framework/src/utils/luca-home.ts` — NEW: ~/.luca/ management

---

_Context created: 2026-03-16 — Auto mode (full-auto autopilot)_
_All decisions: [researched] — based on codebase analysis of existing patterns_
