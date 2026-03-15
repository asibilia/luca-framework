#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/session-start.ts" "$@" <&0
