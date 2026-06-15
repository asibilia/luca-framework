# Learnings: 03-verification-doctrine — Cycle 1

> **Cycle 1** of 2 (verify PASS, but 4/4 reviewers REQUEST_CHANGES — a fix wave is pending;
> Cycle 2 will extend this file with fix-wave learnings).

## Patterns

### pattern:tracer-bullet-wave-ordering
- **Type:** pattern · **Confidence:** HIGH
- **Content:** Wave 1 wired the full vertical slice of the riskiest semantic (deferred-verify:
  schema fields → aggregateVerificationResults blocking-gap → validate-verification-ref todo gate)
  before ANY instruction text shipped in waves 2-4. plan.md:141 named this explicitly as the
  mitigation for "deferred leaking past gates". Outcome: verify confirmed deferred semantics
  coherent across all consumers (verification-result.ts:149,170-173; validate-verification-ref.ts:95;
  review.ts:82; finalize.ts:149) and zero reviewer findings on deferred *semantics* — all MUST-FIXes
  landed in the instruction-text and write-surface layers built later.
- **Context:** Multi-wave plans where downstream waves write prose that depends on upstream
  enforcement semantics. Wire enforcement first, document second.

### pattern:bun-e-direct-schema-probe
- **Type:** pattern · **Confidence:** HIGH
- **Content:** To verify a write handler rejects bad payloads WITHOUT invoking the live handler
  (which writes to the active phase's real verify.json — no dry-run), probe via
  `bun -e` importing the schema directly (`VerificationResultSchema.safeParse({status:'BOGUS'})`)
  PLUS a grep proving the handler calls safeParse before any write (handler :53 before
  phasePathFor/writeAtomicFile :73-75). Originated as plan-review G-DX-001; used for ac-13.2 and
  ac-10.2 (fixture at /tmp, outside .luca/); both passed verify with this evidence.
- **Context:** Any time a runtime probe of a handler would mutate live pipeline artifacts.
  Schema probe + structural grep of the call ordering substitutes safely.

### pattern:plan-review-directive-injection
- **Type:** pattern · **Confidence:** HIGH
- **Content:** Plan-review SHOULD-FIX gaps (G-ARCH-001: move FORBIDDEN_LANGUAGE_PHRASES to
  luca-core; G-DX-001: safe probing) were folded into executor task context instead of forcing a
  plan-revision round ("approve — fold G-ARCH-001 and G-DX-001 into the executor's task context",
  plan-review.md:34). Both were resolved in-phase by the wave-3/4 executors; G-ARCH-001 worked
  because the workspace dep + subpath export pre-existed (waves/04.md:18).
- **Context:** When a plan-review finding is executor-actionable and prerequisites already exist,
  inject it as a directive into the executor prompt rather than looping the plan.

### pattern:dual-evidence-substitution
- **Type:** pattern · **Confidence:** HIGH
- **Content:** When a runtime probe is stage-gate-blocked in REVIEWING, substitute BOTH
  (1) executor attestation in execute/waves/NN.md AND (2) an independent structural probe
  (read the warn-only/safeParse/exit-code path cited), noting the substitution in verify.json
  notes — never attestation alone. Applied to ac-10.2, ac-13.2, ac-14; all three accepted in a
  PASS verify. This is the doctrine's own fallback (verification-doctrine.ts:28) validated by use.
- **Context:** REVIEWING-step verification of behavior that only manifests at runtime.

## Pitfalls

### pitfall:phantom-cli-capability-in-instruction-bodies
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** THIRD consecutive-phase occurrence of the same class: instruction-body text invokes
  a CLI surface that was never shipped. Phase-03 instance: review.ts:205 and finalize.ts:200,310,
  467,471 invoke `luca claim-verify verify-text/verify-file/gate` subcommands plus a structured
  `code: CLAIM_VERIFICATION_FAILED` envelope, but the shipped CLI is `luca claim-verify <file>`
  only (claim-verify.ts:20-44, cli.ts:25-27) emitting logger lines + exit code. The finalize
  BLOCKING gate cannot run as written. Prior instances: phase-01 docs drift, phase-02 classifier.
  Root cause: instruction bodies (luca-tools) and CLI registration (luca-cli) ship in different
  packages with no contract check between them.
- **Prevention:** Before writing any `luca <verb>` invocation into an instruction body, grep the
  shipped registration (cli.ts + commands/) for the exact verb/subcommand/flags. A lint that
  cross-checks instruction-body `luca ...` strings against registered commands would kill the class.

### pitfall:subagent-capability-blindspot-in-shared-constants
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** Text interpolated into SUBAGENT bodies must be written for the subagent capability
  set. Doctrine [DEFERRED-VERIFY] step 2 (verification-doctrine.ts:36) tells the reader to run
  `luca todo add` — but that handler returns a `mcp__muninn__muninn_remember` instruction the
  caller must execute (luca-todo-add.ts:60-117), and subagents have NO MCP. Result: subagent
  records `deferredFollowUp: "<todo-id>"` in verify.json while the todo silently never persists;
  validateVerificationRef only checks the id string, so nothing detects the loss.
- **Prevention:** Shared constants interpolated into both orchestrator and subagent bodies must
  either be capability-neutral or branch explicitly ("subagents: emit the instruction in your
  structured output for the orchestrator to persist"). Audit every `luca <cmd>` in shared text
  for hidden MCP/orchestrator dependencies.

### pitfall:instruction-template-schema-drift
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** A JSON template in instruction text that an agent copies faithfully MUST be
  schema-complete and use canonical id forms. Two phase-03 instances: (1) verifier.ts:126-138
  verify.json template omits the schema-REQUIRED `timestamp` — and because the verifier writes via
  native Write (bypassing the handler safeParse), a template-faithful file fails
  readVerificationResult safeParse and is SILENTLY treated as absent, defeating the gates the
  phase hardens; (2) verifier example says `id: "d-01"` while the plan grammar mints `D1`
  (architect.ts:215, DELIVERABLE_GRAMMAR `\*\*D\d+\*\*`), leaving finalize's ReReadCheck without a
  deterministic join key.
- **Prevention:** Validate every instruction-body JSON template against the live Zod schema
  (a `bun -e` safeParse of the literal template is cheap); examples must echo producer id grammar.

### pitfall:new-write-surface-bypasses-canonical-writer
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** luca-phase-write-verify serializes parsed.data itself via writeAtomicFile
  (:73-75) instead of routing through luca-core's writeVerificationResult — so the runId stamp
  (the stale-PASS-snapshot guard, verification-result.ts:86-99) is never applied, the guard is
  inert, and the core function has ZERO production callers. Validation passing (safeParse was
  wired correctly) masked the missing side-effect.
- **Prevention:** When adding a CLI/MCP write surface over an artifact that luca-core already
  owns, route through the core writer; then grep that the core writer actually gained a caller.

### pitfall:partial-convention-sweep
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** The phase-02 sanitizeControlChars convention was applied in 2 of 3 new surfaces
  (luca-plan-lint.ts:76, luca-phase-write-verify.ts:21) but skipped in the third
  (validate-verification-ref.ts:66,85,98,108,114,120 echoes unsanitized agent-authorable strings:
  criterionId, deferredFollowUp, status, err.message) → security MUST-FIX. The same file also
  reads verify.json with a raw type cast instead of safeParse, flagged independently by security
  AND dx.
- **Prevention:** When a convention applies to N new surfaces in one phase, enumerate all N in
  the plan and verify the sweep with a grep across every new file, not per-file memory.

### pitfall:documented-invariant-without-schema-enforcement
- **Type:** pitfall · **Confidence:** MEDIUM
- **Content:** schemas.ts JSDoc (:27-32) states deferredFollowUp is REQUIRED and met MUST stay
  false when deferred:true, but no superRefine enforces it — `{deferred:true, met:true}` passes
  the write gate. Consumers defend individually today, but findCriterion returns raw criteria and
  any future met-keyed consumer inherits the bypass. Flagged independently by architecture AND
  security reviewers.
- **Prevention:** If a JSDoc says "REQUIRED when X" or "MUST be false when Y", encode it as
  superRefine at write time — the schema is the single cheapest enforcement point.

### pitfall:generated-bundle-staleness
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** The deployed .claude/hooks/pipeline-guard.ts bundle was stale vs source
  pipeline-transitions in packages/luca-core: it blocked the review→execute fix loop, would block
  learn→finalize at the last phase, and still used the old "milestone" step name. The installed
  dist also lacked the phase-02 `plan lint` verb. Class: source-of-truth drift between package
  source and generated/deployed bundles; the pipeline trusts the bundle, not the source.
- **Prevention:** Rebuild + redeploy (`bun run --filter @alecsibilia/luca build` then redeploy)
  whenever luca-core transitions change; a version/hash stamp in the bundle compared at startup
  would make staleness loud. Todo filed.

## Decisions

### decision:deferred-blocks-regardless-of-met-or-blocking
- **Type:** decision · **Confidence:** HIGH
- **Content:** aggregateVerificationResults treats `deferred: true` as a blocking gap even when
  the record is malformed (met:true) or blocking:false — blockingGaps filter is
  `c.deferred === true || (!c.met && c.blocking)` and allCriteriaMet conjoins
  `every(c.deferred !== true)` (verification-result.ts:149,170-173). Rationale: defense in depth
  at the aggregate layer since the schema does not (yet) enforce the deferred invariants.
- **Context:** luca-core verification aggregation; pairs with CRITERION_DEFERRED returned before
  CRITERION_UNMET regardless of met (validate-verification-ref.ts:95-110, per G-ARCH-002).

### decision:evidence-marker-suppression-heuristic
- **Type:** decision · **Confidence:** MEDIUM
- **Content:** scanForbiddenLanguage suppresses a forbidden-phrase warning when an evidence
  marker sits within ±1 raw line (claim-verifier.ts:354-355,406-410), after maskInlineCodeSpans
  so backticked/fenced phrases never flag; warnings never touch exit code (claim-verify.ts:67-83).
  Verified behavior: prose "should work" flags; backticked/fenced/evidence-adjacent/word-boundary
  cases do not (waves/04.md). Known caveat (dx SHOULD-FIX): `done` and `expected to` with a ±1-line
  window are noisy on ordinary status prose — window widening or claim-shaped-context constraint
  is the likely cycle-2 adjustment.
- **Context:** Advisory-only forbidden-language scanning; tune window before trusting signal rate.

### decision:forbidden-phrases-owned-by-luca-core
- **Type:** decision · **Confidence:** HIGH
- **Content:** FORBIDDEN_LANGUAGE_PHRASES lives in luca-core's claim-verifier (claim-verifier.ts:
  324-330) and luca-tools' VERIFICATION_DOCTRINE interpolates it (verification-doctrine.ts:9,30-32)
  — single source of truth, import direction luca-tools → luca-core only. Resolved IN-phase
  (G-ARCH-001) by the wave-4 executor because the workspace dep and subpath export pre-existed;
  rendered doctrine line byte-identical to the prior hand-listed text.
- **Context:** Constants consumed by both runtime scanners (core) and instruction bodies (tools)
  belong in core; tools interpolates.

## Conventions

### convention:per-task-git-add-commit-at-finalize
- **Type:** convention · **Confidence:** HIGH
- **Content:** Under the v13 stage-gate, STAGE_TOOL_MATRIX denies bash-commit in EXECUTING
  (allowed only IDLE/FINALIZING). Working convention: per-task `git add` of exactly the task's
  files, single commit deferred to finalize. Worked cleanly across all 12 tasks. Known drift: the
  phase-execute skill text still mandates per-task commits, so each executor burned a tool call
  discovering the denial — skill text needs updating to match the matrix.
- **Context:** All EXECUTING-step work in v13 luca-framework.

### convention:orchestrator-persists-subagent-side-channel-writes
- **Type:** convention · **Confidence:** MEDIUM
- **Content:** Subagent executors cannot write .luca/ (confidence logs, checks staging). Working
  protocol this phase: executors return confidence entries in their structured output envelopes
  and the orchestrator persists them via `luca confidence log` (tasks 1.3.2, 1.3.3, 1.4.2, 1.4.3).
  Worked, but is an IMPLICIT protocol — same root capability gap as the doctrine `luca todo add`
  MUST-FIX. Should be formalized in executor body text: "return, don't write".
- **Context:** Any .luca/ side-channel data produced inside a subagent under v13 stage-gating.

## Cycle 2 (review-fix wave + state-recovery)

> **Cycle 2** of 2 (verify PASS — wave-5 fix criteria ac-17..24 + anti-06 met, cycle-1
> ac-01..16/anti-01..05 no regression; BOTH combined reviews APPROVE — 0 MUST-FIX, 0 SHOULD-FIX,
> only NOTEs). All 5 cycle-1 MUST-FIX held under independent re-probe. One non-blocking deviation
> filed as follow-up (STRIP-vs-ESCAPE sanitize divergence, below).

### Patterns

#### pattern:convergence-in-one-fix-wave-from-discriminating-criteria
- **Type:** pattern · **Confidence:** HIGH
- **Content:** Cycle-2 converged in a SINGLE fix wave (no third cycle) because (a) the cycle-1
  acceptance criteria were discriminating enough to pin each MUST-FIX to a concrete locus, and
  (b) each fix criterion (ac-17..ac-24) encoded a verified pre→post DELTA (e.g. "phantom
  claim-verify subcommands removed → shipped `<file>` grammar in review.ts/finalize.ts, envelope
  deleted"; "verify.json template gained required timestamp; d-01→D1"). That made the cycle-2
  re-probe MECHANICAL — re-read the cited locus, confirm the delta, no re-derivation. All 5
  cycle-1 MUST-FIX verified genuinely resolved (not papered over) and 0 new MUST-FIX surfaced.
- **Context:** Review-fix loops. Frame each fix as a testable pre→post delta tied to the original
  finding's locus so the re-review is a confirmation pass, not a fresh audit — this is what keeps
  a fix cycle from spawning another.

### Pitfalls

#### pitfall:luca-state-json-single-mutable-global-clobbered-on-resume
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** `.luca/state.json` is a SINGLE mutable global with no per-pipeline isolation. During
  a multi-day session interruption an unrelated luca milestone ran in the same checkout and
  OVERWROTE state to idle/phase-5-of-5 with a DIFFERENT roadmap; origin/main merges (#296-299)
  landed; and a 99-file `chore(repo): checkpoint` commit (72a3bccdb) froze our phase-03 waves 1-4
  mid-flight. On resume the orchestrator's IN-CONTEXT model (phase 3, wave 5) silently diverged
  from on-disk state, with no warning. Observed downstream symptoms of the drift: (1) executors'
  `luca confidence log --phase 03-...` got MISATTRIBUTED to the active phase-05 (CLI resolves phase
  from state, ignores the --phase arg's intent — see next entry); (2) the stage-gate stopped
  blocking commits (state idle = permissive); (3) a parallel executor found its task "already
  applied in checkpoint 72a3bccdb".
- **Prevention:** On ANY resume after a gap, BEFORE acting, `luca state read` and reconcile it
  against the in-context phase/step. If they diverge, STOP and surface the divergence to the user
  via AskUserQuestion before any state mutation — do not silently re-seed. Never trust the
  in-context state model across a session interruption.

#### pitfall:luca-confidence-log-attributes-to-active-state-phase-not-flag
- **Type:** pitfall · **Confidence:** HIGH
- **Content:** `luca confidence log --phase <X>` attributes the entry to the ACTIVE state.json
  phase, NOT to the `--phase X` argument — the CLI resolves the target phase from state and the
  flag does not override it. Benign when state matches intent; SILENTLY misattributes when state
  has drifted (e.g. an interrupted/clobbered pipeline, see the state-clobber entry). Phase-03
  cycle-2 instance: confidence entries intended for `03-verification-doctrine` landed on the active
  `05-test-policy-reconcile` because state had been overwritten. (Extends the cycle-1 observation
  that subagents cannot write confidence logs at all — here the orchestrator-side write itself
  mis-targets.)
- **Prevention:** Before logging confidence/checks with a `--phase` flag, confirm state.json's
  current phase equals the intended phase (`luca state read`); the flag is not a safety net.

### Procedures

#### procedure:luca-pipeline-state-recovery-after-roadmap-reset
- **Type:** procedure · **Confidence:** HIGH
- **Content:** Recovery sequence to restore an interrupted pipeline after `.luca/state.json` was
  clobbered / the roadmap was reset by an unrelated run. ALL steps are read-only or CLI primitives
  — NEVER hand-edit state.json. Validated on phase-03 cycle-2 (idle/phase-5 + foreign roadmap →
  restored to phase-3 verify): (0) surface the situation to the user via AskUserQuestion BEFORE
  any mutation. (1) git-commit the staged in-flight work as a clean phase commit (state idle =
  commits allowed by stage-gate). (2) `luca roadmap create --file <payload>` re-seeds the correct
  N-phase roadmap; the payload accepts an optional `status?` per phase so completed phases stay
  completed. (3) `luca state set-current-phase --phase-number=<N>` (recovery primitive; marks the
  phase in-progress). (4) `luca state claim-owner --session-id=$CLAUDE_CODE_SESSION_ID` (note the
  env var is `CLAUDE_CODE_SESSION_ID`, NOT `CLAUDE_SESSION_ID`). (5) walk `pipelineStep`
  idle→target via SEQUENTIAL `luca state advance --to-step <step>` calls (each transition is
  validated; NO jumps — e.g. idle→verify took 9 calls). Confirm coherence over the merged tree
  with `bunx --bun tsc --noEmit` (green) before proceeding.
- **Context:** Restoring a Luca pipeline after a state/roadmap wipe from a concurrent or
  interrupted run. The orchestrator owns these mutations; a subagent must NOT run them.

### Conventions

#### convention:combined-perspective-reviewers-for-focused-fix-cycle
- **Type:** convention · **Confidence:** HIGH
- **Content:** For a focused single-wave fix-cycle re-review, two COMBINED-perspective reviewers
  (architecture+security, simplification+dx) were used instead of the 4-5 separate reviewers of
  the full cycle. Proportionate to a narrow fix scope (5 MUST-FIX loci) and converged cleanly:
  both APPROVE, 0 MUST-FIX / 0 SHOULD-FIX, only NOTEs. Audits overwrite cycle-1 at
  audits/{code-architect,code-simplifier}.md.
- **Context:** Re-reviewing a bounded fix wave in luca-framework. Collapse the reviewer set to
  combined perspectives when the change surface is small and already scoped by prior findings;
  keep the full panel for fresh/broad phases.

#### convention:claim-verify-local-sanitize-strip-vs-shared-escape
- **Type:** convention · **Confidence:** MEDIUM
- **Content:** claim-verify.ts intentionally keeps a LOCAL `sanitizeControlChars` that STRIPS
  control chars, whereas the shared helper (extracted in cycle-1, used by
  validate-verification-ref.ts et al.) ESCAPES them. The two have DIFFERENT intended semantics —
  flagged as a reviewer NOTE and filed as a follow-up todo. Non-blocking (verify PASS). The
  follow-up that ports claim-verify onto the shared helper MUST preserve the STRIP behavior (or
  consciously change it), not assume the shared ESCAPE is a drop-in.
- **Context:** Any future consolidation of control-char sanitizers in luca-core/luca-cli. STRIP
  and ESCAPE are not interchangeable; the divergence is deliberate until the follow-up decides.
