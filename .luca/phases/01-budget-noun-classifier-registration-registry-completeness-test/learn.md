# Learnings — Phase 01: budget noun classifier registration + registry-completeness test

Outcome: PASSED — 16/16 criteria across three verify passes (reviewFixIteration 2), review converged round 3, 167 tests green (96 behavioral + 71 registry). Complexity MODERATE.

## 1. Classification is permission: registering a noun must track self-enforcement, not just read/write nature

- **Type:** pitfall · **Concept:** `pitfall:allowlist-classification-is-permission` · **Confidence:** HIGH
- **Conjectured:** "Registering is safer than excluding" (research/context.md D1: statusline/start/stop → LUCA_TOPLEVEL_WRITE "avoids future hook blocks").
- **Refuted by:** Two reviewers independently found the same MUST-FIX (audits/code-architect.md R1; audits/independence-auditor.md R1): `luca-write` is allowed in every non-IDLE phase ONLY because of the invariant "the CLI self-enforces per-step phase preconditions" (stage-tool-matrix.ts:21-24). That invariant is false for `stop` (unconditional `forcePipelineUnlock`, runner.ts:69 — a subagent in REVIEWING could delete the pipeline lock), `start` (foreground hang holding the lock), and `statusline` (rewrites `~/.claude/settings.json`, outside repo, invisible to path enforcement since `targetPaths: []`). Registration PROMOTED them from blocked (bash-mutate fallthrough) to allowed everywhere.
- **Learned:** In a gate where "unrecognized" defaults to blocked, adding a command to an always-allowed class is a permission grant. Correct classification requires verifying the command self-enforces its preconditions (e.g. has a WRITE_COMMAND_PHASES entry / runWriteHandler path); commands that don't must stay deliberately unclassified with documented rationale. Independence auditor's framing: the read/write split was enforcement-neutral — the real boundary is recognized-vs-unrecognized.
- **Criterion now:** Before adding any noun to LUCA_TOPLEVEL_WRITE, check WRITE_COMMAND_PHASES/self-enforcement; the registry test's DELIBERATELY_UNCLASSIFIED set ({hook, statusline, start, stop}) is pinned bidirectionally (registry.test.ts:119-131) so re-registration without justification fails CI. Residual: init/doctor/repair predate the invariant and overstate it (architect R2 note) — reconcile when per-noun disposition lands.

## 2. Shortcut/interceptor symmetry: a classifier shortcut must exactly mirror the runtime's interception semantics

