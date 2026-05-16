---
'@alecsibilia/luca-mastracode': patch
---

fix: harden telemetry prose to eliminate field-completeness drift

Batch fix for 5 quality regressions surfaced by run `run_mp7dcrpm_ue0yzcb0`:

- **Usage-comment field-completeness drift** (`model: null`, `tokens: 0`):
  add omit-on-unknown directive to `shared-prefix.ts` Luca Reminders and
  to every spawn-site in `execute.md`, `architect.md`, `finalize.md`,
  `review.md`. Agents must omit the entire `<!-- usage: ... -->` comment
  when `model` or token counts are unknown — never emit placeholder
  values.
- **Fabricated `durationMs` round numbers** (`45000`, `60000`, `90000`,
  `120000`): require `durationMs = Date.now() - ts`, never a guess. Fix
  fabricated `execute.md:161` example (`12000` / `3400` / `45000`) to
  realistic primes and `Date.now() - ts`.
- **`success: null` on `record-subagent` complete**: prose now says
  `completed*` outcomes → `success: true`; `crashed`/`killed`/`timeout`
  → `success: false`; never `null`.
- **CorrelationId unit drift** (s vs ms): standardise test fixtures to
  13-digit millisecond timestamps with non-zero last digit (e.g.
  `1747200000123`) to disambiguate from epoch-seconds. Add invariant test
  rejecting fabricated `durationMs` round numbers in spawn-site regions.
- **Postmortem `vault: 'default'` clarification**: document that this is
  intentional (cross-project pitfall aggregation), not a bug — JSDoc on
  `PostmortemReport.pitfalls` plus inline comment at the construction
  site.

Tests:
- New `shared-prefix-semantics.test.ts` (5 runtime invariants on
  `SUBAGENT_SHARED_PREFIX`).
- New `spawn-site-invariant.test.ts` (5 mode files × 7 assertions each).
