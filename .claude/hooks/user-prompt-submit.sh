#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/user-prompt-submit.ts" "$@" <&0
