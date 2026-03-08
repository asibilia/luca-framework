#!/usr/bin/env bash
# _lib/common.sh -- Shared functions for Luca hook scripts
#
# Sourced by all hook scripts via:
#   HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${HOOK_SCRIPT_DIR}/_lib/common.sh"
#
# Provides:
#   run_bridge()       — Cascading bridge lookup (installed bin -> monorepo source -> skip)
#   read_runtime()     — Runtime detection from .planning/config.json with command fallback
#   read_session_id()  — Extract session_id from state.json (safe, no shell interpolation)

# ─── run_bridge() ────────────────────────────────────────────────────────────
# Cascading bridge lookup: installed bin -> monorepo source -> skip.
# Used by hooks that need to emit events or sync state via the bridge CLI.
#
# Usage:
#   run_bridge snapshot
#   run_bridge emit-event --type=session.start --session="$SID"
# ──────────────────────────────────────────────────────────────────────────────
run_bridge() {
  if command -v luca-bridge &>/dev/null; then
    luca-bridge "$@"
  elif [ -f "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" ]; then
    bun run "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" "$@"
  fi
}

# ─── read_runtime() ─────────────────────────────────────────────────────────
# Detect runtime from .planning/config.json "runtime" field, with command
# fallback. Returns "bun" or "node".
#
# Usage:
#   RUNTIME=$(read_runtime)
# ──────────────────────────────────────────────────────────────────────────────
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

# ─── read_session_id() ──────────────────────────────────────────────────────
# Extract session_id from .planning/state.json using process.env for the
# project directory path. This avoids shell injection via $PROJECT_DIR
# inside bun -e JavaScript strings.
#
# Usage:
#   SESSION_ID=$(read_session_id)
# ──────────────────────────────────────────────────────────────────────────────
read_session_id() {
  local project_dir="${CLAUDE_PROJECT_DIR:-.}"
  local state_file="$project_dir/.planning/state.json"

  if [ ! -f "$state_file" ]; then
    echo ""
    return
  fi

  HOOK_STATE_FILE="$state_file" bun -e "
    try {
      const s = JSON.parse(await Bun.file(process.env.HOOK_STATE_FILE).text());
      process.stdout.write(s.context?.session_id || '');
    } catch { process.stdout.write(''); }
  " 2>/dev/null || echo ""
}
