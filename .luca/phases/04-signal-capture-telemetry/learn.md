# Learnings — 04-signal-capture-telemetry

Phase 4/7 (COMPLEX), milestone v13.0.0-pai-learnings (#295).
Outcome: verify PASS (cycle 2 after review-fix wave), review APPROVE (cycle 2). All 18 live AC + 7 anti met; D1–D6 shipped.
Shipped: REQ-04 satisfaction signal capture + REQ-05 classifier-override telemetry, via NEW telemetry KINDS on the existing `luca telemetry emit` surface — zero new CLI verbs.

---

## Pitfall: token-presence criteria pass while emitted CLI command is runtime-broken

- **TYPE:** pitfall
- **CONCEPT:** pitfall:token-grep-criteria-miss-cli-runnability
- **CONFIDENCE:** HIGH
- **CONTENT:** When a phase emits `luca …` CLI invocations from instruction bodies, token-presence greps (the AC probes, e.g. `grep -q "signal.satisfaction"`) verify a string EXISTS but NOT that the emitted command is runnable against the real CLI arg contract or real state schema. This phase PASSED verify on cycle 1 (all token-greps green) but code REVIEW (simp+dx) caught 2 MUST-FIX runtime breaks: (1) every emit example omitted the REQUIRED `--run-id` flag (`packages/luca-cli/src/commands/telemetry.ts:32-36`, `required: true`) → would exit-1; (2) instructions referenced a nonexistent state field `runId` — the real field is `sessionId` (`packages/luca-core/src/state/schemas.ts:96`) — breaking digest collection and making session-resume readback always empty. ROOT CAUSE: the verifier grades token presence, never the FULL command line against the command's required-arg schema. **Prevention:** criteria for instruction-body CLI invocations must validate the full command against the CLI's required-arg contract (grep each emit line includes every required flag; assert referenced state/schema fields exist), not token presence. 4th occurrence of the phantom-capability/field-drift class (phase-01 docs-drift, phase-02 classifier-registration, phase-03 phantom claim-verify subcommands). A lint cross-checking instruction-body `luca …` invocations against registered command arg schemas would kill the whole class.
- **CONTEXT:** Any phase whose deliverable is instruction-body text that emits CLI commands or references state/schema fields.

---

## Pitfall: state.sessionId is unset in recovery/partial runs

- **TYPE:** pitfall
- **CONCEPT:** pitfall:sessionid-unset-in-recovery-runs
- **CONFIDENCE:** HIGH
- **CONTENT:** `state.sessionId` is stamped only at init (via `generateRunId`); it is NOT a Claude Code session id (`packages/luca-core/src/state/schemas.ts:93-96`). In recovery/partial runs (state re-seeded without init-stamping), `sessionId` is UNSET, so "use sessionId as --run-id" still emits an empty run-id. The orchestrator caught this as a third defect after the two review MUST-FIX were resolved. **Fix:** fall back to `luca telemetry new-run` (mints + prints a fresh runId — `packages/luca-cli/src/commands/telemetry.ts:10`) when sessionId is absent. **Prevention:** never assume init-only state fields are populated in recovery paths; provide a generator fallback for any required id read from state.
- **CONTEXT:** Reading init-stamped state fields (`sessionId`, run ids) in paths reachable after recovery/partial-run re-seeding.

---

## Pattern: telemetry-emit-only extension via the open `kind` union

- **TYPE:** pattern
- **CONCEPT:** pattern:telemetry-emit-only-extension
- **CONFIDENCE:** HIGH
- **CONTENT:** For any cross-run-aggregatable signal in Luca, add a NEW telemetry KIND on the existing `luca telemetry emit` surface instead of a new CLI verb. The `TelemetryKind` union is open (`kind: z.string()`), so a new kind needs no schema-version bump, no CLI-registry entry, and no phase-gating: `luca telemetry emit` is bash-readonly, so it is allowed in EVERY phase (dodges WRITE_COMMAND_PHASES) and dodges the 3-registry trap entirely. This phase added `signal.satisfaction`, `signal.failure-dump`, `classifier.override` this way. Per-event metadata rides the free-form `--meta` JSON arg; advisory `.passthrough()` MetaSchemas can document shape WITHOUT being `.parse()`d in the emit path (kept advisory to avoid coupling emit to schema validation). Cheapest extension point in Luca — prefer over new CLI verbs.
- **CONTEXT:** Adding a new cross-run-aggregatable signal/metric to Luca. NOT for operations needing dedicated args, validation, or non-telemetry side effects.

---

## Pattern: verifier should probe RUNNABILITY, not just token presence

- **TYPE:** pattern
- **CONCEPT:** pattern:verifier-runnability-probe-shape
- **CONFIDENCE:** HIGH
- **CONTENT:** Token-presence greps are too weak for instruction bodies that emit CLI commands. A stronger probe shape — used in this phase's cycle-2 verify and the direct remedy for the token-grep pitfall — re-probes RUNNABILITY: count emit lines missing a required flag (assert = 0), assert a generator fallback is present, assert no broken state/schema field references. This catches the runtime-broken-but-token-present class that a `grep -q "<kind>"` check misses. When designing AC probes for instruction-body deliverables, prefer "every emitted command line includes every required flag and references only existing fields" over "the token appears somewhere."
- **CONTEXT:** Writing verification criteria for phases whose deliverable is instruction-body text emitting CLI commands.

---

## Pattern: keep both combined reviewer lenses even on narrow surfaces

- **TYPE:** pattern
- **CONCEPT:** pattern:dual-combined-reviewer-lens-value
- **CONFIDENCE:** MEDIUM
- **CONTENT:** Combined-perspective reviewers (arch+sec, simp+dx) were proportionate for this narrow-surface phase, but the verdict SPLIT: arch+sec APPROVE while simp+dx REQUEST_CHANGES. The runtime-runnability defect (missing `--run-id`, wrong field name) was a dx/simplification catch, NOT an architecture one. The split demonstrates the value of keeping BOTH combined lenses even when the change surface is small — collapsing to a single lens would have shipped the runtime breaks.
- **CONTEXT:** Reviewer selection on narrow-surface phases; resisting the urge to drop a combined-reviewer lens to save tokens.

---

## Decision: REQ-04 reframed from per-message rating to per-decision + per-step-outcome

- **TYPE:** decision
- **CONCEPT:** decision:req04-satisfaction-signal-granularity
- **CONFIDENCE:** HIGH
- **CONTENT:** REQ-04 "per-message satisfaction rating" was reframed (user-selected at gate-ask) to per-DECISION + per-step-OUTCOME capture, with the implicit OUTCOME signal as PRIMARY. Rationale: per-message rating requires explicit user input and would leave full-auto runs signal-empty; an implicit per-step-outcome signal guarantees full-auto runs always produce satisfaction telemetry. Alternatives considered: explicit per-message rating (rejected — empty under full-auto), decision-only capture (rejected — misses step outcomes). Resolved via gate-ask.
- **CONTEXT:** luca-framework signal-capture design; relevant when extending satisfaction/feedback telemetry or revisiting full-auto signal coverage.
