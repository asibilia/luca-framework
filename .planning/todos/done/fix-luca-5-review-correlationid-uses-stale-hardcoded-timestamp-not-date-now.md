---
title: "fix-luca-5-review-correlationid-uses-stale-hardcoded-timestamp-not-date-now"
area: pipeline
created: 2026-05-13
priority: medium
source: telemetry
---

## Task

fix-luca-5-review-correlationid-uses-stale-hardcoded-timestamp-not-date-now

## Problem

In `luca:5-review` mode, reviewer subagent correlationIds use a stale hardcoded timestamp from before the run even started — not a `Date.now()` value at invoke time.

## Evidence

Run `run_mp4kxfei_qo4q0o4g` (started 21:36:47Z):

```
Inside execute wave 3:  reviewer-arch-1747185300  → unix 1747185300 = 21:55Z  ✓ (current)
Inside luca:5-review:   reviewer-arch-1747180880  → unix 1747180880 = 20:41Z  ✗ (74 min EARLIER than run start)
```

The luca:5-review correlationIds aren't being generated at invocation time. They're either:
- Hardcoded literal in `review.md` prose
- Copy-pasted tracer-bullet that was never templated
- Reused from a stale template instance

## Fix

Audit `review.md` for the literal `1747180880` (or whichever stale timestamp is baked in) and replace the spawn prose with the same `<role>-<unix-ms>` pattern used in `execute.md`:

```
correlationId: "<role>-${Date.now()}"
```

Should use the format established in `SUBAGENT_SHARED_PREFIX` and confirmed working in `execute.md` wave-review fanout.

## Related

- `fix-luca-5-review-mode-all-reviewers-success-false-synthesis-runs-with-zero-input` — same `review.md` file likely has multiple staleness issues. Fix together.

## Acceptance

- Outer reviewer correlationIds match `<role>-<unix-ms-at-invoke>` pattern
- Timestamp falls between mode.start and mode.end of `luca:5-review`
- Regression test in `subagent-telemetry-prose.test.ts` asserts no literal unix timestamps in `review.md`
