# Learn — 03-trace-insights-p4-enrichment-cadence

MODERATE phase, verified PASSED (11/11 probes). First real-code phase of the trace-insights rollout (P1–P3 were skill-body prompt edits). Added `luca init` Step 5 that merges `CC_LANGSMITH_METADATA` into a repo's `.claude/settings.local.json`, plus a cadence runbook doc. Plan-review APPROVED first try (0 blocking); review 0 must-fix, one polish wave (1 should-fix + 1 note).

## pitfall: bun-exitcode-undefined-sticks

- **Type**: pitfall · **Confidence**: HIGH · **Vault**: default
- **Conjectured**: A test teardown that restores `process.exitCode = savedValue` (where saved was `undefined`) returns the process to a clean/success status.
- **Refuted by**: `packages/luca-cli/src/commands/telemetry.test.ts` finally-block — under Bun 1.3.11, assigning `process.exitCode = undefined` does NOT clear a previously-set `1`; the stuck `1` poisoned the phase's own `bun test packages/luca-cli` gate despite 0 test failures. Proven via a `git stash` baseline run (failed on clean tree too → pre-existing, not phase-introduced).
- **Learned**: In Bun, once `process.exitCode` is set truthy, assigning `undefined` is a no-op — the prior code sticks. Save-and-restore teardown must coalesce to a concrete `0`: `process.exitCode = prevExit ?? 0`.
- **Criterion now**: When teardown save/restores `process.exitCode`, restore with `?? 0` (never bare `undefined`). If a `bun test` gate fails with 0 reported failures, suspect a sticky exitCode from teardown before hunting logic bugs; confirm with a stash-baseline run.

## pattern: settings-file-three-tier-merge-ownership

- **Type**: pattern · **Confidence**: HIGH · **Vault**: default
- **Conjectured**: An idempotent `init` step that writes into a user-shared config file (`.claude/settings.local.json`) can either overwrite its block or naively spread defaults.
- **Refuted by**: Overwrite loses user customizations on every re-init; naive spread either clobbers user keys or lets stale luca-owned values (repo, version) drift. Load-bearing requirement was merge-don't-clobber, tested non-vacuously with a colliding custom key (`enrich-trace-metadata.ts`).
- **Learned**: Model each key by ownership in three tiers: (1) luca-owned keys (`repo`, `luca_version`) always REFRESHED so re-init is idempotent and self-healing; (2) fill-if-absent defaults (`environment`, `ls_message_format`) written only when missing; (3) all other user keys WIN verbatim (merge, never touch). Wrap as a pure merge fn + thin IO wrapper (mirrors `install-statusline.ts` / `install-hooks.ts`), Zod safeParse both the settings object and the nested metadata JSON-string, and fail-open (warn + skip) on malformed input so init never crashes. Absent file → treat as `{}` and create when the gate is on.
- **Criterion now**: For any init write into a shared config file, classify every key into refresh / fill-if-absent / user-wins BEFORE coding the merge; add a test with a colliding user key proving user value survives AND luca-owned value refreshes. Fail-open on parse errors.

## Signal Synthesis

- **Recurring failure themes**: One failure signal, non-phase-origin — the sticky-`exitCode` gate blocker (pre-existing, surfaced by this phase's own `bun test` gate). Fixed in-scope-adjacent with a one-line `prevExit ?? 0`, confidence-logged (medium, scope-creep), proven via stash baseline. No phase-introduced failures.
- **Satisfaction valence trends**: Uniformly positive across all three sources — checks ×2 (first-pass + post-polish), verify ×2 (11/11 + post-polish no-regress), review ×2 (iter1 APPROVE 0 must-fix / 1 should-fix → iter2 CONVERGED). No negative-valence step.
- **Cross-cutting pattern**: Ground-truthing precedents against real files BEFORE writing (install-statusline/install-hooks shape, version dual-path, basename(cwd)) produced a first-try plan approval AND 0 must-fix review — the inverse of P3, which shipped a design on a nonexistent emitter. Reinforces the existing `pattern:plan-review-ground-truth-repo-data` memory (positive-direction evidence).
- **Confidence journal**: 4 auto at gate (all grounded, incl. one verified live against `~/.claude/settings.json` env); 1 executor-logged (telemetry.test.ts scope-creep fix, medium). No research/ask escalations.
