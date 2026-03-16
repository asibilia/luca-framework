#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/pre-commit-gate.ts" "$@" <&0
