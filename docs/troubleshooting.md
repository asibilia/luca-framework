# Troubleshooting Luca

This guide covers common issues you might encounter while using Luca and how to resolve them.

## Installation Issues

### `create-luca` fails to run
- **Issue**: `npx create-luca` returns an error or hangs.
- **Solution**: Ensure you have a stable internet connection and are using Node.js v20+ or Bun v1.0+. Try clearing your npx cache: `npx clear-npx-cache`.

### Missing dependencies after init
- **Issue**: Running `luca` commands fails with "module not found".
- **Solution**: Run `bun install` or `npm install` in your project root to ensure all peer dependencies are installed.

## Execution Issues

### Plan execution fails on a specific task
- **Issue**: `luca execute` stops with an error during a task.
- **Solution**: 
  1. Check the error message in the terminal.
  2. Fix the underlying issue in your code.
  3. You can resume execution by running the same command; Luca will detect completed tasks via git history.

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

### Environment variables not detected
- **Issue**: Adapters (like GitHub or Jira) fail due to missing credentials.
- **Solution**: Luca automatically loads `.env` files in the project root. Ensure your variables (e.g., `GITHUB_TOKEN`, `JIRA_API_TOKEN`) are correctly defined there.

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Error: Not a Luca project` | Missing `.planning` directory | Run `luca init` to initialize the project |
| `Error: Plan already executed` | SUMMARY.md exists for this plan | Delete the SUMMARY.md if you need to re-run (not recommended) |
| `Error: Authentication failed` | Invalid or expired tokens | Check your `.env` file and regenerate tokens if necessary |

## Still having trouble?

If your issue isn't covered here:
1. Run `luca doctor` to check your environment.
2. Check the [Getting Started](getting-started.md) guide for setup tips.
3. Open an issue on the [GitHub repository](https://github.com/alecsibilia/luca-framework).
