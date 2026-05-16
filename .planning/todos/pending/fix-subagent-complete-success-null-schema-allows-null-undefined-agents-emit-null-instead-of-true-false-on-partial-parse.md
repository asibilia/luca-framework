---
title: "fix subagent.complete success:null — schema allows null/undefined, agents emit null instead of true/false on partial parse"
area: telemetry
created: 2026-05-16
priority: medium
source: telemetry-analysis
---

## Task

fix subagent.complete success:null — schema allows null/undefined, agents emit null instead of true/false on partial parse

## Problem

Run 2 `run_mp7dcrpm_ue0yzcb0` shows `success: null` on plan-reviewer records:
- `plan-reviewer-1747344600000`: `inputTokens: null, outputTokens: null, success: null, model: null, outcome: "completed"`

The `outcome` is `"completed"` but `success` is null — semantically contradictory. The aggregator can't determine if the subagent succeeded without falling back to `outcome` parsing.

## Root cause

`recordSubagentAction` schema: `success: z.boolean().nullable().optional()`. Agents emit `success: null` when usage comment parse fails partially, instead of defaulting to `true` (since `outcome: "completed"`).

## Fix options

**Option A**: Tighten schema — `success: z.boolean().optional()` (no nullable). Force agents to emit `true`/`false` or omit. Then orchestrator can derive from `outcome` field.

**Option B**: Prose-only — instruct: "if `outcome: completed`, set `success: true`. If `outcome` in `{crashed, killed, timeout, completed_partial_parse}`, set `success: false`. Never emit `null`."

**Option C**: Orchestrator derives `success` from `outcome` deterministically and ignores the agent-supplied value.

## Recommended

Option C — `success` is redundant with `outcome` and creates a consistency burden. Either remove `success` from schema or derive it server-side.

## Acceptance criteria

1. Pick one of A/B/C.
2. Update schema + prose accordingly.
3. Add test: subagent.complete records with `outcome: completed` must have `success !== null`.
4. Aggregator skill: derive `success` from `outcome` for stats, not from raw field.

## Related

Overlaps with todo #30 (`record-subagent failure-mode disambiguation`). May be folded together — both touch the success/outcome semantics.
