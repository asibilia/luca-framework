#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/pre-commit-drift-check.ts" "$@" <&0
