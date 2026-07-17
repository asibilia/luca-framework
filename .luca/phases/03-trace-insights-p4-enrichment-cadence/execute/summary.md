# Execute Summary — trace-insights-p4-enrichment-cadence

3 waves, status: **success**. Branch `dad-xstate-migration`. Changes in working tree (commits stage-gated; land at finalize with the P2-fix + P3 commits).

## What changed

- **New helper `packages/luca-cli/src/init/helpers/enrich-trace-metadata.ts`** (+ sibling test): pure merge function following the `install-statusline.ts` / `install-hooks.ts` idiom. Three-tier ownership merge of `CC_LANGSMITH_METADATA` in `.claude/settings.local.json`: luca-owned keys (`repo`, `luca_version`) always refreshed (re-init idempotent); fill-if-absent defaults (`environment`, `ls_message_format`); all other user keys win verbatim (merge, never clobber). Zod safeParse on both the settings object and the nested metadata JSON string; malformed input → warn + skip (fail-open, never crash init). Gate: only runs when `TRACE_TO_LANGSMITH === 'true'` (global `~/.claude/settings.json` env + process.env fallback); unset → zero writes. Fresh repo with no settings.local.json → creates it when the gate is on. Repo name = git-root basename; luca_version from installed package.json (dual-path resolver).
- **Wiring**: barrel export in `init/index.ts`; `commands/init.ts` Step 5 (per-project) call after `installHooks`.
- **Runbook `docs/guides/trace-insights-cadence.md`**: weekly `/schedule` routine setup + inspect/disable, retention guardrail (weekly < ~14d shortlived), per-run cost note (Stage A–B free, Stage C ≈ 8 subagents, low single-digit dollars). The `/schedule` creation itself is a documented post-merge operator step (not in-repo verifiable).
- **Out-of-scope fix (confidence-logged)**: `commands/telemetry.test.ts` finally-block `prevExit ?? 0` — pre-existing bug (Bun 1.3.11 ignores `process.exitCode = undefined`, leaving a stuck 1) that was failing the phase's own `bun test packages/luca-cli` gate. Proven via stash-baseline run; minimal one-line fix.

## Verification

- ac-01…ac-11 probes pass; anti-01 (trace-insights skill untouched by this phase — verified zero bytes written there), anti-02 (init suite green) hold.
- Gates: tsc exit 0; `bun test packages/luca-cli/src/init` exit 0; `bun test packages/luca-cli` 391 pass/0 fail (~3.9s, well under the 120s bound).

## Intended commits (deferred to finalize)

1. `feat(cli): capture-side trace metadata enrichment helper + tests` (enrich-trace-metadata.ts + .test.ts)
2. `feat(cli): wire enrichTraceMetadata into luca init Step 5` (init/index.ts, commands/init.ts)
3. `docs(guides): trace-insights weekly cadence runbook` (docs/guides/trace-insights-cadence.md)
4. `fix(cli): restore process.exitCode to 0 in telemetry test teardown` (commands/telemetry.test.ts)

## Deviations

1. Out-of-scope telemetry.test.ts one-line fix (above) — pre-existing gate blocker, accepted.
2. Staging flattened (`MM`→` M` on the two trace-insights files) by the executor's ac-09 baseline `git stash -u`/`pop`; content fully intact (verified by orchestrator). Finalize stages all with `git add` so no impact.
