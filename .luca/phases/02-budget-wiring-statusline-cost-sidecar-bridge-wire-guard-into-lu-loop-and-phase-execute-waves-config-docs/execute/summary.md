# Execute Summary — #319 budget-guard, Phase 2 (budget-wiring)

Two waves, both complete. No commits (deferred to finalize).

## Wave 1 — statusline cost-sidecar bridge (change 6)
- `packages/luca-tools/src/statusline/handler.ts`: added `total_cost_usd?`/`total_duration_ms?` to `StatuslinePayload.cost`; new `writeUsageSignal(projectDir, cost)` writes `<projectDir>/.claude/cache/luca-usage-signal.json` = minimal `{schemaVersion:1, totalCostUsd, updatedAt}` (the only shape the Phase-1 reader consumes). Writes unconditionally when `total_cost_usd` is a finite number with a fresh ISO `updatedAt` [G-DX-001]; entire mkdir+write try/catch-swallowed so the statusline never crashes the harness [anti-02]; comment notes the reader-cwd vs writer-project_dir coincidence [G-ARCH-001].
- Verify: tsc exit 0; happy-path pipe probe wrote the sidecar with numeric `totalCostUsd`; 3 malformed-payload probes all exit 0 (never threw).

## Wave 2 — instruction-body wirings (changes 7, 8, 9)
- `skills/lu/index.ts` + `commands/lu.ts` (dual-surface, textually parallel): step-1a in the Pipeline loop after read-state — `luca budget check --complexity <level>`; `ok`→continue, `warn`→note+continue, `halt`→checkpoint-and-pause (lu-handoff/`session:*` handoff with `tripped`, `budget.halt` telemetry, paste-ready resume msg, do NOT advance — halt only at the top-of-loop clean boundary). Oversight bullet: **"always-on budget stop"** fires even in full-auto [G-CRIT-001].
- `phase-execute/index.ts` §4.5: `luca budget check` before each wave; `halt`→existing suspend path (`execute/progress.jsonl` + `phase.suspend reason:"budget_halt"`), never mid-wave. Left the live `orchestrator-context-pruning.md` reference untouched [DELTA-3].
- `docs/getting-started.md`: documented optional `.luca/config.json` `budget` overrides (`maxWallClockMs` positive, `maxToolCalls`, `softCostCeilingUsd` 0=disabled; fail-closed to built-in ceiling).
- Verify: tsc exit 0; grep tokens confirmed — `luca budget check` in both /lu surfaces + phase-execute; `budget.halt` in both /lu surfaces; `budget_halt` in phase-execute; `always-on budget stop` in both /lu surfaces; `maxWallClockMs` in docs. Dual-surface sync = 2.

## Materialization note
Instruction-body edits (statusline handler + the 3 artifacts) reach installed harnesses via `bun run build` + a `luca init` re-run — source edits alone don't refresh deployed bodies. Not a pipeline gate; tsc is the gate.
