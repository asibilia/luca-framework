#!/usr/bin/env bash
# pre-commit-drift-check.sh — Block commits when output files drift from source
#
# Canonical event: pre_tool_use (tool_filter: Bash)
# Platform events: Claude=PreToolUse, Cursor=beforeShellExecution, Pi=tool_call
# Type: Command hook (synchronous)
# Timeout: 60 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "tool_input": { "command": "git commit -m 'msg'" } }
# Cursor:      { "command": "git commit -m 'msg'" }
# Pi:          { "tool_input": { "command": "git commit -m 'msg'" } }
#
# Extraction: data.tool_input?.command ?? data.command ?? ''
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On block (drift detected):
#   Claude: { "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "..." } }
#   Cursor: { "permission": "deny", "user_message": "..." }
# On allow: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = allow (command proceeds)
# 2 = block (commit denied)
# ──────────────────────────────────────────────────────────────────────
#
# Intercepts all Bash tool calls. For non-commit commands, exits 0 immediately
# (near-zero overhead). For commit commands that touch generated output files or
# their source, runs the drift check and blocks if drift is detected.

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Read stdin JSON (may be empty for some platforms)
INPUT=$(cat || true)

# Handle empty or malformed stdin gracefully
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract the Bash command being executed
COMMAND=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const cmd = data.tool_input?.command ?? data.command ?? '';
    process.stdout.write(cmd);
  } catch { process.stdout.write(''); }
" 2>/dev/null || true)

# Fast exit: Not a commit command? Allow immediately.
case "$COMMAND" in
  *"git commit"*|*"git merge"*|*"bun run commit"*|*"bunx commit"*|*"bunx --bun commit"*)
    # Potentially a commit command — continue to drift check
    ;;
  *)
    # Not a commit command — allow immediately
    exit 0
    ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Fast path: Check if any staged files are in relevant directories
STAGED_FILES=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null || echo "")

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Check if any staged files are in output or source directories
HAS_RELEVANT_FILES=0
while IFS= read -r file; do
  case "$file" in
    .claude/*|.cursor/*|.pi/*|.qwen/*|dist/plugin/*|src/agents/*|src/skills/*|src/rules/*|src/hooks/*|src/compilers/*)
      HAS_RELEVANT_FILES=1
      break
      ;;
  esac
done <<< "$STAGED_FILES"

if [ $HAS_RELEVANT_FILES -eq 0 ]; then
  # No relevant files staged — skip drift check
  exit 0
fi

# Run drift check
echo "Checking for output drift..." >&2
set +e
DRIFT_OUTPUT=$(cd "$PROJECT_DIR" && bun run ./scripts/check-drift.ts 2>&1)
DRIFT_EXIT=$?
set -e

if [ $DRIFT_EXIT -ne 0 ]; then
  REASON="Commit blocked: output files have drifted from source.

${DRIFT_OUTPUT}

Fix: Run \`bun run build:all\` to regenerate outputs, then commit again."

  # Output JSON decision to stdout
  printf '%s' "$REASON" | bun -e "
    const reason = await Bun.stdin.text();
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason.trim() } }
      : { permission: 'deny', user_message: reason.trim() };
    process.stdout.write(JSON.stringify(output));
  "

  exit 2
fi

# No drift — allow the commit
exit 0
