# Learnings: 01-todo-cli-priority-area

**Status: COMPLETE (cycle 2 fix wave closed).** Cycle 1 review produced 1 MUST-FIX
(SEC-01); the fix cycle executed wave 4, all ac-18..ac-24 verified PASS
(verify.json), and the security auditor re-verdict is APPROVE (0 MUST-FIX,
SEC-06 residual SHOULD-FIX deferred — see Deferred follow-ups). Final tally:
4 waves, 9 tasks, 25 criteria PASS, audits 4× APPROVE.

---

## Pitfalls

### pitfall:citty-commanddef-invariant-generic
- **Content**: citty@0.2.2 `CommandDef<T>` is effectively invariant in T —
  `setup`/`run`/`cleanup` take `CommandContext<T>`, placing T contravariant, so a
  concrete arg def is NOT assignable to `CommandDef<ArgsDef>`. Helpers accepting
  "any command" must be generic: `<TArgsDef extends ArgsDef>(cmd: CommandDef<TArgsDef>)`.
  Otherwise TS2345 at every call site.
- **Evidence**: Task 1.2 wrote `cmd: CommandDef<ArgsDef>` (waves/01.md), failed at
  all 22+ call sites in 2.3, fixed by generic widening (waves/02.md deviation);
  code-architect verified against citty's `index.d.mts:58-74` and endorsed the fix.
- **Confidence**: HIGH

### pitfall:instruction-injection-free-form-interpolation
- **Content**: Interpolating a free-form user string into agent-facing instruction
  text (`instructionForAgent` descriptions) enables instruction injection — a `"`
  in the value escapes the quoted literal and injects imperative text the agent
  follows. Enum/int-gated values are safe to interpolate; free-form values must be
  `JSON.stringify`'d at the interpolation site AND charset-constrained at the
  schema source of truth. Caught only at security review (not plan-review,
  execution, or verify): no automated probe class for injection on new
  free-form fields (test gap, see SEC-06 deferral).
- **Evidence**: SEC-01 MUST-FIX, audits/security-auditor.md cycle 1
  (luca-todo-list.ts:57 pre-fix, exploit PoC fit the 60-char limit); closed in
  wave 4, cycle-2 re-review APPROVE.
- **Confidence**: HIGH

### pitfall:zod-strips-unknown-keys-silent-flag-drop
- **Content**: Under citty + Zod handler schemas, a CLI flag must exist at THREE
  layers — citty arg declaration, handler inputSchema field, and behavior/prose —
  or Zod silently strips it (`safeParse` drops unknown keys) and the flag is a
  documented no-op. Plan tasks adding flags must enumerate all three layers per verb.
- **Evidence**: G-SCOPE-001 BLOCKING in plan-review.md — `todo list` silent-drop
  reproduced pre-execution; fixed in plan rev 2 (Task 2.2 covers all 3 layers,
  new probe ac-10b); ac-10b passed at verify.
- **Confidence**: HIGH

### pitfall:stage-gate-blocks-commits-during-executing
- **Content**: Luca v13 stage-gate denies bash-commit during EXECUTING (commits
  happen at finalize). Executor briefs must state "stage only, commits at
  finalize" up front, otherwise each parallel executor independently burns turns
  discovering the block.
- **Evidence**: waves/01.md — both wave-1 executors hit the denial
  (stage-tool-matrix.ts:62); recorded as deviation 1 in execute/summary.md.
- **Confidence**: HIGH

### pitfall:muninn-recall-lags-fresh-writes
- **Content**: MuninnDB semantic recall has an indexing delay and does not surface
  just-written engrams. Verify fresh writes via direct `muninn_read` by ID, never
  via `muninn_recall`.
- **Evidence**: waves/03.md — ac-17 verification switched from recall to direct
  read-back by ID after recall missed fresh engrams; observed twice this session.
- **Confidence**: HIGH

### pitfall:luca-checks-run-file-bare-array (cycle 2)
- **Content**: `luca checks run --file` expects a bare JSON array
  `[{argv,label}]`, NOT a `{commands:[...]}` wrapper — the flag's help text is
  misleading and the wave-4 executor burned turns on the mismatch. Use the
  bare-array shape until the help text / payload contract is fixed.
- **Evidence**: waves/04.md ops-note deviation (direct executor observation while
  running the ac-21 checks gate); follow-up filed under Deferred.
- **Confidence**: MEDIUM

## Patterns

### pattern:rawargs-token-scan-for-unknown-flags
- **Content**: Under citty (`strict: false`), detect unknown flags by scanning
  `rawArgs` tokens — not by diffing parsed keys — because citty auto-aliases
  camelCase/kebab-case making key-diff fragile. Scan: extract `--flag` tokens,
  split `--flag=value`, retry `--no-` negation, stop at bare `--`, ignore short
  flags/positionals; allow declared keys + both case variants + declared aliases
  + built-in help/version. Known boundaries (recorded, acceptable for a typo
  guard): short flags pass through; flags before the subcommand token never reach
  leaf rawArgs (AR-03).
- **Evidence**: run-handler.ts:173-231; ac-09/ac-12 live probes pass; plan-reviewer
  approved design round 2; all 4 auditors verified internals with no MUST-FIX.
- **Confidence**: HIGH

### pattern:two-layer-injection-defense (cycle 2)
- **Content**: Close instruction-injection seams with two INDEPENDENT layers:
  (1) charset constraint at the schema source of truth (one shared exported
  schema, e.g. `TodoAreaSchema` kebab regex, consumed by the storage schema +
  every handler inputSchema) and (2) `JSON.stringify` at the interpolation site
  so quotes/backslashes can never terminate the emitted literal. Either layer
  alone survives the other's relaxation; the shared export prevents
  per-consumer regex drift (G-ARCH-002: one export, not 4 copies).
