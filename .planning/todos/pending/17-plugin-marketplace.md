---
title: "Global NPM Package: One-Command Luca Framework Installation"
area: framework/ecosystem
created: 2026-03-01
updated: 2026-03-15
source: expert-panel-research + product discussion
tier: 4
complexity: CRITICAL
moat: Strong
priority: P1
milestone: v5.0.0
---

## Context

No competitor has a plugin ecosystem beyond MCP servers. Network effects: each published agent makes Luca more valuable for everyone. Highest long-term upside, highest effort.

**Objective:** Ship a single global NPM package (`@alecsibilia/luca-framework`) that installs everything needed to use Luca in any repository — MuninnDB, Claude Code artifacts, CLI tooling, and framework runtime.

## Design Decisions (2026-03-15)

| Decision               | Choice                                          | Rationale                                                       |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| MuninnDB install       | Bundle platform binary, prompt Y/n, abort if no | Must be present for framework to function                       |
| Bun requirement        | Required, prompt to install, abort if no        | Framework shebangs and runtime depend on Bun                    |
| Settings merge         | Interactive prompt, try clean merge             | Users may have existing ~/.claude/settings.json                 |
| Artifact mode          | Copy for npm install, symlink for local dev     | npm global install can't symlink to package location reliably   |
| Package scope          | Installer CLI + framework runtime               | Single package ships everything                                 |
| Vault/API key creation | Manual via MuninnDB Web UI (guided wizard)      | No programmatic API exists for vault creation or key generation |

## What Already Exists

