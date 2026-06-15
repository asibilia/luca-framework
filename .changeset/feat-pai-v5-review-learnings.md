---
"@alecsibilia/luca": minor
---

Adopt PAI v5.0.0 review learnings across the planning, verification, learning, and governance surfaces (v13.0.0-pai-learnings milestone, REQ-01…REQ-10).

- **Plan quality** (REQ-01/02): first-class `--area`/`--priority` on `luca todo` with unknown-flag rejection; a plan-criteria grammar (Splitting Test, mandatory anti-criteria, ID-stability + tombstones) enforced by `luca plan lint`.
- **Verification doctrine** (REQ-03): evidence-per-criterion probe table, forbidden-language list, `[DEFERRED-VERIFY]` (schema `superRefine`: deferred ⇒ `met:false` + tracked follow-up), ReReadCheck, and a deliverable manifest; the verify handler now routes through `writeVerificationResult` (atomic, runId-stamped).
- **Signal capture & telemetry** (REQ-04/05): `signal.satisfaction` (3-path, implicit outcome PRIMARY so full-auto runs are never signal-empty), `signal.failure-dump`, and `classifier.override` on the open `TelemetryKind` union via `luca telemetry emit` (no new CLI verb); learner signal synthesis + session-resume readback.
- **Learning loop** (REQ-06/07): Deutsch C/R/L learner format (conjectured/refuted_by/learned/criterion_now, carried in the `TO_PERSIST` content with zero contract change); a mandatory **Gotchas** field on all 20 agent/subagent artifacts (optional Zod + parity audit, `renderGotchasPrelude`).
- **Governance** (REQ-08/09): a hard-vs-soft governance floors audit (`docs/decisions/governance-floors-audit.md`) + a closed `RELAXATION_PATHS` enumeration; trimmed over-prescriptive instruction text across 7 bodies; purged phantom `luca todo move`/`move-batch`/`retro postmortem gate` verbs and the phantom `no-tests rule` claim from shipped instruction bodies.
- **Cross-vendor** (REQ-10): an independence reviewer perspective + a gated, CRITICAL-only opt-in audit step (single-vendor harness — honestly framed as an independence approximation).
