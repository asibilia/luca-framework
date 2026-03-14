#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/post-edit-typecheck.ts" "$@" <&0
