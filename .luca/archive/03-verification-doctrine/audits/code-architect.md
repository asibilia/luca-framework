PERSPECTIVE: architecture + security (cycle-2 convergence re-review — wave-5 fix delta only)
VERDICT: APPROVE

## Cycle-1 MUST-FIX resolution status (all 5 confirmed genuinely fixed)

1. **[arch] Phantom claim-verify subcommands + CLAIM_VERIFICATION_FAILED envelope — RESOLVED.**
   - review.ts:208 now invokes `luca claim-verify .luca/tmp/review-self-check.md` (single file arg), and review.ts:211 branches on exit code (0 = verified, 1 = at least one claim failed, logger lines only — "no structured envelope"). No `verify-text`/`verify-file`/`gate` subcommands, no CLAIM_VERIFICATION_FAILED.
   - finalize.ts:202, :316–317 use `luca claim-verify <file>` per-file; finalize.ts:204, :320 branch on exit codes ("any non-zero exit blocks"; "no structured envelope"). Resolved, not papered over.

2. **[arch] verify.json template missing required `timestamp`; deliverable id d-01→D1 — RESOLVED.**
   - verifier.ts:127 `timestamp: "2026-01-01T00:00:00.000Z",  // REQUIRED; ISO 8601` is present and flagged REQUIRED. Backed by schema: schemas.ts:104 `timestamp: z.string()` (non-optional).
   - verifier.ts:116 `id: "D1",  // deliverable id from the plan (D<N> grammar)`. Matches schemas.ts:80 JSDoc `(e.g. "D1")`. The d-01 form is gone.

3. **[simplifier] luca-phase-write-verify bypassed writeVerificationResult — RESOLVED.**
   - luca-phase-write-verify.ts:67–72 now routes through `writeVerificationResult({ cwd, slug, result, runId })`. runId stamping + atomic tmp+rename live in one place (verification-result.ts:99–119). Atomicity preserved: write to `${p}.tmp`, then `renameSync` (atomic on POSIX), `rmSync(tmp, { force: true })` on any failure (verification-result.ts:111–118).

4. **[dx] [DEFERRED-VERIFY] told MCP-less subagents to run `luca todo add` — RESOLVED.**
   - verification-doctrine.ts:36–38 is now explicitly capability-branched: subagents (verifier/executor, no MCP) record `deferredFollowUp` as deterministic source string and RETURN the follow-up for the orchestrator to persist ("never the subagent"); only orchestrator-context readers run `luca todo add` directly. Correct producer/consumer split.

5. **[security] validate-verification-ref echoed unsanitized agent-authorable strings + raw `as` cast — RESOLVED.**
   - All echoes routed through `sanitizeControlChars`: criterionId (validate-verification-ref.ts:67), parse error (:75), schema-issue list (:88–97), existing-ids list (:112–117), deferredFollowUp (:129), status (:151). No remaining raw interpolation of agent-authorable strings.
   - Raw `as` cast replaced by `VerificationResultSchema.safeParse(raw)` (:84) → `VERIFY_FILE_INVALID` on failure (:85–99). No silent undefined-field pass.

## New-issue scan on the fix delta (findings)

- **[NOTE] (a) superRefine on VerificationCriterionSchema — sound; does not break valid payloads.**
  schemas.ts:54 `if (criterion.deferred !== true) return` guards every added issue, so any payload without `deferred` (or `deferred: false`) parses identically to pre-fix (anti-02 holds). Verified against the live fixture `.luca/phases/03-verification-doctrine/verify.json` — every criterion has `deferred` absent and `met: true`; none would trip the new refinement. The two issues fire ONLY on `deferred: true` (missing/empty deferredFollowUp → :59; met !== false → :66), the intended new invariant. No regression.

- **[NOTE] (b) atomic write into writeVerificationResult — correct tmp+rename, no partial-write/cleanup bug.**
  verification-result.ts:110 `mkdirSync(dirname(p), { recursive: true })` before write; sibling tmp keeps rename intra-filesystem (no EXDEV); `rmSync(tmp, { force: true })` cleans up on throw and re-throws (:115–118). Reader never observes a half-written file. One residual: concurrent writers to the same phase share the fixed `${p}.tmp` path (last-writer-wins on the tmp), but the pipeline lock (one run per repo) makes concurrent verify-writes structurally impossible — not a correctness issue in this architecture. Noted, not blocking.

- **[NOTE] (c) sanitize-control-chars.ts — sound, no over-stripping.**
  Regex `/[\x00-\x1f\x7f]/g` targets exactly C0 controls + DEL, replacing each with its `\xNN` escape (sanitize-control-chars.ts:16–19). Printable ASCII, whitespace-bearing content (space 0x20), and UTF-8 multibyte sequences pass through untouched. Escapes rather than drops, so ids remain diagnosable in error text. Single source of truth, imported by both handlers + the helper (no drift).

- **[NOTE] (d) runId sourcing from state.sessionId — null-safe.**
  luca-phase-write-verify.ts:63–66 guards with `typeof state.sessionId === 'string' && state.sessionId.length > 0 ? … : undefined`. Matches the schema (state/schemas.ts:96 `sessionId: z.string().optional()`). writeVerificationResult prefers an existing `result.runId` and tolerates `undefined` (verification-result.ts:107 `opts.result.runId ?? opts.runId`), so a missing sessionId degrades to a legacy no-runId result — read path accepts it (verification-result.ts:72–79). Correct.

- **[NOTE] (e) import direction luca-tools→luca-core only — intact.**
  luca-core has zero imports from luca-cli (grep over packages/luca-core: no matches). luca-cli handler imports `writeVerificationResult`/`VerificationResultSchema`/`findCriterion` from `@alecsibilia/luca-core/verification` (correct dependency direction). Barrel re-exports the writer cleanly (verification/index.ts:17–22). No layering violation.

## Evidence cited for APPROVE (≥3 verified locations)
- review.ts:208–211 + finalize.ts:316–320 (claim-verify exit-code branching, MUST-FIX #1)
- verifier.ts:116,:127 + schemas.ts:104 (D1 + required timestamp, MUST-FIX #2)
- verification-result.ts:99–119 (atomic writer routing, MUST-FIX #3)
- verification-doctrine.ts:36–38 (capability branch, MUST-FIX #4)
- validate-verification-ref.ts:67–155 + :84 safeParse (sanitization + cast removal, MUST-FIX #5)

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 5
  CROSS_PHASE_COUNT: 0
