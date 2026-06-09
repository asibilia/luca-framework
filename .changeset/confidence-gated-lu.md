---
"@alecsibilia/luca": minor
---

Add confidence-gated full-auto `/lu` — the pipeline now pauses only where its own confidence is low and unresearchable.

Redefines `full-auto` from "never pause" to "autonomous; pauses only on confidence-gate `ask` items (low-confidence + unresearchable) and CRITICAL safety". Delivered in four parts:

- **Substrate** (`luca-core`): optional `researchable`/`resolution` fields on `ConfidenceEntrySchema`; a pure `selectConfidenceGateActions()` bucketer (`auto`/`research`/`ask`, with `medium → auto` and fail-toward-`ask`); a read-only `luca confidence gate` CLI.
- **Emission** (`luca-cli` + `architect` mode): `luca confidence log` gains `--researchable`/`--resolution`; the architect mode-agent logs a confidence entry per non-trivial plan-time decision.
- **Controller** (`lu` skill + command): a Confidence Gate sub-step runs at the tail of `plan-review` — routes `auto` silently, spawns a `researcher` for `research` items, asks the user (via AskUserQuestion) for `ask` items; persists resolutions to `plan-review.md` and injects them into the executor. `ask` items are the sole pause in `full-auto`.
- **Docs**: `docs/decisions/confidence-gated-lu.md`.

No state-machine (`OversightMode`, `pipelineStep`) changes — the 3-level oversight enum is unchanged; the gate is orchestrator prose. Follow-ups tracked: a `luca confidence resolve` for a true re-emit/re-gate loop, and a fix for the `review → execute` transition gap.
