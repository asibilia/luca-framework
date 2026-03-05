---
title: "P1: Add debug logging for SpacetimeDB fallback behavior"
area: dx
created: 2026-03-04
source: repo-review audit (dx-reviewer)
priority: P1
---

## Context

The bridge CLI has 6+ empty catch blocks for SpacetimeDB read failures. When SpacetimeDB is down, reads silently fall back to local JSON files with no indication. Operators cannot distinguish "SpacetimeDB is down" from "no state initialized."

## Task

1. Add `LUCA_BRIDGE_DEBUG=true` env var support
2. When enabled, log to stderr: `[bridge] SpacetimeDB unavailable, falling back to JSON`
3. Apply to all catch blocks in bridge.ts (lines 99, 162, 207, 259, 361, 430)
4. Consider adding `"source": "spacetimedb" | "fallback"` metadata to bridge read outputs
5. Document the debug flag in state-bridge-api docs

## Notes

- Quick win — 1-2 hours of work
- Critical for deployment debugging
- Related to todo #31 (silent reducer failures on write path)
