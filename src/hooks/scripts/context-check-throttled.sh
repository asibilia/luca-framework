#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/context-check-throttled.ts" "$@" <&0
