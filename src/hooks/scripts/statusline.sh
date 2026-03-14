#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/statusline.ts" "$@" <&0
