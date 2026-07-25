PERSPECTIVE: independence
VERDICT: APPROVE

Cold-isolated adversarial audit of the staged classifier-registry change (classify-bash-command.ts, cli.ts hoist, classify-bash-command.test.ts, classify-bash-command-registry.test.ts). All claims below re-derived from the code, not from any other reviewer's output. (Round 1/2 verdicts were REQUEST_CHANGES; final verdict after Round 3 convergence: APPROVE — see Round 3.)

## Key structural fact the diff's framing hides

`bash-readonly` and `luca-write` have IDENTICAL rows in the enforcement matrix — both are `true` in all five coarse phases (`packages/luca-core/src/state/configs/stage-tool-matrix.ts:41-88`; `luca-write` is even `true` in IDLE despite the "every non-IDLE phase" comments). So for `luca` invocations the read/write verb split is currently enforcement-neutral; the ONLY enforcement effect of this diff is moving nouns from **unrecognized → recognized**: commands that previously classified `bash-mutate` (blocked in PLANNING/REVIEWING/FINALIZING) are now allowed in EVERY phase. The always-allow of `luca-write` is justified in three places by the claim "the CLI self-enforces each verb's per-step phase precondition" (classify-bash-command.ts:201-202, 229-232, 338-340; stage-tool-matrix.ts:21-24). I verified that claim per newly registered command. It is FALSE for `stop`, `start`, and `statusline` — that is where the MUST-FIXes live.

## FINDINGS

- [MUST-FIX] `luca stop` registered in LUCA_TOPLEVEL_WRITE unconditionally force-removes the pipeline lock — now permitted in every gated phase, with zero self-enforcement. `stopCommand` calls `forcePipelineUnlock({ cwd })` and unlinks the runner socket with NO phase precondition and no daemon-liveness requirement (`packages/luca-cli/src/commands/runner.ts:69-76`; `forcePipelineUnlock` = `forceUnlock` on `.luca/lock.json`, `packages/luca-core/src/state/index.ts:103`). Before this diff, `luca stop` fell through to bash-mutate and was blocked in PLANNING/REVIEWING/FINALIZING; after it, any subagent in a read-only review step can delete the concurrency lock that "prevents concurrent runs" and tear down the orchestrator's daemon — pipeline-state mutation from a step whose whole contract is read-only, and a regression of the boundary (previously blocked, now allowed). The self-enforcement premise that justifies `luca-write`'s always-allow does not hold for this command.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:238-239 (registration); packages/luca-cli/src/commands/runner.ts:52-84 (unguarded implementation)
  Suggestion: Remove `start`/`stop` from LUCA_TOPLEVEL_WRITE and add them to the registry test's DELIBERATELY_UNCLASSIFIED set with a rationale comment (they then fall through to bash-mutate, allowed only in IDLE/EXECUTING — matching their operator-lifecycle nature); alternatively keep them registered but add an explicit phase/ownership precondition inside `stopCommand`/`startCommand` before `forcePipelineUnlock`/`runDaemon`, making the self-enforcement claim true.
  Cross-phase: true

- [MUST-FIX] `luca statusline` registered in LUCA_TOPLEVEL_WRITE writes OUTSIDE the repo into harness configuration — now permitted in every gated phase and invisible to path enforcement. `statusline install` writes the bundled script into `~/.claude/` (or ANY directory via `--home /custom/claude/home`) and rewrites `~/.claude/settings.json` (`packages/luca-cli/src/commands/statusline.ts:39-55`), with no phase precondition. Because `classifyLucaCommand` results return `targetPaths: []` (classify-bash-command.ts:524), the hook's path-level deny rules never see the settings.json / arbitrary `--home` write target. Net effect of this diff: an agent in PLANNING/REVIEWING/FINALIZING — previously blocked (bash-mutate fallthrough) — can now modify harness settings from a gated step. Harness-config mutation is exactly the class of write the stage gate exists to stop.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:237 (registration); packages/luca-cli/src/commands/statusline.ts:39-55 (settings.json + --home write)
  Suggestion: Remove `statusline` from LUCA_TOPLEVEL_WRITE and add it to DELIBERATELY_UNCLASSIFIED (it is a one-shot operator setup command like `init` remediation, not an in-pipeline verb), OR keep it registered but surface its output paths in `targetPaths` and gate on them.
  Cross-phase: true

