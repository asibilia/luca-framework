---
title: "fix usage-comment field-completeness drift — model:null and tokens:0 epidemic in Run 2 (run_mp7dcrpm_ue0yzcb0)"
area: telemetry
created: 2026-05-16
priority: high
source: telemetry-analysis
---

## Task

fix usage-comment field-completeness drift — model:null and tokens:0 epidemic in Run 2 (run_mp7dcrpm_ue0yzcb0)

## Problem

Telemetry from `run_mp7dcrpm_ue0yzcb0` shows widespread `model: null` and `inputTokens: 0`/`outputTokens: 0` across executor / verifier / learner / reviewer-arch — even when the subagent succeeded with real work. Compare to `run_mp77zzvl_6z0n3mb3` (same day) which had clean `model` + token data across all subagents.

### Affected records in Run 2

- `executor-1747344900000`: `inputTokens: 29419, outputTokens: 4205, success: true, model: null`
- `verifier-1747346200000`: `inputTokens: 0, outputTokens: 0` (real run)
- `learner-1747346500000`: `inputTokens: 0, outputTokens: 0`
- `reviewer-arch-1747347100000`: `inputTokens: 0, outputTokens: 0`
- All wave-4 reviewers (4 records): real tokens but `model: null`

## Root cause hypothesis

Mode prose drift — some mode files instruct agents to emit `<!-- usage: { ... } -->` with partial/missing fields rather than omit the comment entirely when a field is unknown. The orchestrator parses partial JSON and writes `model: null` / `tokens: 0` instead of leaving fields nullable.

This is a worse regression than the original `fix-role-success-true-with-null-model-field-partial-usage-parse` todo (#16, already closed) because it now affects executor / verifier / learner / reviewer-arch, not just `fix`.

## Acceptance criteria

1. Audit all mode files for `<!-- usage: ... -->` example completeness. Every example must include `model`, `inputTokens`, `outputTokens` — or be explicit about omitting the entire comment when unknown.
2. Update `record-subagent` prose: "if you don't know `model`, omit the entire usage comment, do not emit `model: null`."
3. Emit `null` (not `0`) for unknown token counts. Add prose: "Use `null` for unknown, never `0`. `0` means literally zero tokens."
4. Add regression test that scans all mode files for `<!-- usage:` examples and validates each has all 3 fields populated with non-null/non-zero examples.

## Out of scope

Computing durationMs orchestrator-side (separate todo #11). Fixing correlationId unit drift (separate todo, filed below).
