---
title: "v2 Open Questions — 6 unresolved design decisions"
area: design
created: 2026-03-23
source: docs/workflow-system/v2/08-open-questions/README.md
---

## Context

The v2 research identified 16 design questions. 10 are resolved via CANONICAL-DECISIONS.md. 6 remain open and need decisions before or during implementation.

## Open Questions

### Q5: Research files vs MuninnDB — when to read which?

- **Recommendation**: Phase-dependent with fallback chain
- Steps 5-6 (review/graduate): read files directly
- Steps 7-8 (plan/plan-review): read files + recall engrams
- Steps 9-10 (execute/verify): recall engrams only (files archived)

### Q6: Cross-phase research reuse

- **Recommendation**: Recall with staleness warning
- When a later phase covers similar ground, recall prior `research:*` engrams
- Add staleness annotation for engrams > N days old

### Q8: Reviewer freshness across iterations

- **Recommendation**: Same agent with delta + prior summary
- In review loop iteration 2+, give reviewers the delta (new/changed files) + a summary of prior iteration findings
- Don't re-spawn fully fresh reviewers each iteration (wasteful)

### Q9: Review scope on re-expansion

- **Recommendation**: Delta review with integration check
- After deep expand fills a gap, reviewers re-review only the new/changed files
- But also do a lightweight integration check (do new files contradict existing ones?)

### Q11: User experience during research

- **Recommendation**: Respect existing oversight levels
- Research steps should use the same progress reporting as existing steps
- At AUTONOMOUS oversight: run silently
- At SUPERVISED: show brief progress summaries

### Q15-Q16: Synthesizer isolation + researcher error handling

- **NEW questions** from R2 review round
- Q15: lu-research-synthesizer isolation level and error propagation
- Q16: What happens when a researcher agent fails (timeout, crash, bad output)?

## Task

Decide on each before implementation reaches the relevant phase. Q5/Q6 needed by Phase 3. Q8/Q9 needed by Phase 2. Q11 by Phase 6. Q15/Q16 by Phase 1.

## Notes

- These are design decisions, not code tasks — discuss and record in CANONICAL-DECISIONS.md
- Some have strong recommendations already; others need further discussion
