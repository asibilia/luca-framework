# Requirements — v5.0.0 Global NPM Package

## Overview

Ship `@alecsibilia/luca-framework` as a globally-installable NPM package that provides one-command setup for any repository: prerequisite checks, MuninnDB binary installation, artifact building, deployment to `~/.claude/`, and guided vault configuration.

## Source

- Todo #17: `.planning/todos/pending/17-plugin-marketplace.md`
- Expert panel research + product discussion (2026-03-15)

## Requirements

### REQ-01: Global CLI Command Surface

**Priority:** P0 — Foundation

The CLI must support these commands when installed globally:

| Command           | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `luca init`       | First-time global setup (prerequisites, MuninnDB, build, deploy, vault)   |
| `luca doctor`     | Health check — prerequisites, global artifacts, MuninnDB, current project |
| `luca update`     | Check npm registry, rebuild + redeploy artifacts                          |
| `luca vault init` | Per-repo vault setup (guided wizard)                                      |
| `luca reinit`     | Force rebuild + redeploy (no version check)                               |
| `luca version`    | Current version + check for updates                                       |
| `luca help`       | Command reference                                                         |

**Existing commands to retain:** `status`, `add-skill`, `run:claude`, `run:cursor`

**Verification:** All commands listed, `--help` works, no command conflicts.

### REQ-02: Prerequisite Detection

**Priority:** P0 — Foundation

`luca init` Step 1 must:

- Detect Bun on PATH. If missing: prompt to install, abort if declined.
- Detect OS + architecture (darwin-arm64, darwin-x64, linux-x64, linux-arm64).
- Fail gracefully with actionable error messages for unsupported platforms.

**Verification:** Run on macOS ARM64 with/without Bun. Verify prompts and abort behavior.

### REQ-03: MuninnDB Binary Management

**Priority:** P0 — Core

`luca init` Step 2 must:

- Check if `muninndb` binary exists on PATH or in `~/.luca/bin/`.
- If missing: prompt "Download and install MuninnDB? (Y/n)". Abort if no.
- Download platform-specific binary.
- Install to `~/.luca/bin/muninndb`.
- Start MuninnDB service, verify health on port 8476.
- Provide PATH guidance if `~/.luca/bin/` is not on PATH.

**Verification:** Fresh install on clean system. Binary downloads, starts, health check passes.

### REQ-04: Build Pipeline Portability

**Priority:** P0 — Core

The build pipeline (`bun run build:all` equivalent) must work from the installed package location, not just the monorepo.

- Skills/agents must not reference monorepo-specific paths (e.g., `src/complexity/__helpers/model-routing.ts`).
- Artifact counts must be discoverable from the package.
- Build must produce valid `.claude/` artifacts from the installed location.

**Verification:** Install package globally, run build from package location, verify artifact output matches monorepo build.

### REQ-05: Settings Merge & Artifact Deployment

**Priority:** P0 — Core

`luca init` Step 4 must:

- If `~/.claude/settings.json` exists: interactive merge prompt.
  - Parse existing hooks by `matcher` + `event` as composite key.
  - Add new hooks that don't conflict.
  - Prompt for conflicts (same key, different script).
  - Backup existing to `~/.luca/backups/settings.json.bak`.
- Copy agents, skills, hooks, rules to `~/.claude/`.
- Track deployment in `~/.luca/manifests/deploy-manifest.json`.

**Verification:** Install with existing settings.json containing custom hooks. Verify merge preserves custom hooks, adds Luca hooks, creates backup.

### REQ-06: Guided Vault Setup

**Priority:** P1 — Setup Flow

`luca vault init` must:

1. Detect project directory name, suggest as vault name.
2. Instruct user to open MuninnDB Web UI at http://localhost:8476.
3. User creates vault + generates API key in Web UI.
4. User pastes API key into CLI prompt.
5. CLI verifies connectivity to new vault.
6. CLI writes `vault` to `.planning/config.json`.
7. CLI writes `MUNINN_DB_API_KEY=mk_xxx` to `.env`.
8. CLI ensures `.env` is in `.gitignore`.

**Confirmed limitation:** MuninnDB admin APIs do NOT support vault creation or key generation. The CLI must guide users through the Web UI.

**Verification:** Run `luca vault init` in a fresh repo. Verify config.json and .env written correctly.

### REQ-07: Doctor Health Checks

**Priority:** P1 — Maintenance

`luca doctor` must check:

- **Prerequisites:** Bun on PATH + version, MuninnDB running (port 8476), MUNINN_DB_API_KEY in environment.
- **Global Artifacts (~/.claude/):** agents/ count, skills/ count, hooks/ count, rules/ count, settings.json hooks registered, luca-bridge on PATH.
- **Framework Runtime:** State machine module loadable, bridge CLI responsive.
- **Current Project (if in a repo):** .planning/config.json found, vault name + reachability, .env has MUNINN_DB_API_KEY.

**Verification:** Run `luca doctor` in various states (fresh, partial install, complete install, in-repo, outside-repo).

### REQ-08: Update & Reinit Commands

**Priority:** P1 — Maintenance

- `luca update`: Check npm registry for new version. If available: download, rebuild artifacts, redeploy to ~/.claude/. Show changelog summary.
- `luca reinit`: Force rebuild + redeploy without version check. Useful after manual source changes.

**Verification:** Publish test version, run `luca update`, verify rebuild + redeploy.

### REQ-09: ~/.luca/ Directory Structure

**Priority:** P0 — Infrastructure

Framework-owned state lives in `~/.luca/`, separate from `~/.claude/` (which Claude Code owns):

```
~/.luca/
  bin/
    muninndb          # MuninnDB binary
  manifests/
    deploy-manifest.json  # Tracks what was deployed + when
  backups/
    settings.json.bak     # Pre-merge backup of user settings
```

**Verification:** Directory structure created on first `luca init`. Permissions correct.

### REQ-10: Config Template Portability

**Priority:** P2 — Polish

Default harness checks (bun test, tsc) won't apply to all projects. The init flow must:

- Auto-detect project stack (package.json scripts, tsconfig.json presence).
- Generate appropriate harness config template.
- Handle hook double-firing dedup when project also has `.claude/settings.json`.

**Verification:** Run `luca vault init` in a non-TypeScript project. Verify harness config adapts.

## Out of Scope

- Plugin marketplace / community registry (future v5.1+)
- Auto-updating framework (enterprise teams need control)
- CI/CD integration (users configure their own pipelines)
- Windows support (Bun + MuninnDB are macOS/Linux first)

## Key Challenges

- **Settings merge complexity** — Users may have custom hooks, MCP servers, permissions.
- **MuninnDB binary distribution** — Need reliable download URLs per platform.
- **Hook double-firing** — Project + user settings merge in Claude Code.
- **Skills referencing monorepo paths** — Must work from installed package.
- **Config harness portability** — Default checks won't apply to all projects.

## Already Portable (No Changes Needed)

- Hook scripts use `$CLAUDE_PROJECT_DIR`
- `run_bridge()` cascading lookup
- MuninnDB is vault-based
- Claude Code natively merges user + project settings
- `luca-bridge` binary already in package.json
- Per-vault API key resolution

---

_Requirements created: 2026-03-16 — v5.0.0 milestone_
