# Plan Review — Phase 1: confidence-gate-substrate

**VERDICT: APPROVED** (no must-fix). Reviewer spot-checked every named source file; all file:line refs and patterns verified accurate.

## Verified against source
- `ConfidenceEntrySchema` ends with `reviewHint` at `schemas.ts:52` — correct insertion point.
- `readConfidenceJournal({cwd,slug}): ConfidenceEntry[]` (`confidence-journal.ts:60`) — correct input source.
- Barrel chain correct: `confidence/index.ts:17-22` → `src/index.ts:20` re-exports out of `@alecsibilia/luca-core`. A `gate.ts` export will flow through.
- `resolveSlug` (`confidence.ts:42-54`), `summaryCommand` pattern (`:197-219`), `subCommands` map (`:249-254`) all match. `.ts`-extension import style matches existing barrels.
- `selectConfidenceGateActions` can be pure — `ConfidenceEntry` is a plain `z.infer` type; bucketing reads only `confidence`/`researchable`/`resolution`.
- No `gate.ts` collision. Postmortem `LOW_CONFIDENCE_THRESHOLD` is in a separate module (`analysis/postmortem.ts:127`), untouched.

## Findings → executor directives
- **F1 (apply during impl):** write Task 2's bucketing as a **total** branch — final case is an unconditional `else → ask`, not a third explicit `if`. Guarantees every entry lands in exactly one bucket even if a value slips past the enum. Logic unchanged (still fail-toward-`ask`).
- **F2 (note):** postmortem lives at `analysis/postmortem.ts` (not `confidence/`); plan's "don't touch postmortem" constraint resolves correctly regardless.
- **F3 (note):** only `confidence-journal.test.ts` exists in the confidence dir; verify steps that mention "test files" are advisory and correctly gated behind `bunx --bun tsc --noEmit` (no `bun test`).
- **F4 (note):** trust the plan/context shape `{auto,research,ask,counts}` over research.md's earlier `counts`-less sketch. Plan is authoritative.

All tasks atomic, independently verifiable via tsc + runtime spot-checks, traceable to research, consistent with locked decisions.
