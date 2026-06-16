PERSPECTIVE: architecture
VERDICT: APPROVE

Cold review (no session context). Verified against the code on disk.

## Verified evidence (anchors for APPROVE)

1. `packages/luca-core/src/telemetry/schemas.ts:175-184` — `RecallUtilizationMetaSchema`
   is structurally identical to the established advisory-meta pattern: `z.object({...})`
   with all fields `.optional()` and `.passthrough()`, mirroring
   `SatisfactionSignalMetaSchema` (114-121), `ClassifierOverrideMetaSchema` (134-141),
   and `FailureDumpMetaSchema` (154-161). Doc comment carries the same "ADVISORY /
   fail-safe / MUST NOT be wired into a throwing path" contract. Correctly passthrough,
   non-throwing.

2. `packages/luca-core/src/telemetry/schemas.ts:38` — `recall.utilization` added to the
   `TelemetryKind` union directly parallel to `recall.hit`/`recall.miss` (36-37). The
   `(string & {})` escape (43) means consumers stay forward-compatible. Schema version
   `v: z.literal(1)` (74) is UNCHANGED — additive field/kind, no bump. Confirmed.

3. `packages/luca-core/src/telemetry/index.ts:8,15` — barrel re-exports both the value
   (`RecallUtilizationMetaSchema`) and the inferred type (`RecallUtilizationMeta`),
   alphabetically placed, consistent with the sibling advisory schemas. Correct.

4. `packages/luca-cli/src/commands/telemetry.ts:26-36,89,98` — the emit command accepts
   `kind` as a free-form `z.string()` (no enum gate) and `--run-id`; `appendTelemetry`
   validates against `TelemetryRecordSchema` where `kind: z.string()` (schemas.ts:78).
   Therefore the `--kind recall.utilization` directive in review.ts:251 is genuinely
   runnable, not fictional, and will not be rejected.

5. Read-time correlation design is coherent: emit side (review.ts:248-254) gathers
   `recalledIds` from the run's `recall.hit/miss` records + terminal outcome and emits ONE
   `recall.utilization` per run; read side (skills/luca-telemetry-report/index.ts:91,
   116-121) joins by `byRecalledId[ulid][outcome]` keyed also by `step`, and explicitly
   degrades to "no utilization data yet" when absent (157-159). Producer/consumer meta
   keys match exactly (`recalledIds`, `outcome`∈{positive|negative|neutral},
   `step`∈{verify|review}). The honesty framing (co-occurrence ≠ attribution, line 119)
   is sound for an MVP statistical join.

FINDINGS:

- [NOTE] Recall-time `recall.hit/miss` meta is now an emergent 7-key shape
  (query/resultCount/verifiedCount/vault/callerMode/durationMs/recalledIds) repeated
  verbatim across all 5 mode bodies, but has NO advisory Zod schema sibling — only
  `recall.utilization` (the smaller, outcome-time shape) got one. Not a blocker (advisory
  schemas are doc-only and the report consumes these keys fine), but a `RecallHitMetaSchema`
  would complete the documentation-parity story and give the report skill the same
  IDE/tooling anchor the other kinds enjoy.
  Cross-phase: false

- [NOTE] separation of concerns is clean: the only luca-core change is additive schema +
  barrel; all behavioral wiring lives in instruction prose (luca-tools artifacts), and the
  CLI needed zero change because `kind` was already free-form. No layering or dependency-
  direction violation. The correlation lives entirely at read time in the report skill,
  keeping emit paths dumb/append-only — the right boundary for an advisory MVP.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
