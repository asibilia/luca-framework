#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/session-compact-restore.ts" "$@" <&0
