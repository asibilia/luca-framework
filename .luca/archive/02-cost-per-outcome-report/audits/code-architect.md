# Architecture Review — Phase 2: cost-per-outcome-report

**Verdict: APPROVE** · 0 must-fix · 0 HIGH · 1 LOW (advisory)

Verified evidence:
- `define/skill.ts:6-8,56-61` — BODY is inlined verbatim with NO runtime import surface → the in-prose markdown rate table is the architecturally correct home; "move rates to luca-core" is not reachable without a codegen/CLI bridge that doesn't exist.
- `telemetry/schemas.ts:66-67,85` — `meta` is open `Record<string,unknown>` with advisory-only shapes → reading `meta.role`/`meta.model`/`meta.inputTokens` is consistent with the existing consumer pattern; no typed dependency / module-boundary violation.
- `index.ts:89-90` — cost compute folded into the SINGLE existing Step-3 `subagent.*` accumulator; new Step-4 sections (`:127-144`) reuse `costByRole`/`totalCost` rather than re-tallying → additive placement correct, no duplication.
- `unknown→structure` default is the conservative, well-documented choice (won't overstate executor "productive work").

## LOW finding (carried, non-blocking)
1. **index.ts:110,112 — fallback row value-copies the sonnet rate.** If an operator edits the sonnet row, the fallback row silently drifts and the inline "intentionally mirrors mid-tier" comment goes stale. Doc/maintainability coupling, not a correctness bug (rows read independently). Fix: add a one-line directive telling the operator to mirror sonnet edits into the fallback row.
