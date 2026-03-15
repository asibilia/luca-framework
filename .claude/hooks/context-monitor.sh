#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/context-monitor.ts" "$@" <&0
