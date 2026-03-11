# Global Installation

Make Luca available in **any repository** by deploying agents, skills, hooks, and rules to `~/.claude/` (user-level Claude Code config).

## Prerequisites

- [Bun](https://bun.sh) installed
- [Claude Code](https://claude.ai/claude-code) installed (`~/.claude/` exists)
- Luca framework monorepo cloned locally

## Installation

```bash
# 1. Clone and install dependencies
cd ~/Github/luca-framework  # or wherever your clone lives
bun install

# 2. Build all artifacts (must be done outside Claude Code)
bun run build:all

# 3. Deploy globally
bun run deploy
```

The deploy script:

- Installs `luca-bridge` globally via `bun link`
- Symlinks agents and skills to `~/.claude/`
- Copies hooks and universal rules to `~/.claude/`
- Merges Luca hooks into `~/.claude/settings.json` (preserving existing settings)

### Deploy Modes

```bash
bun run deploy           # Symlinks agents/skills (auto-update on rebuild)
bun run deploy:copy      # File copies (standalone, no monorepo dependency)
bun run deploy:remove    # Uninstall all Luca global artifacts
```

For a preview without making changes:

```bash
bun scripts/deploy-global.ts --dry-run
```

## Updating After Pulling Changes

```bash
cd ~/Github/luca-framework
git pull
bun run build:all
bun run deploy
```

If you deployed with `--copy` mode, you must re-run `bun run deploy:copy` after every update. Symlink mode (default) auto-updates when you rebuild.

## Uninstalling

```bash
cd ~/Github/luca-framework
bun run deploy:remove
```

This removes:

- `~/.claude/agents/` (all Luca agents)
- Luca skills from `~/.claude/skills/` (marketplace skills preserved)
- Luca hooks from `~/.claude/hooks/` (`cleanup-processes.sh` preserved)
- Luca rules from `~/.claude/rules/`
- Luca hook registrations from `~/.claude/settings.json`

## Per-Project Vault Configuration

By default, MuninnDB operations use the `"default"` vault. To use a project-specific vault:

### Option 1: Environment Variable

Create a `.env` file in your project root:

```bash
LUCA_MUNINN_VAULT=my-project
```

Bun auto-loads `.env`, so no additional setup is needed.

### Option 2: Config File

After Luca initializes `.planning/` in your project, edit `.planning/config.json`:

```json
{
  "muninn": {
    "vault": "my-project"
  }
}
```

## How It Works

### Bridge Resolution

Skills and agents invoke the state bridge via `luca-bridge` (not a hardcoded monorepo path). Resolution order:

1. **Global binary**: `luca-bridge` on PATH (from `bun link`)
2. **Local binary**: `node_modules/.bin/luca-bridge` (hooks add this to PATH)
3. **Monorepo fallback**: `packages/luca-framework/src/state/bridge.ts` (in `common.sh` only)
4. **Graceful skip**: `2>/dev/null || ...` handles missing bridge

### Hook Dedup Prevention

When hooks are registered both globally (`~/.claude/settings.json`) and per-project (`.claude/settings.json`), Claude Code fires both. Each hook includes a `guard_dedup` call that uses a per-project timestamp file in `/tmp/` with a 5-second TTL to prevent duplicate execution.

### What Gets Deployed

| Artifact | Count | Method  | Location            |
| -------- | ----- | ------- | ------------------- |
| Agents   | ~38   | Symlink | `~/.claude/agents/` |
| Skills   | ~53   | Symlink | `~/.claude/skills/` |
| Hooks    | ~9    | Copy    | `~/.claude/hooks/`  |
| Rules    | 10    | Copy    | `~/.claude/rules/`  |

**Skipped** (framework-specific):

- `pre-commit-drift-check.sh` hook (checks `src/` vs `.claude/` drift)
- 11 framework-specific rules (module-boundary, domain-architecture, etc.)

## Troubleshooting

### `luca-bridge` Not Found

```bash
# Check if it's installed
which luca-bridge

# Re-install
cd ~/Github/luca-framework/packages/luca-framework
bun link
```

### Hooks Firing Twice

The dedup guard should prevent this. If it persists:

```bash
# Clear dedup state
rm -f /tmp/.luca-dedup-*
```

### Symlinks Broken After Moving Monorepo

If you moved or renamed your monorepo directory:

```bash
# Re-deploy with updated paths
cd /new/path/to/luca-framework
bun run deploy
```

Or switch to copy mode:

```bash
bun run deploy:copy
```

### Session Start Not Working

Verify hooks are registered:

```bash
cat ~/.claude/settings.json | grep session-start
```

Verify the hook script exists and is executable:

```bash
ls -la ~/.claude/hooks/session-start.sh
```

### Deploy Manifest

The deploy script writes `~/.claude/.luca-deploy-manifest.json` with metadata:

```json
{
  "version": "1.0.0",
  "deployed_at": "2026-03-10T...",
  "mode": "symlink",
  "source_path": "/Users/you/Github/luca-framework",
  "counts": { "agents": 38, "skills": 53, "hooks": 9, "rules": 10 }
}
```

This manifest is used by `bun run deploy:remove` to cleanly uninstall.
