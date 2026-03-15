#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/post-tool-use-failure.ts" "$@" <&0
