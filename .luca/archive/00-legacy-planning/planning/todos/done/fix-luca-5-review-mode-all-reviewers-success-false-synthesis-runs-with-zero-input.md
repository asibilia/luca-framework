---
title: "fix-luca-5-review-mode-all-reviewers-success-false-synthesis-runs-with-zero-input"
area: pipeline
created: 2026-05-13
priority: critical
source: telemetry
---

## Task

fix-luca-5-review-mode-all-reviewers-success-false-synthesis-runs-with-zero-input

## Problem

In `luca:5-review` mode, all 4 reviewer subagents (arch/dx/sec/simpl) are returning `success: false` with null tokens, null model, and `durationMs: 0`. Synthesis still proceeds and the pipeline transitions to finalize — meaning the review verdict is being produced from **zero successful reviewer outputs**. This is a correctness hazard, not just telemetry.

## Evidence

**Run `run_mp4kxfei_qo4q0o4g` (2026-05-13)** — all 4 outer reviewers failed:

```
reviewer-arch:   success:false / null / null / durationMs:0
reviewer-dx:     success:false / null / null / durationMs:0
reviewer-sec:    success:false / null / null / durationMs:0
reviewer-simpl:  success:false / null / null / durationMs:0
```

**Run `run_mp4d1bp3_drsex3c4` (2026-05-13, prior)** — only `reviewer-sec` failed. Pattern is reproducible and getting worse.

## Critical contrast

Same `reviewer` role, same instruction file, same harness — but inner (wave-3) reviewers work fine:

```
Inner (execute wave 3): all 4 success:true, tokens populated, model:sonnet-4-5
Outer (luca:5-review):  all 4 success:false, everything null, durationMs:0
```

The difference must be in **how `review.md` invokes the subagents** vs how the inner execute-mode review loop invokes them. The harness is rejecting the outer specs immediately (durationMs:0).

## Likely root causes

1. `review.md` subagent spawn prose uses stale/malformed spec format
2. Hardcoded correlationIds in `review.md` (see related todo on timestamp drift) suggest copy-pasted block that may have other staleness
3. Possibly: missing required field in subagent invocation, or invalid tool allowlist for outer review path

## Investigation steps

1. Diff `review.md` subagent spawn prose vs `execute.md` wave-review spawn prose
2. Check `review.md` for hardcoded values that should be dynamic
3. Run with verbose harness logging to see why subagents are rejected
4. Check if `luca:5-review` tool allowlist includes everything reviewer subagents need

## Acceptance

- 4 outer reviewers return `success: true` with populated tokens/model
- Synthesis input includes ≥1 successful reviewer output (ideally all 4)
- Regression test: telemetry assertion that `luca:5-review` mode emits ≥1 `subagent.complete` with `success: true` per reviewer role

## Priority justification

Blocks slim-down work — the planned `luca:5-review` → `luca:3-verify` rename would mask this bug. Must fix before pipeline restructure.
