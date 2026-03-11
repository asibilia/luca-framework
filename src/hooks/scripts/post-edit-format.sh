#!/usr/bin/env bash
# post-edit-format.sh — Auto-format files after Edit/Write operations
#
# Canonical event: post_tool_use (tool_filter: Edit|Write)
# Platform events: Claude=PostToolUse, Cursor=afterFileEdit, Pi=tool_execution_end
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "tool_input": { "file_path": "/path/to/file.ts" } }
# Cursor:      { "file_path": "/path/to/file.ts" }
# Pi:          { "tool_input": { "file_path": "/path/to/file.ts" } }
#
# Extraction: data.tool_input?.file_path ?? data.file_path
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# No stdout output (formatting is silent, non-blocking)
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = success (always exits 0, formatting is non-blocking)
# ──────────────────────────────────────────────────────────────────────
#
# Reads the edited file path from stdin JSON, determines the appropriate
# formatter based on file extension, and runs it in-place.
#
# Runtime detection: Reads .planning/config.json for "runtime" field,
# falls back to command -v detection. Uses bunx or npx for formatter accordingly.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "post-edit-format"

# Read stdin JSON (may be empty for some platforms)
INPUT=$(cat || true)

# Handle empty or malformed stdin gracefully
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract file path using bun -e (no jq dependency)
# Claude Code: tool_input.file_path, Cursor: file_path (top-level)
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const filePath = data.tool_input?.file_path ?? data.file_path;
    if (filePath) process.stdout.write(filePath);
  } catch { /* malformed JSON — skip formatting */ }
" 2>/dev/null || true)

# Exit early if no file path extracted
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Exit early if file doesn't exist (was deleted or is a new path that failed)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Determine file extension
EXT="${FILE_PATH##*.}"

RUNTIME=$(read_runtime)

# Select formatter command based on runtime
if [ "$RUNTIME" = "bun" ]; then
  FORMATTER_CMD=(bunx --bun prettier --write)
else
  FORMATTER_CMD=(npx prettier --write)
fi

# Map extensions to formatter commands
# Only format extensions where auto-formatting adds value
case ".$EXT" in
  .ts|.tsx|.js|.jsx|.mjs|.cjs)
    # TypeScript/JavaScript — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  .json)
    # JSON — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  .css|.scss|.less)
    # Stylesheets — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  .html|.htm)
    # HTML — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  .md|.mdx)
    # Markdown — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  .yaml|.yml)
    # YAML — use Prettier
    "${FORMATTER_CMD[@]}" "$FILE_PATH" 2>/dev/null || true
    ;;
  *)
    # Unknown extension — skip formatting
    ;;
esac

# Always exit 0 — formatting is non-blocking feedback
exit 0
