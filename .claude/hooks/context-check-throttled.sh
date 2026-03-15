#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/context-check-throttled.ts" "$@" <&0
