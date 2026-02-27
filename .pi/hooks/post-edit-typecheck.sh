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
# Runtime detection: Reads .planning/config.json for "runtime" field,
# falls back to command -v detection. Uses bunx or npx for tsc accordingly.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract file path using bun -e
# Claude Code: tool_input.file_path, Cursor: file_path (top-level)
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const filePath = data.tool_input?.file_path ?? data.file_path;
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

# Detect runtime: reads .planning/config.json, falls back to command detection
read_runtime() {
  local config="${CLAUDE_PROJECT_DIR:-.}/.planning/config.json"

  # Try reading from config.json
  if [ -f "$config" ]; then
    local rt=""
    set +e
    if command -v bun &>/dev/null; then
      rt=$(HOOK_CFG="$config" bun -e "
        try {
          const cfg = JSON.parse(await Bun.file(process.env.HOOK_CFG).text());
          process.stdout.write(cfg.runtime || '');
        } catch { /* empty */ }
      " 2>/dev/null)
    elif command -v node &>/dev/null; then
      rt=$(HOOK_CFG="$config" node -e "
        try {
          const fs = require('fs');
          const cfg = JSON.parse(fs.readFileSync(process.env.HOOK_CFG, 'utf-8'));
          process.stdout.write(cfg.runtime || '');
        } catch { /* empty */ }
      " 2>/dev/null)
    fi
    set -e

    if [ -n "$rt" ]; then
      echo "$rt"
      return
    fi
  fi

  # Fallback: detect from PATH
  if command -v bun &>/dev/null; then
    echo "bun"
  elif command -v node &>/dev/null; then
    echo "node"
  else
    echo "bun"
  fi
}

RUNTIME=$(read_runtime)

if [ "$RUNTIME" = "bun" ]; then
  TSC_CMD="bunx --bun tsc --noEmit"
else
  TSC_CMD="npx tsc --noEmit"
fi

# Run type-checker (project-wide, since types are interconnected)
set +e
TSC_OUTPUT=$(cd "$PROJECT_DIR" && $TSC_CMD 2>&1)
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
