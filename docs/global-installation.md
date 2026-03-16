# Global Installation

Install Luca as a global npm package and make it available in any project.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Claude Code](https://claude.ai/claude-code) installed

## Installation

```bash
# Install globally
npm install -g @alecsibilia/luca-framework

# Run guided setup (5 steps: prerequisites, MuninnDB, build, deploy, vault)
luca init
```

The `luca init` command:

1. Verifies Bun is installed and on PATH
2. Downloads and starts MuninnDB (semantic memory service)
3. Deploys agents, skills, hooks, and rules to `~/.claude/`
4. Merges Luca hooks into `~/.claude/settings.json` (preserving existing settings)
5. Optionally runs `luca vault:init` if the current directory is a project

## Per-Project Setup

After global installation, set up each project individually:

```bash
cd ~/my-project
luca vault:init
```

This wizard:

- Detects your project stack (React+TS, Node+TS, Node, etc.)
- Generates `.planning/config.json` with stack-appropriate harness checks
- Configures MuninnDB vault for project-scoped memory
- Scaffolds `.claude/` and/or `.cursor/` platform files

### Harness Configuration

The wizard auto-configures verification checks based on your stack:

| Stack              | test       | typecheck      | lint     | build    |
| ------------------ | ---------- | -------------- | -------- | -------- |
| react-ts / node-ts | `bun test` | `tsc --noEmit` | disabled | disabled |
| react / node       | `bun test` | disabled       | disabled | disabled |
| unknown            | disabled   | disabled       | disabled | disabled |

Edit `.planning/config.json` to enable/disable checks or change commands.

## Commands Reference

| Command                       | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `luca init`                   | Global setup: prerequisites, MuninnDB, deploy, vault     |
| `luca vault:init`             | Per-project wizard: stack detection, config, scaffolding |
| `luca doctor`                 | Run environment diagnostics and health checks            |
| `luca doctor --scope=global`  | Check only global artifacts and MuninnDB                 |
| `luca doctor --scope=project` | Check only project config and drift                      |
| `luca update`                 | Update global artifacts after package upgrade            |
| `luca update --global`        | Re-deploy agents/skills/hooks/rules to `~/.claude/`      |
| `luca reinit`                 | Reset and re-run initialization                          |
| `luca reinit --force`         | Force re-initialization (overwrites existing)            |
| `luca version`                | Show installed version and runtime info                  |

## Updating

```bash
# Update the npm package
npm update -g @alecsibilia/luca-framework

# Re-deploy global artifacts
luca update --global
```

## Uninstalling

```bash
# Remove the npm package
npm uninstall -g @alecsibilia/luca-framework

# Clean up global artifacts (optional)
rm -rf ~/.claude/agents/ ~/.claude/skills/ ~/.claude/hooks/ ~/.claude/rules/
rm -rf ~/.luca/
```

To remove Luca from a specific project, delete the `.planning/` directory and any Luca-generated files in `.claude/` or `.cursor/`.

## How It Works

### Settings Merge

When `luca init` deploys hooks to `~/.claude/`, it uses a three-tier merge:

1. **Auto-merge**: New hook slots are added silently
2. **Auto-skip**: Identical hooks already present are skipped
3. **Conflict prompt**: Non-Luca hooks at the same slot prompt for resolution

Your existing `~/.claude/settings.json` is backed up before any merge.

### Hook Dedup

When hooks are registered both globally (`~/.claude/settings.json`) and per-project (`.claude/settings.json`), Claude Code fires both. Every Luca hook includes a `guardDedup()` call that uses a per-project timestamp file in `/tmp/` with a 5-second TTL to prevent duplicate execution.

### Deploy Manifest

A manifest at `~/.luca/manifests/` tracks all deployed artifacts with checksums. Used by `luca doctor` and `luca update` to detect drift and manage upgrades.

### MuninnDB Binary Management

`luca init` downloads the MuninnDB binary to `~/.luca/bin/` and manages the service lifecycle. The binary is platform-specific (macOS arm64/x64, Linux x64).

## Per-Project Vault Configuration

By default, MuninnDB uses the `"default"` vault. For project-specific memory:

### Option 1: Wizard (Recommended)

`luca vault:init` configures the vault automatically during project setup.

### Option 2: Environment Variable

Create a `.env` file in your project root:

```bash
LUCA_MUNINN_VAULT=my-project
```

Bun auto-loads `.env`, so no additional setup is needed.

### Option 3: Config File

Edit `.planning/config.json`:

```json
{
  "muninn": {
    "vault": "my-project"
  }
}
```

## Troubleshooting

### `luca` Command Not Found

```bash
# Verify global install
npm list -g @alecsibilia/luca-framework

# Check npm global bin directory is on PATH
npm config get prefix
# Add {prefix}/bin to your PATH if needed
```

### MuninnDB Not Starting

```bash
# Check binary exists and is executable
ls -la ~/.luca/bin/muninndb

# Check health manually
luca doctor --scope=global

# Re-download binary
luca init --skip-deploy --skip-vault
```

### Hooks Firing Twice

The guardDedup mechanism should prevent this. If it persists:

```bash
# Clear dedup state
rm -f /tmp/.luca-dedup-*
```

### Symlinks Broken After Moving Monorepo (Dev Mode)

If using dev mode and you moved or renamed the monorepo:

```bash
cd /new/path/to/luca-framework
luca init --skip-muninndb --skip-vault
```

### Config Missing Harness Section

If `.planning/config.json` was created before Phase 178, it may lack the `harness` section. Re-run `luca vault:init` or manually add the harness section from the template.

### Type Check Fails on First Run

Ensure Bun is installed and TypeScript is a dependency:

```bash
bun install
bunx --bun tsc --noEmit
```

## Dev Mode (Contributors)

If developing Luca itself from the monorepo:

```bash
# Clone and install
git clone https://github.com/alecsibilia/luca-framework.git
cd luca-framework
bun install

# Build all artifacts (run outside Claude Code sessions)
bun run build:all

# Deploy globally from monorepo source
luca init
```

In dev mode, `luca init` detects the monorepo and deploys from the local `.claude/` build output. Changes are reflected after rebuilding with `bun run build:all`.
