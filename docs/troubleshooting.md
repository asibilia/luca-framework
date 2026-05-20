# Troubleshooting Luca

This guide covers common issues you might encounter while using Luca and how to resolve them.

## Installation Issues

### `create-luca` fails to run

- **Issue**: `npx create-luca` returns an error or hangs.
- **Solution**: Ensure you have a stable internet connection and are using Node.js v18+ or Bun v1.0+. Try clearing your npx cache: `npx clear-npx-cache`.

### Missing dependencies after init

- **Issue**: Running `luca` commands fails with "module not found".
- **Solution**: Run `bun install` or `npm install` in your project root to ensure all peer dependencies are installed.

## Execution Issues

### Plan execution fails on a specific task

- **Issue**: The AI agent stops with an error during a task while executing a plan via `/lu`.
- **Solution**:
  1. Check the error message in the IDE output.
  2. Fix the underlying issue in your code.
  3. Re-open the plan and use `/lu` again; the agent will detect completed tasks via git history.

### Git commit failures

- **Issue**: Luca cannot commit a completed task.
- **Solution**: Ensure your git workspace is clean before starting execution. Check if you have any pre-commit hooks that might be failing.

### "No plan found" error

- **Issue**: Luca cannot find the plan file you specified.
- **Solution**: Verify the path to your `PLAN.md` file. Use absolute paths or relative paths from the project root.

## Framework Issues

### `luca update` conflicts

- **Issue**: Updating the framework results in merge conflicts in your templates.
- **Solution**: Luca writes conflicting files with a `.new` extension (e.g., `index.ts.new`). Manually compare these files with your existing ones and merge the changes.

### GitHub authentication not working

- **Issue**: Adapters (like GitHub) fail due to missing credentials.
- **Solution**: Luca uses the GitHub CLI for authentication. Run `gh auth login` to authenticate. For Jira, ensure your `JIRA_API_TOKEN` is defined in your `.env` file.

### Migrating a legacy `.planning/` layout

- **Issue**: Project still uses the legacy `.planning/` directory but is moving to the new `.luca/` contract.
- **Fix**: Run from the project root:

  ```bash
  # Preview what will move/delete
  luca migrate-planning --dry-run

  # Execute the migration
  luca migrate-planning

  # Proceed even when .planning/ has uncommitted changes (use cautiously)
  luca migrate-planning --force
  ```

  The command:
  - Moves root files: `.planning/luca-state.json` → `.luca/state.json`, `.planning/.luca-lock.json` → `.luca/lock.json`, `.planning/ROADMAP.md` → `.luca/roadmap.md`, `.planning/config.json` → `.luca/config.json`, `.planning/session-ledger.jsonl` → `.luca/ledger.jsonl`.
  - Deletes ephemeral files: `.planning/.context-metrics.json`, `.planning/harness-result.json`.
  - Preserves git history via `git mv` (falls back to plain rename for untracked files — there's no history to preserve there).
  - Is **idempotent** — re-running skips already-migrated destinations.
  - **Refuses** to run when `.planning/` has uncommitted changes (unless `--force`).

- **Phase directories** (`.planning/phases/<slug>/`) are intentionally **not** migrated by this command — the legacy layout used arbitrary numbering (single-digit, triple-digit, collisions) that doesn't fit the new `<NN-slug>` allowlist. A follow-up command will handle slug normalization once the collision strategy is set. Until then, the old `.planning/phases/` directories remain in place for reference.

- **Todos** (`.planning/todos/`) are likewise not migrated — the new workflow stores backlog in MuninnDB (per-milestone snapshots are exported to `.luca/milestones/v<SEMVER>-backlog-snapshot.{json,md}`). Use `luca todo from-issue <#>` to triage GitHub issues into the MuninnDB backlog when those tools land.

- **`.gitignore`**: after migration, the legacy `.planning/*` patterns are still listed but won't match anything (the files are gone). New `.luca/*` runtime files (state.json, lock.json, ledger.jsonl, telemetry/) are ignored by the updated rules; everything else under `.luca/` is committed.

## Common Errors

| Error                          | Cause                           | Resolution                                                                         |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| `Error: Not a Luca project`    | Missing `.luca` directory       | Run `luca init` to initialize the project                                          |
| `Error: Plan already executed` | SUMMARY.md exists for this plan | Delete the SUMMARY.md if you need to re-run (not recommended)                      |
| `Error: Authentication failed` | Invalid or expired tokens       | Run `gh auth login` for GitHub, or check your `.env` file for other service tokens |

## Still having trouble?

If your issue isn't covered here:

1. Run `luca doctor` to check your environment.
2. Check the [Getting Started](getting-started.md) guide for setup tips.
3. Open an issue on the [GitHub repository](https://github.com/alecsibilia/luca-framework).
