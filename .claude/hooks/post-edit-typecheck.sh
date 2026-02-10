#!/usr/bin/env bash
# post-edit-typecheck.sh — Async type-check after TypeScript file edits
#
# Hook event: PostToolUse (matcher: Edit|Write)
# Type: Command hook (async: true)
# Timeout: 30 seconds
#
# Reads the edited file path from stdin JSON, checks if it is a TypeScript
# file, and runs tsc --noEmit if so. Since this hook is async, results are
# delivered on the next turn. Non-TypeScript files are skipped immediately.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract file path using bun -e
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const filePath = data.tool_input?.file_path;
  if (filePath) process.stdout.write(filePath);
")

# Exit early if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Exit early if file doesn't exist
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Only type-check TypeScript files
case "$FILE_PATH" in
  *.ts|*.tsx)
    # Continue to type-check
    ;;
  *)
    # Not a TypeScript file — skip
    exit 0
    ;;
esac

# Check if tsconfig.json exists in project root
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
if [ ! -f "$PROJECT_DIR/tsconfig.json" ]; then
  exit 0
fi

# Run type-checker (project-wide, since types are interconnected)
set +e
TSC_OUTPUT=$(cd "$PROJECT_DIR" && bunx --bun tsc --noEmit 2>&1)
TSC_EXIT=$?
set -e

if [ $TSC_EXIT -ne 0 ] && [ -n "$TSC_OUTPUT" ]; then
  # Truncate output to avoid flooding the context
  TRUNCATED=$(echo "$TSC_OUTPUT" | head -20)
  LINE_COUNT=$(echo "$TSC_OUTPUT" | wc -l | tr -d ' ')

  if [ "$LINE_COUNT" -gt 20 ]; then
    TRUNCATED="$TRUNCATED
... ($LINE_COUNT total lines, showing first 20)"
  fi

  # Output as JSON systemMessage for async delivery
  # Using bun -e to safely JSON-encode the error output
  HOOK_FILE_PATH="$FILE_PATH" printf '%s' "$TRUNCATED" | bun -e "
    const errors = await Bun.stdin.text();
    const filePath = process.env.HOOK_FILE_PATH;
    const msg = {
      systemMessage: 'TypeScript type errors found after editing ' + filePath + ':\n' + errors.trim()
    };
    process.stdout.write(JSON.stringify(msg));
  "
fi

exit 0
