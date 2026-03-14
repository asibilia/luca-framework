#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/post-tool-use-failure.ts" "$@" <&0
