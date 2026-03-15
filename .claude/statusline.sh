#!/bin/sh
exec bun "$(dirname "$0")/../src/hooks/scripts/statusline.ts" "$@" <&0
