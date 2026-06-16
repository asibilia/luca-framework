PERSPECTIVE: simplification + dx (cycle-2 convergence re-review, cold isolation of wave-5 fix delta)
VERDICT: APPROVE

## Cycle-1 MUST-FIX resolution (both fixed)

1. **Phantom `claim-verify` subcommands** (cycle-1 MUST-FIX #1) — RESOLVED.
   - All call sites now use the real surface `luca claim-verify <file>`: `modes/review.ts:205` stages text to `.luca/tmp/` then runs the file form; `modes/finalize.ts:201` (`<planFile>`), `:316`/`:317` (`.changeset/<slug>.md`, `.luca/tmp/pr-body-draft.md`). The finalize sequence item 7 (`:474`) is now a per-file `luca claim-verify` loop over real paths. Zero `verify-text`/`verify-file`/`claim-verify gate` literals remain (grep over modes/ → 0). The blocking pre-PR gate can now actually run.

2. **runId never stamped → inert stale-run guard** (cycle-1 MUST-FIX #2) — RESOLVED.
   - `handlers/luca-phase-write-verify.ts:67-72` now routes through `writeVerificationResult({ cwd, slug, result, runId })` instead of the bypassing `writeAtomicFile`. `runId` is sourced from `state.sessionId` (:63-66). The duplicated serialize-and-write logic is gone; `writeVerificationResult` is no longer a dead export (it is the sole production write path). The documented stale-snapshot guard (read-side runId match in verification-result.ts:72-79) can now fire on handler-written results.

## Cycle-1 SHOULD-FIX/NOTE cleanups (all five targeted ones landed)

1. **Forbidden-phrase list interpolation** — RESOLVED.
   - `subagents/executor.ts:40` imports `FORBIDDEN_LANGUAGE_PHRASES`; `:152` renders `${FORBIDDEN_LANGUAGE_PHRASES.length}` + `.map(...).join(', ')` — no re-typed list, no "five"/literal drift.
   - `modes/execute.ts:44` import; `:267-269` digest interpolates `FORBIDDEN_LANGUAGE_PHRASES.map(...)` — the cycle-1 NOTE'd hand-typed fragment is gone. Drift-proof.

2. **Shared `sanitizeControlChars`** — RESOLVED.
   - Extracted to `write-surface/helpers/sanitize-control-chars.ts:15` (single def). `handlers/luca-plan-lint.ts:4` + `handlers/luca-phase-write-verify.ts:12` import it; `grep "function sanitizeControlChars"` over handlers → 0.
   - KNOWN residual: `commands/claim-verify.ts:30` keeps a LOCAL copy — ANNOTATED, not silent (NOTE :20-22, "switch to the shared helper … once it lands"). Confirmed a filed follow-up, NOT a blocker.

3. **`as` cast → schema parse + dead `findCriterion`** — RESOLVED.
   - `helpers/validate-verification-ref.ts:84` uses `VerificationResultSchema.safeParse`; schema-invalid verify.json returns hard `VERIFY_FILE_INVALID` (:87-98). `findCriterion` now CONSUMED at `:104` (was dead); barrel-exported `verification/index.ts:19`.

4. **Stale "four regex checks" doc** — RESOLVED.
   - `commands/write-surface/plan.ts:12` "seven regex checks — four criterion grammar … plus three deliverable-manifest checks"; `:35` description "seven checks: four criterion … plus three deliverable".

5. **`d-01` → `D1` deliverable example** — RESOLVED.
   - `subagents/verifier.ts:116` example uses `id: "D1"`, matching `DeliverableComplianceSchema` (`schemas.ts:79`).

(Cycle-1 SHOULD-FIX on `maskInlineCodeSpans` cross-package dup and the criterion-grammar 6-site restatement are out of the wave-5 fix scope — not re-judged here; they remain filed.)

## NEW findings in the fix delta

FINDINGS:
- [NOTE] claim-verify.ts's annotated-residual `sanitizeControlChars` (commands/claim-verify.ts:30-33) is not merely a duplicate of the shared helper — it has DIFFERENT semantics: it STRIPS control chars (`.replace(/[…]/g, '')`) whereas the shared helper ESCAPES to `\xNN`. When the planned switch happens, claim-verify echo output changes (stripped → escaped). The follow-up that ports it should call out the strip-vs-escape difference so it's a deliberate behavior change, not a silent regression.
- [NOTE] superRefine error messages (schemas.ts:62-64, :70-72) are exemplary DX — state the invariant, the rationale, AND a concrete format example (`deferred-verify:<slug>:<ac-id>`). Positive evidence; no change needed.
- [NOTE] Deferred-gap semantics are restated in three instruction bodies (verification-doctrine.ts:34-39, review.ts:82/:171, finalize.ts:150) plus the executable invariant (schemas.ts:49-74) and aggregation (verification-result.ts:167-183). This is intentional cross-surface restatement (per-subagent instruction text + one executable source of truth), not removable duplication. No action.

## Verified, no issue found

- **Atomic-write port** (writeVerificationResult, verification-result.ts:99-119): CLEAN, not duplicative. Single tmp-then-rename block (:111-114); sibling `.tmp` keeps the rename on one filesystem (no EXDEV, documented :96-97); `rmSync(tmp,{force:true})` cleanup on failure (:116). read/write share `phasePathFor` + `VerificationResultSchema` — no copied parse/path logic.
- **[DEFERRED-VERIFY] capability branch** (verification-doctrine.ts:34-39): reads unambiguously to a cold subagent. :37 cleanly separates (a) what to WRITE (`deferredFollowUp` = deterministic source string), (b) what to RETURN (follow-up request verbatim in structured output), (c) what the ORCHESTRATOR — never the subagent — does (`luca todo add`, muninn persist), and pre-empts the "no todo id" objection. Honors subagent no-MCP discipline. :38 gives the orchestrator-context variant.
- **CRITERION_DEFERRED message** (validate-verification-ref.ts:127-133): helpful — names the criterion id, the follow-up todo when present, and the remediation. All eight ValidationError messages name the failing check + a concrete fix.
- **superRefine gating** (schemas.ts:49-74): fires ONLY on `deferred === true` (`:54` early return); non-deferred payloads parse exactly as before (anti-02 holds).
- **Barrel exports** (verification/index.ts:8,19,21): `VerificationResultSchema`, `findCriterion`, `writeVerificationResult` all exported; new consumers resolve.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