- [SHOULD-FIX] The new registry test forces every cli.ts noun to be classified (invariant 1) but never audits the read/write direction — the exact pressure that produced the two MUST-FIXes above (register-to-make-the-test-pass) will recur on the next noun. Invariant 2 checks only NOUN_VERBS nouns; TOPLEVEL_READ nouns' leaves are never inspected, so a read-classified noun owning a mutating leaf is invisible (existing instance: `telemetry` ∈ LUCA_TOPLEVEL_READ while `telemetry emit` appends to `.luca/telemetry/<runId>.jsonl` — packages/luca-cli/src/commands/telemetry.ts:30-34 vs classify-bash-command.ts:216-222; pre-existing classification, but the new test codifies it unexamined). Likewise nothing pins `luca confidence log → luca-write`, so a future addition of `log`/`check` to LUCA_READ_VERBS fails no test, and the G-ARCH-001 cross-noun-leak warning (classify-bash-command.ts:244-248) is comment-only.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts:60-95
  Suggestion: Add an invariant asserting each (noun, verb) pair where verb ∈ LUCA_READ_VERBS appears in an explicit READ_PAIRS allowlist (and a companion table test pinning `luca confidence log`/`luca budget check` → luca-write via classifyBashCommand), plus a documented-exception list for TOPLEVEL_READ nouns with write leaves (telemetry).
  Cross-phase: false

- [SHOULD-FIX] No disjointness invariant across the three classifier sets. `classifyLucaCommand` resolves NOUN_VERBS before TOPLEVEL_READ before TOPLEVEL_WRITE (classify-bash-command.ts:323-329), so a noun accidentally present in both READ and WRITE silently resolves READ; the registry test's invariant 1 uses set-union membership and would pass. One line: assert pairwise intersection of LUCA_NOUN_VERBS keys, LUCA_TOPLEVEL_READ, LUCA_TOPLEVEL_WRITE is empty.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts:60-73
  Suggestion: Add a disjointness test over the three exported sets.
  Cross-phase: false

- [NOTE] The read/write split inside the luca clause is currently enforcement-neutral: STAGE_TOOL_MATRIX has `bash-readonly` and `luca-write` both `true` in all five phases (stage-tool-matrix.ts:41-88), so comments implying the split gates anything ("Read verbs classify as bash-readonly; write verbs as luca-write", classify-bash-command.ts:209) overstate its effect. The real boundary is recognized-vs-unrecognized. Worth stating explicitly in the file header so future editors don't assume READ_VERBS membership is load-bearing for enforcement.

- [NOTE] Verified-clean items (evidence the APPROVE-side checks were actually run): `luca graph` is pure render-to-stdout, reads no `.luca/` state (packages/luca-cli/src/commands/graph.ts:36-48) — TOPLEVEL_READ correct. `luca status` reads state.json cold or sends a read-only `{cmd:'status'}` to the daemon, whose handler only calls `loadCurrentState` (packages/luca-cli/src/commands/runner.ts:87-121; packages/luca-cli/src/runner/daemon.ts:175-185; `loadCurrentState` is a pure read, packages/luca-core/src/state/helpers/load-current-state.ts:23-40) — TOPLEVEL_READ correct. `confidence read/summary/render/gate` all reduce `readConfidenceJournal` output to stdout with no writes (packages/luca-cli/src/commands/write-surface/confidence.ts:213-307); `confidence log` correctly excluded from READ_VERBS. `budget check` correctly kept out of READ_VERBS because of the lazy `runStartedAt` stamp (classify-bash-command.ts:292-297; single `check` leaf confirmed at packages/luca-cli/src/commands/write-surface/budget.ts:222-224). The CLI_SUBCOMMANDS hoist is side-effect-free: all values remain lazy import thunks and the only module-scope work in cli.ts is the pre-existing `LUCA_VERSION` top-level-await read (packages/luca-cli/src/cli.ts:23-97; packages/luca-cli/src/utils/manifest.ts:17-28). The `-v`≠`--version` guard is correctly pinned by tests (classify-bash-command.test.ts:304-315), and the `hook` exclusion has a bidirectional test (classify-bash-command-registry.test.ts:106-117).

