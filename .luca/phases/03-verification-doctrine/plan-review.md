# Plan Review: 03-verification-doctrine

**Status:** APPROVED (round 1)
**Convergence:** CONVERGED
**Blocking:** 0 · **Advisory:** 4
**Reviewer:** plan-reviewer (cold isolation)

## Evidence Basis

**Completeness:** All 6 REQ-03 elements map to deliverables D1–D6 with criterion coverage: evidence-in-block (D1→ac-03/07/08), 8-row probe table matching the spec list exactly (D2, Task 1.1.2), 5-phrase forbidden list matching the spec verbatim (D3→ac-04.1), [DEFERRED-VERIFY] with todo follow-up + cannot-flip gate (D4→ac-01/05/06/16), ReReadCheck (D5→ac-12), manifest with `shipped|missed|partial` compliance (D6→ac-02/09–12). D7 drift fixes are all real and bounded — each verified.

**Factual claims verified against repo:**
- `packages/luca-core/src/verification/schemas.ts:14-27` — no `deferred`/`deferredFollowUp`/`probeType`/`DeliverableComplianceSchema` exists; ac-01.x/ac-02 grep probes fail as-built (discriminate).
- `verifier.ts` stale `luca verification write` refs confirmed at exactly :24/:80/:122 (3 hits → ac-07 count=0 fails as-built); `execute.ts:262` has 1 hit → ac-08.2 fails as-built.
- `verification-result.ts:157-159` — `allCriteriaMet` checks only `blocking` criteria; zero "deferred" occurrences pre-edit (ac-05 discriminates). Task 1.1.3's "blocking gap regardless of met" correctly closes the non-blocking-deferred leak (deferred can never pass allCriteriaMet; `met:false` already hard-blocks the todo gate at `validate-verification-ref.ts:90-95`).
- `validate-verification-ref.ts:23` has `CRITERION_UNMET`, no `CRITERION_DEFERRED` (ac-06 discriminates).
- `finalize.ts:450` currently says `verificationRef: { criterionId, wave }`; `VerificationRefSchema` (`todos/schemas.ts:51-58`) has only `criterionId` — ac-12.3 fix correct, fails as-built. Finalize Step 3 Gap Detection exists at :140-198 with a single Gap Report; ReReadCheck extends rather than duplicates.
- `luca-phase-write-verify.ts:12-18` confirmed `z.record` + stale description (ac-13.3 fails as-built).
- `architect.ts:38,:434` — exactly two line-budget exemption sentences, both currently name only `## Verification Criteria`; zero "Deliverables" hits in architect.ts, plan-lint handler, phase-plan skill, phase-plan command; zero "ReReadCheck" in finalize.ts — every destination-grep criterion discriminates.
- `plan-reviewer.ts:65-73` checklist ends at #9 — "check #10" in Task 1.3.3 is the correct next slot.
- `luca-plan-lint.ts:44,:78` — `maskInlineCodeSpans`/`findVerificationCriteriaSection` precedents exist as claimed.
- `claim-verify.ts:67,:72` sets `process.exitCode` — ac-14's exit-code-unchanged clause is probeable.
- No new CLI verbs needed anywhere; anti-01 baseline-pinned, anti-02 has explicit diff interpretation.

**Dependencies:** Wave 1 ships schema + constant + gate before Wave 2 interpolation and Wave 4 consumers — correct. Tracer-bullet ordering prevents doctrine text shipping before the gate exists.

## Findings (all advisory)

