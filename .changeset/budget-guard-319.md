---
"@alecsibilia/luca-core": minor
"@alecsibilia/luca-cli": minor
"@alecsibilia/luca-tools": patch
---

feat: budget/duration guard so a long full-auto `/lu` run checkpoints before the account spend cap hard-interrupts (#319)

A long `full-auto` `/lu` run had no cost- or time-aware stop, so it could run ~3h and hard-error (`Interrupted`) at the account spend cap with no clean checkpoint. Adds an advisory guard that trips at a clean step boundary and checkpoints-and-pauses instead of erroring. Wall-time (a new state-stamped `runStartedAt`) is the guaranteed trip wire; tool-call count and statusline-bridged cost are best-effort. Advisory-first with generous per-complexity defaults; no regression when the cost sidecar is absent.

- **luca-core**: `runStartedAt` on the state schema; wall/tool/cost limits (`maxWallClockMs`, `maxToolCalls`, `softCostCeilingUsd`) across the budget matrix; a pure `evaluateRunBudget` evaluator (worst-of status, inclusive boundaries, absent/0-limit dims skipped) + `resolveRunBudgetOverrides` config overlay (`.finite()`/`positive()` guarded so a `.luca/config.json` override can't disable the wall-time trip wire); an exported `RunBudgetDimension` verdict-contract union.
- **luca-cli**: `luca budget check` — reads the three signals, resolves per-complexity limits merged with config overrides, prints a `{status,tripped,signals}` verdict, always exits 0 (advisory); lazily + idempotently stamps `runStartedAt`; a deterministic run-start stamp on the `triage → research` transition.
- **luca-tools**: the guard wired into both `/lu` surfaces (a top-of-loop `budget check` with a `halt → checkpoint-and-pause` path via `lu-handoff`) and phase-execute wave boundaries (`halt → phase.suspend`), the always-on stop that fires even in `full-auto`; a best-effort statusline → `.claude/cache/luca-usage-signal.json` cost bridge; config-override docs.
