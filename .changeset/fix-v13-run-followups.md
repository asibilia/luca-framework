---
"@alecsibilia/luca": patch
---

Follow-up fixes from a real v13 run (Ramora report) — state-write safety, a
recovery primitive, and version/doc hygiene.

- **C1-residual — never clobber an active `state.json`.** `writeProjectSkeleton`
  could (with `force`) overwrite an existing `state.json` with a fresh idle
  skeleton + a brand-new `sessionId` — exactly the "state wiped mid-pipeline"
  symptom. The state.json write now refuses to overwrite an ACTIVE state (a
  non-idle pipelineStep, a non-empty roadmap, or currentPhase>0) even under
  `force`; `force` still refreshes an idle/empty skeleton.

- **M2 — `luca state set-current-phase <n>` recovery primitive.** Adds a
  lock-serialized write-surface command to position `currentPhase` directly to
  a 1-based phase number (marking it in-progress). Previously `roadmap create`
  always activated phase 1 and `phase advance` only moved +1 at the `learn`
  step, so restoring position after a roadmap reset meant walking the pipeline
  once per phase. Validated `1..totalPhases`.

- **C2 — fix stale `luca confidence log` flags.** The `luca-write-surface`
  reference skill documented the removed `--score/--stage/--rationale` shape;
  updated to the canonical `--phase/--wave/--task/--confidence/--category/
  --decision/--reasoning/--risk` (or `--file <json>`) surface.

- **M4 (part) — config-vs-CLI version-skew doctor check.** `lucaVersion` in
  `.luca/config.json` is written once at init and never reconciled, so it goes
  stale after a CLI upgrade. Adds a project-scoped `luca doctor` check that
  warns on skew and reconciles it under `luca doctor --fix` (preserving all
  other config keys). Skipped in dev builds.
