PERSPECTIVE: architecture + security
VERDICT: APPROVE

## Scope
Cold-isolation review of the phase-04 staged delta only (`git diff --cached`). Files judged:
- packages/luca-core/src/telemetry/schemas.ts, index.ts
- packages/luca-tools/src/artifacts/skills/lu/index.ts
- packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts
- packages/luca-tools/src/artifacts/subagents/learner.ts
- packages/luca-tools/src/artifacts/skills/session-resume/index.ts

These are INSTRUCTION BODIES (prose for an LLM orchestrator) plus one schema module — judged for correctness/unambiguity/safety, not runtime behavior.

## Evidence verified (anti-sycophancy gate — 6 locations)
1. **Open union preserved.** `schemas.ts:42` — `TelemetryKind` adds the 3 new literals (`signal.satisfaction`, `signal.failure-dump`, `classifier.override`) but keeps `(string & {})`. `schemas.ts:77` — `TelemetryRecordSchema.kind` is still `z.string()`, so unknown kinds validate. Additive, forward-compatible.
2. **No TelemetryRecord field-optionality change.** `schemas.ts:44-67` — interface fields and their nullability are unchanged from v1; only the `kind` type-alias union grew. No breaking change; `v: 1` literal preserved.
3. **MetaSchemas advisory only.** `schemas.ts:113-160` — all three (`SatisfactionSignalMetaSchema`, `ClassifierOverrideMetaSchema`, `FailureDumpMetaSchema`) use `.passthrough()` and carry JSDoc "MUST NOT be wired into any throwing validation path." Barrel (`index.ts:4-18`) re-exports them but no emit path `.parse()`s. lu skill reinforces this at lines 114 and 134 ("do NOT `.parse()` the meta — the MetaSchema is advisory only"). Boundary is clean.
4. **Import direction intact.** Grep for luca-core imports in `artifacts/` returns only 4 pre-existing, unrelated files (execute.ts, executor.ts, verification-doctrine.ts, shadow-scanner.ts). This phase introduces NO new luca-tools→luca-core import; instruction bodies reference telemetry by string kind. luca-tools→luca-core-only direction holds.
5. **telemetry-emit-only achieved.** Every new emit in lu skill (lines 63, 105, 126, 131, 167, 223) uses the existing `luca telemetry emit --kind ... --meta ...` verb. No new CLI verb added.
6. **Digest-injection mirrors gate-resolution pattern.** lu skill "Learner prompt injection" (lines 192-211) builds a `<signal-digest>` block in-prompt, explicitly "mirror the `<confidence-gate-resolutions>` shape above" (line 199), and learner.ts Step 1b (line 67) consumes exactly that block, correctly noting subagents have no telemetry/MCP access. Pattern faithfully mirrored. The `classifier.override` taxonomy in lu:65 (`cli-flag`/`force-complex`/`human-ask`/`heuristic-promotion`) matches `OverrideSourceSchema` (schemas.ts:96-101) exactly.

## Security verification
- **failure-dump privacy posture is correct.** lu:129-134 routes large/sensitive dumps to gitignored `.luca/tmp/<kebab>.json` via the `Write` tool and references them by `meta.dumpRef`, keeping sensitive payloads out of git AND out of the telemetry JSONL. Sound.
- **classifier.override leaks nothing sensitive** — meta is `{classifier, from, to, source}`, all classification labels (lu:63). No payload content.
- **dumpRef is constrained to `.luca/tmp/` by prose** (lu:129-134, 205; learner:196) — consistent across all references.

FINDINGS:

- [SHOULD-FIX] Stale telemetry-kind name in session-resume example comment. The inline comment names `signal.failure`, which is NOT a real kind — the canonical kind is `signal.failure-dump` (schemas.ts:40). The readback itself is unaffected because the jq filter uses `startswith("signal.")` (a prefix match catches the real kind), so this is a documentation drift, not a runtime break. But it can mislead a future maintainer into thinking `signal.failure` is a distinct kind.
  File: packages/luca-tools/src/artifacts/skills/session-resume/index.ts:48
  Suggestion: Change `(e.g. signal.satisfaction, signal.failure)` to `(e.g. signal.satisfaction, signal.failure-dump)`.
  Cross-phase: false

- [SHOULD-FIX] `--meta` JSON construction from interpolated runtime values has an unaddressed quoting hazard in the instruction prose. The emit examples build single-quoted shell JSON with interpolated free-form fields — `detail` ("pass/fail summary", "what the user confirmed or redirected"), `reason`, and `dump` (inline failure text). If any interpolated value contains a single quote, double quote, or newline, the `--meta '{...}'` shell argument and/or the JSON itself breaks, and the emit silently fails or records a malformed record. The instructions never tell the orchestrator to escape/sanitize these values or to prefer the `--file` handoff (which lu already uses for `roadmap`/`checks`) for free-form content. The advisory MetaSchema does not save this since meta is never parsed.
  File: packages/luca-tools/src/artifacts/skills/lu/index.ts:105,126,167,223 (and the inline-`dump` example at :126)
  Suggestion: Add one sentence to the emit guidance: "Keep `detail`/`reason` to a short single-line summary with no quotes or newlines; for any multi-line or quote-bearing content use the `dumpRef` file path, never inline `dump`." This makes the inline path safe-by-construction and pushes risky content to the gitignored file path that already exists.
  Cross-phase: false

- [NOTE] `meta.dumpRef` path-safety is prose-only, not enforced. Instructions consistently constrain dumpRef to `.luca/tmp/<kebab>.json` (lu:129-134, 205), but nothing validates the path at emit time, and a malformed-but-passthrough meta would still be accepted. Acceptable for an instruction-body delta (the `Write` tool's own stage-gate guards where files land), but a future hardening could validate `dumpRef` is `.luca/tmp/`-relative in the aggregator's readback (luca-telemetry-report) rather than trusting it.
  File: packages/luca-tools/src/artifacts/skills/lu/index.ts:129-134
  Cross-phase: false

- [NOTE] Failure-dump trigger list (lu:118-122) and the satisfaction-`outcome` terminal branches (lu:102) both enumerate `verify`/`checks` branches independently. They are consistent today, but the two lists must be kept in sync by hand — a future step added to one (e.g. a new hard-fail branch) is easy to forget in the other. No action needed now; flagging as drift-risk for the learner/maintainer.
  Cross-phase: false

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
