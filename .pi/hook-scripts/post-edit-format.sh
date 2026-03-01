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
# Runtime detection: Reads .planning/config.json for "runtime" field,
# falls back to command -v detection. Uses bunx or npx for formatter accordingly.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

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

# Select formatter command based on runtime
if [ "$RUNTIME" = "bun" ]; then
  FORMATTER_CMD="bunx --bun prettier --write"
else
  FORMATTER_CMD="npx prettier --write"
fi

# Map extensions to formatter commands
# Only format extensions where auto-formatting adds value
case ".$EXT" in
  .ts|.tsx|.js|.jsx|.mjs|.cjs)
    # TypeScript/JavaScript — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  .json)
    # JSON — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  .css|.scss|.less)
    # Stylesheets — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  .html|.htm)
    # HTML — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  .md|.mdx)
    # Markdown — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  .yaml|.yml)
    # YAML — use Prettier
    $FORMATTER_CMD "$FILE_PATH" 2>/dev/null || true
    ;;
  *)
    # Unknown extension — skip formatting
    ;;
esac

# Always exit 0 — formatting is non-blocking feedback
exit 0
