---
title: "Verification Parity Matrix Across Targets"
area: framework/compilers
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: MODERATE
moat: Medium
---

## Context

No cross-harness parity testing exists. Agents compiled to Claude format could differ from Pi format in tool sets, section titles, or model routing metadata. Documented weakness in framework review.

## Task

Compile each entity to all 4 formats, then run structural assertions:

1. All agents in all formats reference same tool set
2. All skills contain same section titles
3. All rules contain same rule content body
4. Model routing metadata in Pi format matches Claude format

Run as part of `bun run build:all`. Fail loudly on parity violations.

**Implementation:**

- New: `src/compilers/__helpers/parity-checker.ts`
- Parity result schema in `src/compilers/__schemas/compilers.schemas.ts`
- Add parity check type to `src/harness/__schemas/harness.schemas.ts`
- Run parity check after compilation in `scripts/build-all.ts`

## Notes

- Source agent: Competitive Edge Expert
