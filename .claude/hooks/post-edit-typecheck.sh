#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/post-edit-typecheck.ts" "$@" <&0
