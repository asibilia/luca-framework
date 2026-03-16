#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/muninn-context-recall.ts" "$@" <&0