| Piece                | Status                                            | Location                               |
| -------------------- | ------------------------------------------------- | -------------------------------------- |
| NPM package          | `@alecsibilia/luca-framework` v2.4.0              | `packages/luca-framework/`             |
| CLI binaries         | `luca` + `luca-bridge` (#!/usr/bin/env bun)       | `bin/luca.js`, `bin/luca-bridge.js`    |
| CLI subcommands      | `init`, `update`, `status`, `doctor`, `add-skill` | `src/cli.ts` (citty)                   |
| Global deploy script | Symlinks/copies to ~/.claude/                     | `scripts/deploy-global.ts`             |
| Build pipeline       | TS source -> .claude/ artifacts + dist/plugin/    | `scripts/build-all.ts`                 |
| MuninnDB HTTP client | Fire-and-forget fetch                             | `src/emitter/__helpers/muninn-http.ts` |
| Plugin manifest      | dist/plugin/.claude-plugin/                       | Already generated                      |

## CLI Command Surface

| Command           | Purpose                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `luca init`       | First-time setup (Bun check, MuninnDB install, build artifacts, deploy to ~/.claude/, guided vault setup) |
| `luca doctor`     | Health check — prerequisites, artifacts, MuninnDB, current project                                        |
| `luca update`     | Check npm registry for new version, rebuild + redeploy artifacts                                          |
| `luca vault init` | Per-repo vault setup (guided wizard -> Web UI -> verify + write config)                                   |
| `luca reinit`     | Force rebuild + redeploy (no version check)                                                               |
| `luca version`    | Current version + check for updates                                                                       |
| `luca help`       | Command reference                                                                                         |

## `luca init` Flow (5 Steps)

### Step 1: Check prerequisites

- Detect Bun on PATH. If missing: prompt to install, abort if declined.
- Detect OS + architecture for platform-specific downloads.

### Step 2: Install MuninnDB

- Check if `muninndb` binary exists on PATH or in `~/.luca/bin/`.
- If missing: prompt "Download and install MuninnDB? (Y/n)". Abort if no.
- Download platform-specific binary (darwin-arm64, darwin-x64, linux-x64, linux-arm64).
- Install to `~/.luca/bin/muninndb`. Add to PATH guidance if needed.
- Start MuninnDB service, verify health on port 8476.

### Step 3: Build framework artifacts

- Run the build pipeline (same as `bun run build:all`).
- Produce: 38 agents, 53 skills, 9 hooks, 10 universal rules.

### Step 4: Deploy to ~/.claude/

- If `~/.claude/settings.json` exists: interactive merge prompt.
  - Parse existing hooks by `matcher` + `event` as composite key.
  - Add new hooks that don't conflict.
  - Prompt for conflicts (same key, different script).
  - Backup existing to `~/.claude/settings.json.bak`.
- Copy agents, skills, hooks, rules to `~/.claude/`.
- Track deployment in `~/.luca/manifests/deploy-manifest.json`.

### Step 5: Guided default vault setup

- Open MuninnDB Web UI instructions (http://localhost:8476).
- User manually creates "default" vault + API key in Web UI.
- User pastes API key back to CLI.
- CLI verifies connectivity.
- CLI writes API key guidance (add to shell profile: `export MUNINN_DB_API_KEY=...`).

### Post-Init Readout

```
Next Steps:
1. Get your MuninnDB API key:
   -> Open http://localhost:8476/dashboard
   -> Create an API key for the "default" vault
   -> Add to your shell profile:
      export MUNINN_DB_API_KEY=your-key-here

2. Set up your first project:
   -> cd your-project/
   -> luca vault init
   -> This creates .planning/config.json with a
      project-specific vault + .env with API key

3. Verify everything works:
   -> luca doctor
```

## `luca vault init` Flow (Guided Wizard)

Vault creation and API key generation have no programmatic API in MuninnDB — both require the Web UI. The CLI acts as a guided wizard:

1. Detect project directory name, suggest as vault name.
2. Instruct user to open MuninnDB Web UI at http://localhost:8476.
3. User creates vault + generates API key in Web UI.
4. User pastes API key into CLI prompt.
5. CLI verifies connectivity to new vault.
6. CLI writes `vault` to `.planning/config.json`.
7. CLI writes `MUNINN_DB_API_KEY=mk_xxx` to `.env`.
8. CLI ensures `.env` is in `.gitignore`.

**Confirmed limitation (Phase 03 research):** MuninnDB admin APIs support clone/clear/delete but NOT create. No REST endpoint or MCP tool for vault creation or key generation.

## `luca doctor` Checks

```
Prerequisites:
  - Bun on PATH + version
  - MuninnDB running (port 8476)
  - MUNINN_DB_API_KEY set in environment

Global Artifacts (~/.claude/):
  - agents/ count
  - skills/ count
  - hooks/ count
  - rules/ count
  - settings.json hooks registered (N/N)
  - luca-bridge on PATH

Framework Runtime:
  - State machine module loadable
  - Bridge CLI responsive

Current Project (if in a repo):
  - .planning/config.json found
  - Vault name + reachability
  - .env has MUNINN_DB_API_KEY
```

## `~/.luca/` Directory Structure

Framework-owned state, separate from `~/.claude/` (which Claude Code owns):

```
~/.luca/
  bin/
    muninndb          # MuninnDB binary
  manifests/
    deploy-manifest.json  # Tracks what was deployed + when
  backups/
    settings.json.bak     # Pre-merge backup of user settings
```

## Key Challenges

- **Settings merge complexity** — Users may have custom hooks, MCP servers, permissions in existing settings.json. Merge must be surgical.
- **MuninnDB binary distribution** — Need reliable download URLs per platform + checksum verification.
- **Hook double-firing** — When project also has `.claude/settings.json` with hooks. Claude Code merges user + project settings natively, but duplicate hook matchers need dedup.
- **Skills referencing monorepo paths** — Some skills reference `src/complexity/__helpers/model-routing.ts` etc. Must work from installed package location.
- **Config harness portability** — Default harness checks (bun test, tsc) won't apply to all projects. Need generic template with auto-detect.

## Already Portable (No Changes Needed)

- Hook scripts use `$CLAUDE_PROJECT_DIR` (project-agnostic)
- `run_bridge()` cascading lookup (binary -> monorepo source -> skip)
- MuninnDB is vault-based (supports multi-vault)
- Claude Code natively merges user + project settings
- `luca-bridge` binary already declared in package.json
- Per-vault API key resolution: `MUNINN_DB_<VAULT_SCREAMING_SNAKE>_API_KEY` -> `MUNINN_DB_API_KEY`

## Notes

- Source: expert-panel-research (Competitive Edge Expert) + product discussion (2026-03-15)
- MuninnDB Web UI: http://localhost:8476 (default), REST API on port 8475
- MuninnDB API key format: `mk_<random>` (vault-scoped), `mn_admin_<random>` (admin ops)
