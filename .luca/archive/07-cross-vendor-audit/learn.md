# Learnings — Phase 07: cross-vendor-audit (REQ-10)

Milestone v13.0.0-pai-learnings (#295), phase 7/7 (LAST, MODERATE, cuttable).
Outcome: verify PASS (cycle 1), review APPROVE (cycle 1, 0 MUST-FIX). First-pass
converge — the only phase this milestone needing NO fix cycle. Validates the
lean + honest approach below.

What shipped: a cross-vendor read-only auditor at CRITICAL complexity, delivered
as a 7th `independence` reviewer perspective on `reviewer.ts` plus a gated
`### 8.6` opt-in step in `phase-execute`. Default OFF, CRITICAL-only,
cold-isolated adversarial spawn merged into the existing §8.1 routing. 1 wave,
2 files, no new subagent file / CLI verb / config schema.

---

## 1. Pattern — faithful adaptation of an impossible-mechanism requirement

**Type:** pattern
**Concept:** pattern:deliver-intent-when-platform-cant-provide-named-mechanism
**Confidence:** HIGH

REQ-10 asked for a "cross-vendor" auditor, but research established the harness
is SINGLE-VENDOR — all model tiers are Anthropic (`model-routing.ts:15-19`),
and subagents spawn via Claude Code `Task` (Anthropic). A literal cross-vendor
spawn is IMPOSSIBLE on this platform.

When a requirement names a mechanism the platform cannot provide, there are
three responses. Two are wrong: (a) FAKE it — emit a phantom "spawns Gemini/GPT"
claim (this milestone's recurring defect class); (b) silently CUT the intent.
The right response is the THIRD: deliver the requirement's INTENT via the
achievable mechanism, and DOCUMENT THE SUBSTITUTION HONESTLY in-artifact.

Here the intent (an independent second auditor catching single-model blind
spots) was delivered via cold isolation + adversarial fresh-eyes framing +
denying the auditor the other reviewers' findings. The gap was documented in
the body verbatim: `reviewer.ts:88` and `phase-execute/index.ts:1509` both
state the harness is single-vendor and that independence APPROXIMATES (does NOT
spawn) a cross-vendor review. Verifier + reviewer both specifically checked the
honesty note was present and no false vendor claim was made.

This is the CONSTRUCTIVE INVERSE of the phantom-capability pitfall: the same
honesty discipline, applied at DESIGN time rather than caught in review.

**When to apply:** any requirement that names a CLI verb, flag, field, vendor,
or model the platform doesn't actually have. Adapt to intent + document the
substitution in the artifact itself. Never fake the named mechanism; never
silently drop the intent.

---

## 2. Pattern — cuttable/low-priority phase calibration

**Type:** pattern
**Concept:** pattern:cuttable-phase-anti-overbuild-calibration
**Confidence:** HIGH

For a LOW-priority cuttable feature, the dominant risk is OVER-BUILDING, not
under-delivery. Match implementation weight to requirement priority:

- Make over-engineering an EXPLICIT ANTI-CRITERION. The plan + review enforced
  a ceiling via `git status --porcelain` showing only the 2 intended files —
  any new subagent file / CLI verb / config schema would have been REJECTED as
  a defect.
- Default the feature OFF. Opt-in `?? false` (`phase-execute/index.ts:1518`,
  reading `config.workflow.cross_vendor_audit_enabled ?? false`) — vs the core
  tribunals' `?? true`. The feature ships DORMANT; that is the correct
  "cuttable" signal.
- Reuse existing surfaces (extended `reviewer.ts` rather than authoring a new
  subagent) to keep the footprint minimal.

**When to apply:** any phase tagged cuttable/low-priority. Turn the priority
into an enforceable file-count guard + default-off flag.

---

## 3. Process — milestone synthesis: the phantom/drift defect class + standing-lint recommendation

**Type:** process
**Concept:** process:instruction-body-drift-class-needs-standing-cli-schema-lint
**Confidence:** HIGH

Across all of v13.0.0-pai-learnings (7 phases), the DOMINANT recurring defect
class was PHANTOM-CAPABILITY / FIELD-DRIFT / META-DOC-DRIFT. It appeared in
6 of 7 phases in escalating forms:

- phase-03: phantom claim-verify subcommands (verbs that don't exist)
- phase-04: missing `--run-id` flag + runId-vs-sessionId field drift
- phase-05: gotchas that themselves misstated mechanics
- phase-06: governance audit's own incomplete enumeration
- phase-07: the (correctly avoided) temptation to fake cross-vendor

Through-line lesson: instruction bodies / docs / criteria that ASSERT a system
mechanic (a CLI verb, a flag, a field, step-legality, a vendor capability, an
enumeration's completeness) are AS DRIFT-PRONE AS CODE and MUST be
grep-verified against source-of-truth at authoring time.

Critically, verifiers' token/presence probes SYSTEMATICALLY MISS this class —
a presence-probe confirms a string exists, not that the asserted verb/flag/field
actually runs. Only CODE REVIEW caught the drift in phases 3, 4, 5, 6.

Recommendation (NEW, the synthesis): a standing lint that cross-checks every
`luca <verb>` / flag / field reference appearing in instruction bodies against
the real CLI command registry and config/state schemas would have prevented the
MAJORITY of this milestone's fix cycles. This is the durable fix for the whole
class — moving the catch from per-phase human-style review to a deterministic
gate.

Links the already-persisted pitfalls: `phantom-cli-capability-in-instruction-bodies`,
`token-grep-criteria-miss-cli-runnability`,
`meta-doc-asserting-system-mechanic-drifts`,
`presence-probe-cannot-verify-enumeration-closure`. This entry is the synthesis
+ standing-lint recommendation, not a duplicate of those.

---

## 4. Decision — REQ-10 shipped as independence-framed cold auditor

**Type:** decision
**Concept:** decision:req-10-independence-not-literal-cross-vendor
**Confidence:** HIGH

REQ-10 ("cross-vendor auditor") shipped as an `independence` reviewer
perspective, NOT a literal cross-vendor/model spawn (impossible on the
single-vendor Anthropic harness). Properties:

- Cold-isolated adversarial spawn: receives ONLY git diff + project identity;
  NO workflow state, session context, learnings, or other reviewers' findings
  (`phase-execute/index.ts:1530`).
- Opt-in, default OFF (`?? false`); CRITICAL-only.
- Reuses `reviewer.ts` (perspective #7, slug `independence`) — no new subagent
  file, CLI verb, or config schema.
- Findings merged into the standard §8.1 routing, deduped by file:line.
- Substitution documented honestly in-body (`reviewer.ts:88`,
  `phase-execute/index.ts:1509`).

Alternatives rejected: faking a multi-vendor spawn (phantom capability);
cutting the feature entirely.

---

## Milestone reflection

v13.0.0-pai-learnings adapted PAI v5.0.0 review learnings into Luca across 7
phases (REQ-01..10). Two durable takeaways: (1) the honesty discipline that
prevents phantom capabilities is the SAME discipline that enables faithful
adaptation of impossible-mechanism requirements — phase-07 is the constructive
proof. (2) The milestone's recurring fix-cycle driver was instruction-body
drift that verifiers structurally cannot catch; a standing CLI/schema-registry
lint is the highest-leverage prevention for the next milestone. Phase-07 was
the only first-pass converge, achieved precisely by being lean (2 files,
anti-overbuild guard) and honest (documented the single-vendor gap up front).
