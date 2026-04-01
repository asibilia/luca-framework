#!/usr/bin/env bash
# session-persist.sh — Save session state on exit
#
# Hook event: SessionEnd
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# NOTE: WORKING.md write logic removed in v9.2.0.
# Session context is now persisted via MuninnDB (muninn_remember / muninn_recall)
# rather than local .planning/WORKING.md files. This hook is kept as a no-op
# placeholder so the hook registration in settings.json remains valid.
#
# If you need session-end logic, add it below.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON (required by hook protocol)
INPUT=$(cat)

# No-op: session state is persisted via MuninnDB, not WORKING.md.
exit 0