- **Evidence**: Wave 4 SEC-01/SEC-02 closure — schemas.ts:44-49 + barrel +
  3 handlers; luca-todo-list.ts:58 JSON-quoted interpolation; ac-19/ac-20 PASS
  (`--area 'x"y'` rejected at runtime); security auditor cycle-2 APPROVE verified
  both layers against staged code and grep-confirmed the single source of truth.
- **Confidence**: HIGH

### pattern:rerun-shared-gate-after-parallel-wave
- **Content**: Parallel wave executors sharing one typecheck gate see transient
  cross-task failures (another task's mid-flight breakage). Do not judge task-level
  claims on mid-wave gate runs — re-run the gate once after the wave settles, and
  treat that run as authoritative.
- **Evidence**: waves/02.md — 2.4/2.5 observed 2.3's in-flight TS2345 breakage;
  repo-wide gate re-verified exit 0 post-wave; verify.json confirms.
- **Confidence**: HIGH

### pattern:positive-grep-for-prose-replacement
- **Content**: Absence-only acceptance criteria ("grep finds no X") pass on
  deletion-without-replacement. When the task is replace-not-delete, pair the
  absence grep with a positive grep asserting the replacement content exists.
- **Evidence**: G-SCOPE-002 advisory in plan-review.md; ac-14 amended with positive
  grep for first-class flags in gh-issue-triage prose; passed at verify.
- **Confidence**: HIGH

### pattern:capture-live-probes-during-executing
- **Content**: Runtime CLI probes cannot be re-run in REVIEWING (stage-gate
  classifies script execution as bash-mutate; the linked binary is stale vs staged
  sources). Capture live probe transcripts in wave files DURING EXECUTING so the
  verifier can pair executor-attested probes with static line-level verification.
- **Evidence**: verify.json notes — ac-08/09/10b/12 met via static chain + recorded
  probes; dist predated staged sources by ~5h. Reused successfully in wave 4
  (ac-20/ac-24 probes recorded in waves/04.md).
- **Confidence**: MEDIUM (worked across both cycles of this phase)

## Decisions

### decision:backfill-via-direct-muninn-batch
- **Content**: Backfilled 10 MuninnDB-backed todos via direct
  `muninn_remember_batch` mirroring the CLI's canonical emitted payload exactly,
  instead of 10 per-todo `luca todo update` round-trips. Acceptable when (a) the
  CLI route is already live-probed end-to-end (same schema, same instruction) and
  (b) bodies are argv-hostile (2-4KB, quoting hazards; .luca/tmp is .json-only).
  Full-payload resend is mandatory — update is full-replace.
- **Evidence**: waves/03.md deviation; ac-17 verified via direct read-back.
- **Confidence**: MEDIUM

### decision:sec-06-regression-guard-deferred (cycle 2)
- **Content**: SEC-06 (no automated regression guard pinning the closed SEC-01
  injection seam — neither the TodoAreaSchema charset nor the JSON.stringify
  interpolation has a test) is deliberately deferred: repo convention forbids new
  test files until the dedicated testing re-introduction effort (no-tests rule).
  Interim evidence is the wave-4 probe record in waves/04.md; the future testing
  effort should add the schema-reject + JSON-quoted-interpolation tests the
  auditor specified.
- **Evidence**: SEC-06 SHOULD-FIX in audits/security-auditor.md cycle 2
  (non-blocking, verdict APPROVE); deferral rationale = repo no-tests convention.
- **Confidence**: MEDIUM

---

## Cycle 2 summary (fix wave)

- Wave 4 (single executor, 4.1 → 4.2): SEC-01 fixed two-layer
  (`JSON.stringify` at luca-todo-list.ts:58 + shared `TodoAreaSchema` kebab
  charset at schemas.ts:44-49, used by TodoSchema + all 3 handlers); SEC-02
  closed by the same schema layer; AR-01 fixed (`[...TodoPriority.options]` at
  todo.ts ×3, zero literal arrays); full-replace warning consolidated to one
  statement per file naming priority+area, real field descriptions restored.
- ac-18..ac-24 all PASS (verify.json); security auditor cycle-2 re-verdict
  APPROVE, 0 MUST-FIX — both fix layers independently verified against staged
  code, no new seams introduced by the wave-4 changes.
- Advisories folded into the wave: G-ARCH-002 (shared schema export),
  G-DX-006 (ac-22 phrasing), G-SCOPE-003 (all 9 stored area values re-parse OK;
  injection value rejected).

## Deferred follow-ups (carry forward)

1. **AR-02 / DX-02** — converge `--status` on citty `type:'enum'` (add + list)
   matching the new `--priority` style; follow-up todo to be filed.
2. **SEC-06** — automated regression guard for the injection seam (schema-reject
   + JSON-quoted interpolation tests); blocked on the dedicated testing effort.
3. **G-DX-005** — plan.md frontmatter criteria count off-by-one (24 vs actual 25
   incl. ac-10b); cosmetic — plan.md not writable at execute step. Verifiers
   should count by criterion ID, not frontmatter.
4. **dx follow-up** — `luca checks run --file` help text vs actual bare-array
   payload shape (see pitfall:luca-checks-run-file-bare-array).

## Process observations (not persisted)
- Plan-review converged B(1)=1 → B(2)=0 in 2 rounds; its one BLOCKING finding
  (G-SCOPE-001) prevented shipping a silent-drop bug.
- Review→fix cycle converged in one wave: 1 MUST-FIX + 2 SHOULD-FIXes closed,
  re-audit APPROVE, no new findings introduced by the fixes.
- Reviewer overlap was healthy: dx-advocate and code-simplifier independently
  flagged the full-replace warning duplication; both resolved by the
  consolidation in 4.2 (ac-23/ac-24).
