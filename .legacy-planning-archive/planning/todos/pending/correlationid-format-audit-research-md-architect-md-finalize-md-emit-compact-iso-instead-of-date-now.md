---
title: "correlationId format audit — research.md / architect.md / finalize.md emit compact-ISO instead of Date.now()"
area: telemetry
created: 2026-05-14
priority: high
source: run-mp5jq8br-analysis
---

## Task

correlationId format audit — research.md / architect.md / finalize.md emit compact-ISO instead of Date.now()

---
confidence: high
externalResearch: false
priority: 2
---

## Problem

Run `run_mp5jq8br_o2oafvs8` (2026-05-14) emitted correlationIds in compact-ISO format (`YYYYMMDDhhmmss`, e.g. `researcher-scope-20260514135050`) instead of unix-ms `Date.now()` format (e.g. `reviewer-arch-1747185300123`).

The PR #247 fix for `review.md` (Step 4 directive uses `const ts = Date.now()` + `${ts}` template literals) is **shipping and working** — the post-PR regression test `review.md Step 4 correlationId directive uses ${ts} template, not <ts> placeholder or literal epoch` in `subagent-telemetry-prose.test.ts` guards it.

But the same regression test does NOT exist for the other instruction files that spawn subagents:
- `research.md` — spawns 5 researcher subagents (scope/arch/patterns/deps/risk)
- `architect.md` — spawns discussion + plan-reviewer (sequential)
- `finalize.md` — spawns learner + shadow-scanner
- `execute.md` — spawns executor + fix + reviewer (inner-loop review batch)

Agents reading those files are interpreting an unknown placeholder (likely `<ts>` or `<timestamp>` or `<ISO>`) as "format the current time in compact-ISO" rather than calling `Date.now()`.

## Impact

- correlationId format drift across the telemetry corpus — aggregator skills can't assume a single shape
- Future regression of any of these prose blocks would be silently undetectable (no test guards the spawn directive)
- invoke↔complete pairing still works because both records use the same string per spawn — but **cross-run analysis** that infers ordering from numeric timestamp comparison breaks

## Acceptance Criteria

1. Audit ALL spawn-site directives in `research.md`, `architect.md`, `finalize.md`, `execute.md`. Each must use:
   - `const ts = Date.now()` capture
   - `${ts}` template-literal interpolation in correlationId
2. Add regression tests in `subagent-telemetry-prose.test.ts` mirroring the existing `review.md` Step 4 test:
   - Scope assertion to the relevant section/heading
   - Assert `const ts = Date.now()` present
   - Assert canonical `<role>-<id>-${ts}` template appears
   - Negative-assert `<ts>` placeholder and 10+ digit hardcoded epoch absent
   - Strip `e.g. "..."` example clauses before negative scan
3. Run the negative-case verification: temporarily replace `${ts}` with `<ts>` in each file, confirm corresponding test fails.

## Notes

- Compact-ISO format observed in run `run_mp5jq8br_o2oafvs8` was harmless this run (no functional bug) — pure format drift.
- Related: `fix-record-subagent-fix-role-success-true-with-null-model-field-partial-usage-parse` (separate todo) covers downstream parse robustness for the same `record-subagent` records.
- Reference test: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts` (the `review.md Step 4 correlationId directive uses ${ts} template` test added in PR #247 commit `0f0a609ea`).