- **Type:** pitfall · **Concept:** `pitfall:classifier-shortcut-runtime-asymmetry` · **Confidence:** HIGH
- **Conjectured:** `--help`/`-h`/`--version` anywhere in argv is safe to classify `bash-readonly` because the CLI framework intercepts them before execution.
- **Refuted by:** Independence R2 MUST-FIX: citty 0.2.2 intercepts `--version` ONLY as the sole argument (index.mjs:390); `luca stop --version` fully executes `forcePipelineUnlock` while classified read-only — reopening in one flag exactly what the round-1 fix closed. The `-v` exclusion already encoded this reasoning; it wasn't applied to `--version`.
- **Learned:** A static classifier granting a permissive class based on "the runtime won't execute this" must token-for-token mirror the runtime interceptor's semantics (anywhere-scope vs sole-arg, exact string equality). Any scope mismatch between classifier and interceptor is a laundering channel. The round-3 safety argument is exact-token symmetry, verified against citty dist.
- **Criterion now:** Bypass pins in classify-bash-command.test.ts (`luca stop --version → bash-mutate`, `luca statusline install --version → bash-mutate`, sole `luca --version → bash-readonly`). Fragile dependency flagged (independence R3): symmetry silently assumes root `main` never gains args (an arg named `help`/`h` drops citty's builtin; a string-typed root flag shifts subcommand index) — add a guard comment/test on `main`; also pin flag-first `luca --version stop` (code-correct, unpinned).

## 3. Verification probes: structural parse beats single-line grep; beware quote-nesting layers

- **Type:** pitfall · **Concept:** `pitfall:single-line-grep-probe-fragility` · **Confidence:** HIGH
- **Conjectured:** `grep -F "new Set(['hook'])"` is a sufficient probe to pin the exclusion set (ac-09.1); all probes verified falsifiable pre-plan.
- **Refuted by:** After the review fix grew the set to 4 nouns, the literal legitimately became a multi-line `new Set([...])` — the grep failed on correct code (signal-digest: ac-09.1 probe redefinition). Two further harness iterations were burned on JSON→`bash -c`→command-substitution quote-escaping failures, not code failures.
- **Learned:** Single-line fixed-string greps are brittle against legitimate formatting/multi-line literals; they pin syntax, not shape. For shape assertions (set contents, key lists), a structural parse probe (`bun -e` extracting and comparing actual members) is sturdier and survives reformatting. Also: every extra shell-quoting layer in probe plumbing is a failure mode of its own — prefer probes that minimize nesting.
- **Criterion now:** ac-09.1 was coordinator-sanctioned redefined to a `bun -e` structural parse requiring exactly {hook, start, statusline, stop}; when writing plan criteria, reserve grep for single-token symbol presence and use structural/runtime probes for anything with internal structure. (Related pre-existing trap, plan-review G-DX-001: `grep -c` prints 0 but exits 1 on zero matches — compare stdout, not exit code.)

## 4. Registry-completeness tests force explicit dispositions and lock them bidirectionally

- **Type:** pattern · **Concept:** `pattern:registry-completeness-test-with-pinned-exclusions` · **Confidence:** HIGH
- **Conjectured:** Classifier/CLI drift (budget unregistered, confidence verbs stale) is a recurring silent failure class fixable only by vigilance.
- **Refuted by:** (Positive refutation of the vigilance assumption.) The completeness test — inv-1 union coverage with a pinned DELIBERATELY_UNCLASSIFIED set, inv-2 sorted-array verb EQUALITY (both drift directions), inv-3 dead-entry converse, inv-4 pairwise disjointness (added after two reviewers independently flagged that resolution order makes dual membership silently dead) — mechanically catches every drift direction. Test-quality auditor verified inv-1 fails by name on the original budget gap. The test's very existence forced the scope question (what to do with 6 unregistered nouns) into an explicit user decision, and then forced the security reversal to be documented in the exclusion set rather than made silently.
- **Learned:** When binding two hand-maintained registries, the high-leverage design is: union-completeness + equality (not subset) + converse (dead entries) + disjointness + a pinned, commented exclusion set asserted absent from all registries. The exclusion set converts "gaps" into reviewable decisions with rationale. Remaining hole (accepted, tracked): disposition correctness — a read-classified noun owning a mutating leaf (telemetry emit) or a future mutating verb named `summary`/`gate` (G-ARCH-001) passes all invariants; needs a per-(noun,verb) disposition manifest in a future phase.
- **Criterion now:** classify-bash-command-registry.test.ts (71 tests) fails CI on any drift direction; exclusion growth requires an in-file justification comment.

## 5. Test expectations can encode false premises — correcting a baseline test is sometimes the fix

- **Type:** pitfall · **Concept:** `pitfall:test-expectation-encodes-false-premise` · **Confidence:** MEDIUM
- **Conjectured:** Existing green tests are correctness anchors; anti-03 said "no existing case modified or removed."
- **Refuted by:** The pre-existing case `luca phase --version → bash-readonly` (classify-bash-command.test.ts:299-301 pre-fix) asserted the exact bypass bug — it baked in the false "citty intercepts --version anywhere" premise and was harmless only by accident (noun-group commands die on CLIError). Fixing learning #2 REQUIRED changing this baseline expectation to `luca-write`.
- **Learned:** A regression-guard criterion like "no existing test modified" needs an escape hatch: when an audit falsifies the premise an old expectation encodes, the sanctioned move is a documented, minimal correction — split the block, preserve the still-valid assertions verbatim, move the corrected assertion to a dedicated test with a comment citing the falsified premise. verify.json anti-03 recorded this as a sanctioned deviation while the operative clause (≥25 pass, 0 fail) still held.
- **Criterion now:** When a reviewer disproves a classifier/runtime assumption, grep the test suites for every occurrence of the implicated token (the verifier did a stale-expectation sweep of all `--version` occurrences) before declaring the fix complete.

## 6. Decision: statusline/start/stop stay deliberately unclassified (partial reversal of D1 close-all-gaps)

- **Type:** decision · **Concept:** `decision:luca-classifier-deliberate-exclusions` · **Confidence:** HIGH
- **Conjectured:** User's D1: register all 6 unregistered nouns (close all gaps), exclusion set = {hook} only.
- **Refuted by:** Round-1 MUST-FIXes (2/3 reviewers confirmed): the three nouns lack CLI self-enforcement (learning #1), so registering them widened the gate.
- **Learned:** Documented deviation, security-grounded: exclusion set is now {hook, statusline, start, stop} with per-noun rationale comments (registry.test.ts:30-41) and the invariant written at the source (classify-bash-command.ts:229-241). `status` stayed TOPLEVEL_READ; budget/confidence/graph shipped as decided. User scope decisions are reversible mid-phase when review produces MUST-FIX evidence — but the reversal must be recorded in verify.json notes + exclusion comments, not made silently.
- **Criterion now:** Behavioral pins `luca statusline`/`luca start`/`luca stop → bash-mutate`; bidirectional exclusion test fails on unjustified re-registration.

## Signal Synthesis

From the orchestrator-injected signal digest:

- **Recurring failure theme — probe infrastructure, not code:** all three inter-iteration harness stumbles were probe-side (ac-09.1 multi-line-literal grep failure + two bash quote-nesting failures); code itself passed 15/15 each iteration. Verification-probe fragility was this run's dominant friction source → learning #3.
- **Recurring failure theme — permission-widening under review:** both negative review rounds trace to one root cause (classification-as-permission for non-self-enforcing commands), first as direct registration (round 1), then re-opened through the --version shortcut (round 2). Same systemic issue in two guises → learnings #1 and #2; promoted as cross-cutting.
- **Valence trend:** verify and checks steps positive throughout (3× each); review negative ×2 converging positive at round 3 — the multi-round adversarial review was the value driver, not friction: each negative round found a real, confirmed bypass. Confidence gate all-auto (3 entries) — no low-confidence dips.
- **Cross-cutting pattern:** the completeness test surfaced the scope question at discuss time and then absorbed the review reversal as documented exclusions — evidence that binding tests convert silent drift into explicit decisions (learning #4).
- **Note-for-learner absorbed:** classifier/citty symmetry's silent dependence on an args-free root `main`, and the unpinned flag-first `luca --version stop` form, folded into learning #2's criterion.
