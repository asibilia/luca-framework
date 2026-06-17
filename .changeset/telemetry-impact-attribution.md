---
"@alecsibilia/luca": minor
---

Milestone v13.1.0 — Telemetry Impact & Attribution. Close the gap between activity-capture (which Luca already did well) and impact-measurement, across four phases.

- **REQ-11/12 — recall-outcome attribution.** Wire `record-recall` telemetry at all five modes (triage/architect/execute/review/finalize) for per-mode hit-rate + verified-tier rate, and add a `recall.utilization` memory-utilization signal correlating recalled concept IDs to outcomes. No schema `v` bump (rides the open `TelemetryKind` union).

- **REQ-13 — cost-per-outcome reporting.** Extend `luca-telemetry-report` with a model rate table, token→cost conversion, cost-per-outcome (cost / phases-completed and / first-pass-success), and structure-vs-executor token attribution.

- **REQ-15 — PR-outcome write-back.** New `pr.created` (create-time, originating run) and `pr.outcome` (post-merge, fixed `pr-outcomes` synthetic log) telemetry kinds joined on `meta.prNumber`; a `luca telemetry pr-outcome` write verb (merged/reverted, review rounds, time-to-merge); a finalize-side `pr.created` run→PR map directive; and report-side merge-rate / time-to-merge aggregation.

- **REQ-14 — persisted outcome KPIs (capstone).** A pure `computeOutcomeKpis` core fn behind a read-only `luca telemetry kpi --json` verb computes complexity-bucketed KPIs — low-confidence ratio, first-pass verify rate, mean rework iterations, re-entry rate — from per-phase artifacts (`confidence.jsonl`, `verify.json`) and `signal.satisfaction` telemetry; a `finalize` body directive persists them at milestone close as milestone-stamped `metric:outcome-kpi-<version>-<complexity>` memories to the config-resolved repo vault. Producer-side, `--slug`/`--complexity` are now stamped onto the orchestrator's `signal.satisfaction` emits so run telemetry becomes complexity-bucketable (forward-only; uses the existing nullable schema fields — no `v` bump).
