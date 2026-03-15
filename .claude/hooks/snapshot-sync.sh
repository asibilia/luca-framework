#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/snapshot-sync.ts" "$@" <&0
