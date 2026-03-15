#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/subagent-stop.ts" "$@" <&0
