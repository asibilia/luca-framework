#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/snapshot-sync.ts" "$@" <&0
