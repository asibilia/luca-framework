# Plan Review Capture — Iteration 1

**Subagent**: plan-reviewer
**Iteration**: 1
**Timestamp**: 2026-05-07T19:08Z

## Status: NEEDS_REVISION (2 BLOCKING, 6 ADVISORY)

## Findings

### G-DX-LEAK-001 [BLOCKING/HIGH]
no-leak regex `framework|mastracode|studio|config|docs|repo` is unanchored — matches `packages/luca-mastracode/package.json` paths, `.changeset/config.json` refs, prose like "fresh clone of the repo", "consult the docs", etc. Will fail across legitimate references. Fix: closed list of luca-specific PATTERNS (literal `framework|mastracode|studio` with pipe), or scope-list patterns `\bScopes?:\s*[a-z|]*\b(framework|mastracode|studio)\b`. AND maintain per-file allowlist for legitimate path refs.

### G-ARCH-SEED-001 [BLOCKING/MEDIUM]
Memory re-seed semantics unclear. `seed` does NOT call MuninnDB — it (a) writes file, (b) sets `preferencesSeeded:true`, (c) returns `muninnInstruction` blob the AGENT must execute via `mcp__muninn__muninn_remember`. `op_id` is `project-preferences:${vault}` (deterministic, not from existing ULID). Relationship to existing memory `01KR1BMR4M1M6MR496C80KC6WS` undocumented. Fix: clarify two-step procedure (seed then execute emitted muninn_remember). Document whether op_id collision upserts, or whether old ULID must be explicitly forgotten.

### G-ARCH-SCOPE-001 [ADVISORY/MEDIUM]
`commits.types` vs `branching.types` semantic overlap. Schema already has `branching.types` for branch naming; plan adds `commits.types` for commit-msg validation. Different conceptually but typically duplicate values. Fix: schema JSDoc clarifying distinction; PLAN.md fallback strategy.

### G-ARCH-DUAL-001 [ADVISORY/MEDIUM]
`pr.titleFormat` vs `pr.titleTemplate` precedence undocumented in schema (only in prose). Fix: JSDoc on `PrSection` declaring titleTemplate preferred when both present; titleFormat is legacy.

### G-DX-TESTCOUNT-001 [ADVISORY/LOW]
Hardcoded "175/175" creates spurious failure mode if count drifts. Fix: "all pre-existing tests still pass; new tests added per Tasks 1.1.1, 1.1.2, 1.1.4 also pass".

### G-DX-WAVE1-FAILS-001 [ADVISORY/LOW]
Wave 1 lands with known-failing test (no-leak fails until Wave 2 lands). Bad for bisection/CI. Fix: either (a) atomic PR for both waves, or (b) start as `test.todo`/`.skip`, flip in final Wave-2 task. Document choice.

### G-ARCH-PLAN-MODE-001 [ADVISORY/LOW]
Graceful-degradation contract asserted but untested for non-registered consumer modes. Fix: add test asserting every stock mode in `MODES` has `projectPreferences` registered with at least `consult-section`.

### G-DX-RULE-DEFENSIVENESS-001 [ADVISORY/LOW] — COVERED
Self-containment requirement met by Task 1.2.1 prose.

## Risk coverage: 8/8 covered (RISK-7 partial — fix via G-DX-LEAK-001).
