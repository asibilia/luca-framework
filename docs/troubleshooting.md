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

- **Issue**: Project predates #220 and has session artifacts (`PLAN.md`, `RESEARCH.md`, `CONTEXT.md`, `POSTMORTEM.md`, `REVIEW-*.md`, `*-capture-*.md`, `verification-result.json`, etc.) loose at the `.planning/` root instead of under `.planning/phases/<currentPhaseSlug>/`.
- **Symptom**: When the pipeline reaches **finalize**, it emits a `stragglerWarning` listing the loose files and refuses to mark the phase complete cleanly.
- **Fix**: From inside an active pipeline session, call:

  ```
  workflowState({ action: "archive-loose" })
  ```

  The action moves recognized stragglers into `.planning/phases/<currentPhaseSlug>/`, skipping any file whose target already exists. Cross-phase files (`ROADMAP.md`, `todos/`, `luca-state.json`, `config.json`, JSONL audit logs) are left at the root.

- **Guard rails** — the action refuses to run if:
  - `.luca-lock.json` is held by another live PID (run from the session that owns the lock).
  - `currentPhaseSlug` is unset in `luca-state.json` (run triage first so a target phase dir exists).

  Files whose destination already exists are reported under `skipped` rather than overwritten — resolve those manually.

## Common Errors

| Error                          | Cause                           | Resolution                                                                         |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| `Error: Not a Luca project`    | Missing `.planning` directory   | Run `luca init` to initialize the project                                          |
| `Error: Plan already executed` | SUMMARY.md exists for this plan | Delete the SUMMARY.md if you need to re-run (not recommended)                      |
| `Error: Authentication failed` | Invalid or expired tokens       | Run `gh auth login` for GitHub, or check your `.env` file for other service tokens |

## Still having trouble?

If your issue isn't covered here:

1. Run `luca doctor` to check your environment.
2. Check the [Getting Started](getting-started.md) guide for setup tips.
3. Open an issue on the [GitHub repository](https://github.com/alecsibilia/luca-framework).
