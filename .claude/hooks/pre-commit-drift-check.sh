#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/pre-commit-drift-check.ts" "$@" <&0
