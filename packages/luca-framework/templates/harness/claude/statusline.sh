#!/bin/sh
# Resolve the hook script path: absolute (global) or relative (monorepo)
if [ -n "$LUCA_PACKAGE_ROOT" ]; then
  SCRIPT="$LUCA_PACKAGE_ROOT/src/hooks/scripts/statusline.ts"
else
  SCRIPT="$(dirname "$0")/../src/hooks/scripts/statusline.ts"
fi
exec bun "$SCRIPT" "$@" <&0
