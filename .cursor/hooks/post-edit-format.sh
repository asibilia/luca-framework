#!/usr/bin/env bash
# post-edit-format.sh — Auto-format files after Edit/Write operations
#
# Hook event: PostToolUse (matcher: Edit|Write)
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# Reads the edited file path from stdin JSON (tool_input.file_path),
# determines the appropriate formatter based on file extension, and
# runs it in-place. Non-blocking: exits 0 regardless of formatter outcome.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract file path using bun -e (no jq dependency)
# Claude Code: tool_input.file_path, Cursor: file_path (top-level)
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const filePath = data.tool_input?.file_path ?? data.file_path;
  if (filePath) process.stdout.write(filePath);
")

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

# Map extensions to formatter commands
# Only format extensions where auto-formatting adds value
case ".$EXT" in
  .ts|.tsx|.js|.jsx|.mjs|.cjs)
    # TypeScript/JavaScript — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .json)
    # JSON — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .css|.scss|.less)
    # Stylesheets — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .html|.htm)
    # HTML — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .md|.mdx)
    # Markdown — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .yaml|.yml)
    # YAML — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  *)
    # Unknown extension — skip formatting
    ;;
esac

# Always exit 0 — formatting is non-blocking feedback
exit 0
