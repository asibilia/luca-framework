---
title: "Harness Tool Middleware for Verification"
area: framework/harness
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: COMPLEX
moat: N/A
---

## Context

Nader's "tool factory pattern with middleware" applied to Luca's verification checks. Currently harness checks run raw commands with no middleware pipeline.

## Task

CheckMiddleware pipeline that wraps harness check execution. Ordered middleware functions modify command, add env vars, restrict working directory, capture metadata, post-process results.

Default middleware stack:

1. workspace-scoping (restrict changed-file paths)
2. output-capture (save raw output to .planning/harness-runs/)
3. timing (per-check high-resolution timestamps)

Configured in harness section of config.json as ordered array.

**Implementation:**

- Add CheckMiddlewareSchema to `src/harness/__schemas/harness.schemas.ts`
- Wrap execution with middleware pipeline in `src/harness/__helpers/runner.ts`
- New directory: `src/harness/middleware/` — workspace-scope.ts, output-capture.ts, timing.ts

## Notes

- Source agent: Architecture Expert
