#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/pre-compact-checkpoint.ts" "$@" <&0
