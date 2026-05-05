# Context — Pipeline Phase Artifact Storage Refactor (#220)

**Mode:** full-auto. Discussion subagent skipped; defaults documented below.

## Decisions

| # | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| 1 | **Session-scoped phaseSlug** (one per pipeline run, derived at triage) | Matches issue #220 wording ("triage derives slug"). Multi-phase ROADMAP runs share one slug; per-phase distinction via filename suffix (REVIEW-1.md vs REVIEW-2.md). | Per-ROADMAP-phase slug — would require slug recompute at every start-phase, breaks "triage derives" invariant, complicates re-entry. |
| 2 | **Slug immutability** — once persisted in luca-state.json, never recomputed | Stable references for in-flight runs. Re-entry into pipeline preserves existing artifacts. | Recompute on plan edit — orphans artifacts. |
| 3 | **`runs/<runId>/` nests under `phases/<slug>/`** | Issue #220 ASCII tree shows `phases/<slug>/run_<id>/`. Keeps per-session telemetry co-located with per-session artifacts. | Keep `runs/` at root — fragments per-session data, contradicts issue. |
| 4 | **Top-level JSONL audit logs stay at root** | `session-ledger.jsonl`, `routing-history.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl` are append-only across runs/phases — moving them mid-stream breaks `archivePriorRun()`. They're cross-session telemetry. | Move JSONL into phase dir — breaks ledger continuity. |
| 5 | **Slug derivation algorithm** | `parseTicketId(intent)` → `"PT-11089"`; combined with `sanitize(intent[:40])`; fallback `YYYYMMDD-HHmm-<sanitize>`. Sanitization via `sanitizeVaultName()` semantics (lowercase, alphanum+dash). | LLM-generated slug — non-deterministic, security risk. |
| 6 | **Collision suffix:** numeric (`-2`, `-3`, …) when target dir exists AND non-empty | Prevents overwriting prior runs without breaking idempotency for empty dirs (re-entry). | Always suffix — pollutes namespace; never suffix — silent overwrite. |
| 7 | **Single chokepoint helper:** `packages/luca-mastracode/src/util/phase-paths.ts` | One module, all path resolution. Eliminates 177-occurrence diffusion. | Per-tool helpers — replicates current debt. |
| 8 | **Backward compatibility:** `phasePath(file, undefined)` returns root path | In-flight runs at upgrade lack `currentPhaseSlug` → consumers must work without it. Finalize stragglers check leniency when slug absent. | Hard-fail on missing slug — breaks legacy. |
| 9 | **Migration helper:** new `workflowState` action `archive-loose` (NOT new CLI binary) | Reuses existing tool surface; no new bin entrypoint; agents/users invoke via tool call. | Standalone bin script — adds packaging surface. |
| 10 | **luca-studio:** out of scope for this PR | Studio likely reads only luca-state.json + todos/ (both unchanged). Verify in execute, defer changes if any. | Refactor Studio inline — scope creep. |
| 11 | **manageRoadmap fs bypass:** fix in this PR | Already an open todo; uses ROADMAP_PATH() helper (root file); free with main refactor. | Defer — leaves bypass as silent debt. |
| 12 | **Skip discussion subagent** | full-auto mode + clear research findings. All decisions documented here. | — |

## Constraints

- ≤150-line PLAN.md
- All 6 pipeline phases must work post-refactor (triage → finalize)
- No breaking changes to public API surface
- Single PR, single feature branch `feat/220-pipeline-phase-artifact-storage`
- Tests pass; finalize verification gate must pass on this very PR (dogfooding)

## Open Items Deferred to Execute

- gh-prepare skill PR body POSTMORTEM.md path reference — verify and update if found
- luca-studio reads of phase artifacts — verify, defer if any
