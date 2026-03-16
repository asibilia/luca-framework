#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/session-persist.ts" "$@" <&0
