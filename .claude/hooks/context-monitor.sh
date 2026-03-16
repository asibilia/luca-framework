#!/bin/sh
# Resolve the hook script path: absolute (global) or relative (monorepo)
if [ -n "$LUCA_PACKAGE_ROOT" ]; then
  SCRIPT="$LUCA_PACKAGE_ROOT/src/hooks/scripts/context-monitor.ts"
else
  SCRIPT="$(dirname "$0")/../../src/hooks/scripts/context-monitor.ts"
fi
exec bun "$SCRIPT" "$@" <&0
