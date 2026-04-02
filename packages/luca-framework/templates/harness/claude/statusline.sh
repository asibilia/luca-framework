#!/bin/sh
# Resolve the hook script path: absolute (global) or relative (monorepo)
if [ -n "$LUCA_PACKAGE_ROOT" ]; then
  SCRIPT="$LUCA_PACKAGE_ROOT/src/hooks/scripts/statusline.ts"
else
  # Prefer bundled version (npm installs where src/ is absent),
  # fall back to TypeScript source (monorepo dev)
  BUNDLE="$(dirname "$0")/../../dist/statusline.bundle.js"
  SOURCE="$(dirname "$0")/../../src/hooks/scripts/statusline.ts"
  if [ -f "$BUNDLE" ]; then
    SCRIPT="$BUNDLE"
  else
    SCRIPT="$SOURCE"
  fi
fi
exec bun "$SCRIPT" "$@" <&0
