---
title: "Real Token Accounting via Tokenizer"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 1
complexity: MODERATE
moat: Medium
---

## Context

Current token estimation uses `CHARS_PER_TOKEN = 4` heuristic in token-estimator.ts. Every downstream system (cost model, quality zones, compression triggers, WSJF scheduler) operates on guesses.

## Task

Replace heuristic with real tokenizer. Fix every downstream budget calculation.

**Implementation:**

- Replace heuristic in `src/memory/__helpers/token-estimator.ts` with real tokenizer
- Update `src/memory/__helpers/context-monitor.ts` to use real counts
- Recalibrate `src/planner/__helpers/cost-model.ts`
- New: `src/shared/__helpers/token-counter.ts` — real tokenizer wrapper
- Add tokenizer dependency (@anthropic-ai/tokenizer or tiktoken) to package.json

## Notes

- No competitor has cost awareness — Claude Code has no token tracking, Pi has no budget system
- Source agent: Competitive Edge Expert
