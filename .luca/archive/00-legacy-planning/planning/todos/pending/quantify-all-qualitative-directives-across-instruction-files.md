---
title: "Replace all qualitative directives with quantified constraints across instruction files"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 2
---

## Task

Replace every qualitative directive ("be concise", "be thorough", "don't over-research", "don't nitpick") with specific quantified constraints (word counts, item limits, tool call budgets) across all mode instruction files.

## Context

Research shows quantified constraints are the most enforceable instruction type. Claude Code's A/B testing found ~1.2% output token reduction with quantified limits vs qualitative "be concise." The phrasing hierarchy from most to least enforceable: quantified limits > hard constraints (NEVER) > bidirectional (Use X, NOT Y) > conditional > soft > principles.

Currently, multiple instruction files use qualitative directives that have inconsistent enforcement.

## Research References

- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — Section 8: Quantified constraints in production, phrasing hierarchy
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 3: "Quantified Constraints Beat Qualitative Directives"
- [05-attention-curves-and-structure.md](../../docs/research/prompt-architecture/05-attention-curves-and-structure.md) — Formatting strategies ranked by effectiveness
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 2, item 2.1

## Implementation

Replace these directives across all instruction files:

| File | Current (qualitative) | Proposed (quantified) |
|------|----------------------|----------------------|
| `fast.md` line 6 | "Under 200 words" | "Under 100 words. <=25 words between tool calls." |
| `triage.md` line 194 | "Be concise in your output" | "<=75 words. Classification + 1-sentence rationale + next mode." |
| `architect.md` line 302 | "Be thorough but not verbose" | "<=3 sentences per task. <=150 lines total PLAN.md." |
| `execute.md` line 383 | "Fail fast, fix fast" | "Run checks within 1 tool call of wave completion. Stalled 2+ iterations = stop immediately." |
| `research.md` line 193 | "Don't over-research" | "MODERATE: <=10 tool calls. COMPLEX: <=20. CRITICAL: <=30." |
| `research.md` line 195 | "Time-box" | "Synthesis <=200 lines for RESEARCH.md." |
| `review.md` line 268 | "Don't nitpick" | "Maximum 5 MUST-FIX items. MUST-FIX = correctness bugs, security, missing requirements ONLY." |
| `discuss.md` line 34 | "Keep responses focused" | "Under 300 words per turn. <=2 clarifying questions per response." |
| `finalize.md` line 304 | "Be thorough in gap detection" | "Check every task in PLAN.md. Report exact completed/total ratio." |

## Files Changed

- `packages/luca-mastracode/src/instructions/fast.md`
- `packages/luca-mastracode/src/instructions/triage.md`
- `packages/luca-mastracode/src/instructions/architect.md`
- `packages/luca-mastracode/src/instructions/execute.md`
- `packages/luca-mastracode/src/instructions/research.md`
- `packages/luca-mastracode/src/instructions/review.md`
- `packages/luca-mastracode/src/instructions/discuss.md`
- `packages/luca-mastracode/src/instructions/finalize.md`

## Constraints

- Do NOT change the behavioral intent, only make it measurable
- Quantified limits should be realistic — validate against actual outputs from recent pipeline runs if available