CONSOLIDATED:
  MUST_FIX_COUNT: 2
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 2

## Round 2

VERDICT: REQUEST_CHANGES (fix verified structurally, but one live bypass remains through the help-flag shortcut)

### Round-1 findings — resolution verified

- R1 MUST-FIX 1 & 2 (stop / statusline / start): CONFIRMED FIXED at the registry level. `LUCA_TOPLEVEL_WRITE` is now `{init, vault:init, retro, claim-verify, classify, doctor, repair}` (classify-bash-command.ts:242-250) with a deliberate-exclusion comment stating the self-enforcement invariant (classify-bash-command.ts:229-241). `statusline`/`start`/`stop` appear in no registry, so the bare invocations fall through `classifyLucaCommand` → `undefined` (classify-bash-command.ts:333-339) → unknown-command bash-mutate. Behavioral pin: `luca statusline → bash-mutate` (classify-bash-command.test.ts:342-352).
- R1 SHOULD-FIX (b) disjointness: CONFIRMED REAL. Invariant 4 (classify-bash-command-registry.test.ts:133-155) computes pairwise intersections over the three live exported sets and asserts `[]`; combined with the extended deliberate-exclusion test (registry.test.ts:119-131, now covering `{hook, statusline, start, stop}` against all three sets), re-registration of the excluded nouns fails loudly. The DELIBERATELY_UNCLASSIFIED doc block (registry.test.ts:21-41) states the justification requirement.
- R1 SHOULD-FIX (a) (TOPLEVEL_READ leaf audit, e.g. `telemetry emit` writing `.luca/telemetry/<runId>.jsonl` while `telemetry` ∈ TOPLEVEL_READ): NOT implemented. Assessment: residual, NON-blocking — pre-existing classification untouched by this phase, and telemetry emission is plausibly a deliberate always-allowed channel (agents are instructed to emit telemetry in every phase). Should be closed by documenting it as a deliberate exception + the READ_PAIRS-style invariant, in a follow-up.

### NEW FINDINGS (adversarial re-check of the fixed state)

