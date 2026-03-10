#!/usr/bin/env bash
# post-edit-typecheck.sh — Async type-check after TypeScript file edits
#
# Canonical event: post_tool_use (tool_filter: Edit|Write)
# Platform events: Claude=PostToolUse, Cursor=afterFileEdit, Pi=tool_execution_end
# Type: Command hook (async: true)
# Timeout: 30 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "tool_input": { "file_path": "/path/to/file.ts" } }
# Cursor:      { "file_path": "/path/to/file.ts" }
# Pi:          { "tool_input": { "file_path": "/path/to/file.ts" } }
#
# Extraction: data.tool_input?.file_path ?? data.file_path
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On type errors (async delivery):
#   { "systemMessage": "TypeScript type errors found after editing ..." }
# On success: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = success (always exits 0, type-check is async feedback)
# ──────────────────────────────────────────────────────────────────────
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

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "post-edit-typecheck"

# Read stdin JSON (may be empty for some platforms)
INPUT=$(cat || true)

# Handle empty or malformed stdin gracefully
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract file path using bun -e
# Claude Code: tool_input.file_path, Cursor: file_path (top-level)
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const filePath = data.tool_input?.file_path ?? data.file_path;
    if (filePath) process.stdout.write(filePath);
  } catch { /* malformed JSON — skip type-check */ }
" 2>/dev/null || true)

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

RUNTIME=$(read_runtime)

if [ "$RUNTIME" = "bun" ]; then
  TSC_CMD=(bunx --bun tsc --noEmit)
else
  TSC_CMD=(npx tsc --noEmit)
fi

# Run type-checker (project-wide, since types are interconnected)
set +e
TSC_OUTPUT=$(cd "$PROJECT_DIR" && "${TSC_CMD[@]}" 2>&1)
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
  printf '%s' "$TRUNCATED" | HOOK_FILE_PATH="$FILE_PATH" bun -e "
    const errors = await Bun.stdin.text();
    const filePath = process.env.HOOK_FILE_PATH;
    const msg = {
      systemMessage: 'TypeScript type errors found after editing ' + filePath + ':\n' + errors.trim()
    };
    process.stdout.write(JSON.stringify(msg));
  "
fi

exit 0
