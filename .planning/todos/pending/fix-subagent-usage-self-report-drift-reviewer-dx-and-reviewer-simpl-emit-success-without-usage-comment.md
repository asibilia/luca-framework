---
title: "Fix subagent usage self-report drift — reviewer-dx and reviewer-simpl emit success without `<!-- usage: ... -->` comment"
area: telemetry
created: 2026-05-13
priority: high
source: run-analysis
---

## Task

Fix subagent usage self-report drift — reviewer-dx and reviewer-simpl emit success without `<!-- usage: ... -->` comment

## Symptom

Observed in run `run_mp4auyvh_13axajuq` (COMPLEX, full-auto):
- Review pass 1 spawned 4 parallel reviewers (architecture, security, dx, simplification)
- `reviewer-arch` (opus-4-5) reported `inputTokens: 89421, outputTokens: 3182`
- `reviewer-sec` (sonnet-4-5) reported `inputTokens: 47823, outputTokens: 4387`
- `reviewer-dx` (sonnet-4-5) reported `inputTokens: null, outputTokens: null` ❌
- `reviewer-simpl` (sonnet-4-5) reported `inputTokens: null, outputTokens: null` ❌

All 4 returned `success: true` — so they completed work, just didn't emit the `<!-- usage: {"inputTokens":N,"outputTokens":N,"model":"<id>"} -->` self-report comment that PR #243 instructed all subagents to emit.

## Hypothesis

Either:
1. `reviewer.md` (or whichever instruction file feeds these specific perspectives) missed the usage self-report prose update from PR #243
2. The 4 reviewer perspectives share one instruction file, but only 2 of 4 perspectives are correctly extracting the usage from their context
3. Sonnet-4-5 specifically is less reliable at emitting the trailing comment vs opus-4-5 (note: reviewer-sec is also sonnet-4-5 and DID emit — so this is probably not the cause)

## Acceptance criteria

- [ ] Identify which instruction file(s) feed `reviewer-dx` and `reviewer-simpl`
- [ ] Verify the usage self-report block is present in those files
- [ ] If present but agents ignore it, strengthen the prose (e.g. promote to RECENCY_REMINDERS, add to closing instructions)
- [ ] Add a presence test in `subagent-telemetry-prose.test.ts` that asserts the usage self-report block is in every file that spawns subagents reporting telemetry
- [ ] Verify on next COMPLEX run that all 4 review perspectives report non-null tokens

## Files to check

- `src/instructions/review.md` (orchestrator that spawns reviewers)
- `src/subagents/reviewer.ts` or `src/subagents/*-reviewer*.ts` (subagent instruction definitions)
- `src/subagents/shared-prefix.ts` (already has the Token Usage section per PR #243)

## Related

- PR #243 (#350 telemetry-subagent-invocation-token-cost-logging) — introduced the self-report convention
- Run `run_mp4auyvh_13axajuq` — first observation of the gap