- [MUST-FIX] The `--version` leg of the help-flag shortcut re-opens gated-phase execution of ALL THREE just-excluded commands. `classifyLucaCommand` returns `bash-readonly` when `--help`/`-h`/`--version` appears ANYWHERE in the tokens (classify-bash-command.ts:327-329). That is sound for `--help`/`-h` — citty 0.2.2 (the resolved version: bun.lock:504; luca-cli depends on ^0.2.0, packages/luca-cli/package.json:9; the 0.1.6 copies are unbuild/mkdist-only, bun.lock:1288-1310) intercepts help flags anywhere in rawArgs and exits before execution (`runMain`, node_modules/.bun/citty@0.2.2/node_modules/citty/dist/index.mjs:387-389). But citty intercepts `--version` ONLY when it is the SOLE argument (`rawArgs.length === 1 && builtinFlags.version.includes(rawArgs[0])`, index.mjs:390), and `runCommand` has no version handling at all (index.mjs:220-247 — it resolves the subcommand and calls `cmd.run`). Concrete bypasses, each classifying `bash-readonly` (allowed in EVERY phase) yet fully executing:
  - `luca stop --version` → `stopCommand.run` executes: `rejectUnknownFlags` explicitly whitelists `version` as a citty builtin (packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts:182-184), so it proceeds to `forcePipelineUnlock` + socket unlink (runner.ts:69-76). The exact mutation R1 MUST-FIX 1 was supposed to block in gated phases.
  - `luca --version stop` → same execution (citty's `findSubCommandIndex` skips the flag and resolves `stop`, index.mjs:268-279); classifier shortcut still fires on `--version` anywhere in `rest`.
  - `luca statusline install --version` → `installSubcommand.run` executes (it calls NO flag rejection at all, statusline.ts:39) → rewrites `~/.claude/settings.json` / arbitrary `--home` dir. The exact mutation R1 MUST-FIX 2 was supposed to block.
  - `luca start --version` → `runDaemon` executes (lock acquisition, foreground block).
  The asymmetry was already half-known: `-v` was excluded from the shortcut for precisely this reason (classify-bash-command.ts:322-326), but the same reasoning was not applied to `--version`, whose citty semantics are sole-argument-only. Note the existing test `luca phase --version → bash-readonly` (classify-bash-command.test.ts:299-301) bakes in the wrong assumption — it is harmless only because noun-group commands with no run/default die with `CLIError('No command specified')` (index.mjs:225); for leaf commands the assumption is false.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:327-329
  Suggestion: Split the shortcut to mirror citty's real semantics: keep `--help`/`-h` anywhere → `bash-readonly`; classify `--version` as read-only ONLY when it is the sole token (`rest.length === 1 && rest[0] === '--version'`), otherwise ignore it and continue noun/verb resolution. Update the `luca phase --version` test expectation and add pins: `luca stop --version → bash-mutate`, `luca --version stop → bash-mutate`, `luca statusline install --version → bash-mutate`, `luca --version → bash-readonly`.
  Cross-phase: false

- [SHOULD-FIX] Only `statusline` got a behavioral classification pin; `luca start` and `luca stop` rely solely on registry-set membership. A future refactor of `classifyLucaCommand`'s fallthrough (e.g. a "known-ish noun" heuristic) could re-admit them without failing any test. Add `luca start → bash-mutate` and `luca stop → bash-mutate` cases beside the statusline pin (classify-bash-command.test.ts:342-352), ideally including the `--version` forms from the MUST-FIX above.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts:342-352
  Suggestion: Extend the "deliberately unclassified" describe block to a table over all three nouns (bare + `--version` forms).
  Cross-phase: false

- [NOTE] The LUCA_TOPLEVEL_WRITE comment now reads contradictorily: paragraph 1 (classify-bash-command.ts:224-227) still asserts members "self-enforce their own preconditions", while `init` — still a member — writes into `~/.claude/` exactly like the now-excluded `statusline` (statusline.ts imports `installStatusline` FROM `../init`). Pre-existing member, so not a regression of this fix wave, but it fails the very invariant the new comment block establishes; the residual class (init/doctor/repair vs the self-enforcement invariant, plus telemetry emit under TOPLEVEL_READ) deserves the follow-up audit R1 SHOULD-FIX (a) describes. Also the two paragraphs should be visually separated so the exclusion list isn't misread as set contents.

- [NOTE] Escalation paths re-checked and found CLOSED for the three nouns (evidence): bare forms → `undefined` → bash-mutate (classify-bash-command.ts:333-339); flag-before-noun `luca --foo stop` → noun resolution still finds `stop` → bash-mutate; verb-position smuggling `luca state stop` → luca-write classification but citty dies with `E_UNKNOWN_COMMAND`/`No command specified` before any handler runs (index.mjs:222-225); `--home=--help`-style embedded flags don't match the shortcut's exact-token test (classify-bash-command.ts:327); redirects force bash-mutate (classify-bash-command.ts:518-523); no `meta.alias` on statusline/start/stop commands, so citty alias resolution offers no alternate token (statusline.ts:69-77, runner.ts:26-121); `-h` anywhere is intercepted by citty before execution (index.mjs:387), so its read-only classification is sound; `luca -v` sole-arg prints version via citty (index.mjs:390) and classifies read-only via the bare-usage branch — consistent. The `ReadonlySet`/`Readonly<Record>` type tightening introduces no runtime change.

CONSOLIDATED (Round 2):
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0

## Round 3

VERDICT: APPROVE — the Round-2 MUST-FIX is RESOLVED; no remaining flag-laundering form found.

### R2 MUST-FIX — resolution verified in code and tests

- Classifier fix CONFIRMED: the shortcut is now split. `--help`/`-h` anywhere → `bash-readonly` (classify-bash-command.ts:328-330); `--version` gets the shortcut ONLY as the sole argument (`rest.length === 1 && rest[0] === '--version'`, classify-bash-command.ts:339-341), with a comment documenting citty 0.2.2's sole-argument asymmetry and naming the `stop → forcePipelineUnlock` bypass explicitly (classify-bash-command.ts:331-338), mirroring the `-v` exclusion note (:324-327).
- Test corrections CONFIRMED: `luca phase --version → luca-write` replaces the false-premise expectation (classify-bash-command.test.ts:303-316); bypass pins `luca stop --version → bash-mutate` and `luca statusline install --version → bash-mutate` landed (:318-329); `luca --version → bash-readonly` pinned (:307-309); bundled R2 SHOULD-FIX closed with `luca start → bash-mutate` / `luca stop → bash-mutate` (:381-388).
- Flag-first form `luca --version stop` re-traced: help check misses, sole-arg version check misses (length 2), noun find is position-independent (`rest.find(t => !t.startsWith('-'))`, classify-bash-command.ts:342) → `stop` → unregistered → `undefined` → bash-mutate. Correct. (No test pin for this specific form — see residual note.)

### Adversarial sweep — remaining laundering forms (all checked against citty 0.2.2 dist and the classifier; none found)

The safety argument is exact-token symmetry: the classifier's shortcut tokens (`--help`, `-h` anywhere; `--version` sole-arg) now EQUAL the token forms citty intercepts before any handler runs (`rawArgs.some(...)` for help, index.mjs:387-389; `rawArgs.length === 1 && includes(...)` for version, index.mjs:390), and both sides use exact string equality. Checked forms:

- `-h` anywhere: sound — citty's builtin help flags are computed from the ROOT command's argsDef (`_resolveBuiltinFlags`, index.mjs:406-418), and the root `main` defines NO args (packages/luca-cli/src/cli.ts:99-107), so both `--help` and `-h` are live builtins intercepted at any position with exit(0) before `runCommand`.
- Combined short flags (`-hx`, `-vh`): exact-match fails on BOTH sides symmetrically — classifier takes noun resolution (→ mutate for excluded nouns), citty does not intercept but the gate has already blocked. Safe.
- `--version=x` / `--help=x`: exact-match fails on both sides. With a noun present → noun classification (mutate for excluded nouns). As the only token (`luca --version=x`) → classifier bare-usage `bash-readonly` (classify-bash-command.ts:344), but citty resolves NO subcommand (`findSubCommandIndex` skips flag tokens, index.mjs:268-279) and `main` has no `run`/default → `CLIError('No command specified')` (index.mjs:225) — usage output only, nothing executes. Read-only classification is factually correct.
- Generalized all-flags invocations (`luca --anything`, `luca -x -y`): same bare-usage/readonly + CLIError-no-execution pairing. Safe.
- `--` separator: citty returns -1 at `--` and never dispatches a subcommand after it (index.mjs:271); classifier either finds the post-`--` noun (→ mutate, conservative) or bare-usage readonly with no execution. Safe.
- Sole `-v`: citty prints version (index.mjs:390); classifier hits bare-usage readonly — consistent, nothing executes.
- Subcommand-level help: irrelevant — the only entry point is `runMain` (cli.ts:109), which checks the FULL rawArgs before `runCommand`; `runCommand` itself has no help/version handling (index.mjs:220-247), and the classifier's anywhere-scope matches `runMain`'s anywhere-scope exactly.
- `rejectUnknownFlags` whitelisting `help`/`version` (run-handler.ts:182-184): now harmless — every form that reaches a handler with `--version` present classifies mutate/luca-write (gated), and `--help`/`-h` forms never reach handlers.
- shell-quote vs bash tokenization: quotes strip identically; env-var literals (`luca $FLAG stop`) classify the literal `$FLAG` token as an unregistered noun → mutate. Conservative. Safe.

### Residual (non-blocking) notes

- [NOTE] The exact-token symmetry silently depends on two properties of the root command: (a) `main` defines no arg named/aliased `help`/`h` (else citty DROPS the `-h` builtin via `_getBuiltinFlags`, index.mjs:419-422, and `luca <leaf> -h` would execute while the classifier still shortcuts it read-only); (b) `main` defines no string-typed root flags (else citty's value-flag skipping, index.mjs:272-274, shifts the subcommand index away from the classifier's noun). Both hold today (cli.ts:99-107 — meta + subCommands only). Worth a one-line guard comment on `main` ("do not add root-level args — the stage-gate classifier's help/version shortcut assumes none") or a tiny test asserting `main` has no args.
- [NOTE] The flag-first bypass form `luca --version stop` is verified-correct in code but not pinned in the test table (only suffix forms at classify-bash-command.test.ts:318-329). One extra `test.each` row would close it.

CONSOLIDATED (Round 3):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