- **G-ARCH-001** [SHOULD-FIX] (Task 1.4.3 / Task 1.1.2, ac-04.1/ac-14): Dependency direction blocks single-sourcing the phrase list. `luca-tools` depends on `@alecsibilia/luca-core`, not vice versa. The 5-phrase list defined in `verification-doctrine.ts` (luca-tools) but Task 1.4.3 implements the scan in `luca-core/src/claim-verifier/claim-verifier.ts` — forcing a second hand-maintained copy; anti-05 covers only verifier/executor, so drift unguarded. **Fix:** export `FORBIDDEN_LANGUAGE_PHRASES` from luca-core (claim-verifier module or verification package) and have the luca-tools doctrine constant interpolate it; pin the import direction in ac-14 or anti-05.
- **G-DX-001** [SHOULD-FIX] (ac-13.2): Probe "invoke handler against a bad fixture" — handler writes directly to the active phase's real `verify.json` (`luca-phase-write-verify.ts:37-39`, no dry-run); a buggy validation clobbers the live artifact mid-verify. **Fix:** probe via `bun -e` importing `VerificationResultSchema.safeParse` on the bad fixture + grep confirming the handler calls safeParse, instead of live handler invocation.
- **G-SCOPE-001** [NOTE] (ac-01/03/04/08/10/12/13/16; D4/D6 mappings): New "(umbrella; met by ac-NN.1–.M)" form must not be conflated with `[SPLIT → ...]` parents (excluded from verify.json per review.ts:80-82) — else deliverable mappings/verificationRefs citing umbrella ids hit `CRITERION_NOT_FOUND`. **Fix:** one sentence in the plan stating umbrellas are live criteria recorded in verify.json with `met` derived from children.
- **G-ARCH-002** [NOTE] (Task 1.1.3, ac-06): Make explicit that the deferred check at the todo gate runs on the found criterion *regardless of `met`* — defends against malformed `deferred:true, met:true` records. Mirror the aggregate side's "regardless of met" wording.

**Recommendation:** approve — fold G-ARCH-001 and G-DX-001 into the executor's task context; no plan revision round required.

---

# Plan Review Round 2: Wave 5 amendment (review-fix cycle)

**Status:** APPROVED · **Convergence:** CONVERGED (B(1)=0, B(2)=0) · **Blocking:** 0 · **Advisory:** 4

**Coverage:** all 5 consolidated MUST-FIX mapped (1.5.1+ac-17+anti-06; 1.5.2+ac-18/ac-20; 1.5.3+ac-19/ac-21.1/ac-22/ac-23; 1.5.4+ac-24); SHOULD-FIXes tasked or explicitly deferred in Decision 8. Every new criterion's pre-state probed against the as-built worktree and discriminates (verify-text=1, gate=4, timestamp=0, writeVerificationResult callers=0, superRefine=0, safeParse=0, 'should work'=1×2, four-regex=1). ID-stability holds (ac-01..16/anti-01..05 untouched; strict append). sessionId verified real (luca-core state/schemas.ts:96 — IS the run id); superRefine fires only on deferred:true branch, no .extend/.pick consumers — anti-02 holds.

**Advisories (fold into wave-5 executor context):**
- **G-DX-001w5**: 1.5.3 Files list omits luca-plan-lint.ts though task text says "both existing copies import" the extracted sanitize helper — add it + ac-21 clause (`grep -c "function sanitizeControlChars" packages/luca-cli/src/write-surface/handlers` → 0).
- **G-ARCH-001w5**: routing through writeVerificationResult swaps writeAtomicFile for plain writeFileSync — Decision 6 must either accept non-atomic (single-writer, lock-guarded) or move the atomic write INTO the core writer (preferred).
- **G-DX-002w5**: deferredFollowUp ordering — verifier writes verify.json before orchestrator creates the todo; superRefine requires the field. Pin: subagent records the deterministic source string `deferred-verify:<slug>:<ac-id>` as the deferredFollowUp value (orchestrator's todo carries the same source — join recoverable).
- **G-SCOPE-001w5**: findCriterion dead export (verification-result.ts:110, zero callers) — fold consumption into the 1.5.3 safeParse rewrite or add to Decision 8.

Nit: ac-17.1's `claim-verify gate`→0 also purges the finalize.ts:15 docstring — harmless, intended.
