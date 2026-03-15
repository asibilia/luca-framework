#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/post-edit-format.ts" "$@" <&0
