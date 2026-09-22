# Plan: resolve stage-gate/finalize contract contradiction

## Objective
Make the finalize step's instructed actions legal under the stage gate, close the soundness
holes that investigation exposed, and pin every new permission grant with a test that fails if
the grant widens beyond its stated intent.

## Context

Research + context.md are locked. One empirical question was open; it is now settled.

**Investigation finding — subagents are NOT bystander-exempt (confidence: HIGH, live probe).**
`.luca/state.json` `ownerSessionId` = `4a3a403f-22b7-49af-b13f-ecf7109b4bf4`, which is this
planning subagent's own session id. A `Bash` call issued from this subagent was BLOCKED:
`stage-gate BLOCK: Bash (category=bash-mutate) is not allowed in phase=PLANNING`. A subagent
therefore inherits the parent `session_id` and is subject to the matrix. (Independently
reproduced by the reviewer subagent, which carries the same id.)

**Consequence (adapts D1a).** Context.md's premise that "executor commits depend on the
bystander exemption" is false. Moving `git add` into `GIT_COMMIT_SUBCOMMANDS` would newly
BLOCK bare `git add` in EXECUTING (`bash-commit: false`), tightening a call executors make
today. Per the phase's own escape hatch, the plan takes the third listed option: a **distinct
`bash-stage` category** — `true` in EXECUTING (preserves today) and FINALIZING (fixes the bug),
`false` in PLANNING/REVIEWING (preserves today).

**Severity is load-bearing.** `maxCategory` is `SEVERITY[a] >= SEVERITY[b] ? a : b`
(`classify-bash-command.ts:384-386`) — ties keep the FIRST-seen. `bash-stage` must therefore sit
strictly below `bash-mutate`, not merely below `bash-commit`; a tie at tier 1 would let
`git add . && rm -rf build` stay `bash-stage` and ride into FINALIZING, where `bash-mutate` is
denied. This requires renumbering `SEVERITY`, not just inserting a key.

`TMP_FILE_RE` is widened to accept `.md` rather than forcing the PR body into `.json` — a PR
body is markdown, and a regex fix reaches existing installs without a rebuild.

**Deploy note:** `finalize.ts` is an instruction body. Its fix reaches users only via
`bun run build` + a `luca init` re-run. Do NOT attempt that deploy in this phase.

## Phases

### Phase 1: contract repair

#### Wave 1: Tracer bullet — a changeset write becomes legal in FINALIZING
- [ ] **Task 1.1.1**: Add a `release-artifact` write-path class matching `.changeset/*.md`,
  recognized before the `'code'` fallback, excluding `README.md` and `config.json`; add the
  matching `ToolCategory` column; extend the exhaustive `pathClassToToolCategory` switch. Grant
  it in EXECUTING as well as FINALIZING — `STAGE_TOOL_MATRIX.EXECUTING['code-write'] === true`
  today, so a FINALIZING-only grant would newly block a write that is legal now.
  - Files: `packages/luca-core/src/luca-dir/helpers/classify-write-path.ts`,
    `packages/luca-core/src/state/configs/stage-tool-matrix.ts`,
    `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`,
    `packages/luca-core/src/state/helpers/is-tool-allowed.test.ts`
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05.1, ac-05.2, ac-19, anti-01, anti-02

#### Wave 2: Widen the remaining blocked finalize paths
*(1.2.4 → 1.2.1 sequential — they share two files; 1.2.2 / 1.2.3 run parallel to both.)*
- [ ] **Task 1.2.1**: Add a `bash-stage` ToolCategory and reclassify `git add` into it, `true`
  in EXECUTING/FINALIZING/IDLE and `false` in PLANNING/REVIEWING, with a code comment justifying
  the grant as "staging is not committing, and finalize must stage the changeset it authored".
  Renumber `SEVERITY` to `bash-readonly:0, bash-stage:1, luca-write:2, bash-mutate:2,
  bash-commit:3, denied:4` — `bash-stage` strictly below `bash-mutate`, while PRESERVING the
  deliberate `luca-write === bash-mutate` shared tier documented at `:374-377`. Bumping only
  `bash-mutate` would satisfy the stage ordering but flip `luca checks run && rm -f x` from
  `luca-write` to `bash-mutate`, tightening a call legal in every non-IDLE phase today. The new branch MUST keep
  the `lastNonFlag(rest)` target extraction the mutate branch does today (`:490-498`) — the
  commit branch returns `targetPaths: []` and is the wrong template; the hook's always-denied
  path check at `:260-268` consumes those targets.
  - Files: `packages/luca-cli/src/hook/helpers/classify-bash-command.ts`,
    `packages/luca-core/src/state/configs/stage-tool-matrix.ts`,
    `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`,
    `packages/luca-core/src/state/helpers/is-tool-allowed.test.ts`
  - Verification: ac-07, ac-08.1, ac-08.2, ac-09, ac-19, ac-21.1, ac-21.2, ac-21.3, ac-21.4,
    ac-21.5, anti-03, anti-04, anti-07, anti-08, anti-09
  - Dependencies: 1.1.1, 1.2.4
- [ ] **Task 1.2.2**: Widen `TMP_FILE_RE` to accept `.md` alongside `.json`, keeping the anchor
  on `.luca/tmp/<kebab-name>.<ext>` with no traversal. It has a second consumer,
  `is-valid-luca-path.ts:108`, so this intentionally legalizes `.luca/tmp/*.md` in the path
  contract too — desired, not incidental. Update that file's now-stale error string at `:111`
  ("<kebab-name>.json handoff files") to name both extensions.
  - Files: `packages/luca-core/src/luca-dir/constants.ts`,
    `packages/luca-core/src/luca-dir/helpers/is-valid-luca-path.ts`
  - Verification: ac-10, ac-22, anti-05
- [ ] **Task 1.2.3**: Add the five genuinely missing `WRITE_COMMAND_PHASES` entries, each with
  value `[]` (phase-agnostic): `state claim-owner`, `state set-current-phase`, `snapshot
  create`, `snapshot diff`, `budget check`. A wrong non-empty value is pipeline-fatal —
  `runWriteHandler` hard-exits on a mismatch, and the hook itself invokes `state claim-owner`
  (`handle-stage-gate-hook.ts:140`) in ANY phase. The `confidence read|summary|render|gate`
  verbs are already in `LUCA_READ_VERBS`, and no `rules` verb writes, so none need an entry.
  - Files: `packages/luca-core/src/state/configs/step-artifacts.ts`
  - Verification: ac-11.1, ac-11.2
- [ ] **Task 1.2.4**: Export the three probe-required module-private symbols —
  `bashCategoryToToolCategory` (`handle-stage-gate-hook.ts:537`), `LUCA_READ_VERBS`
  (`classify-bash-command.ts:259`), and `SEVERITY` (`classify-bash-command.ts:372`). anti-03,
  ac-18.2, and ac-21.x respectively cannot run without them. Pure re-export, no behavior change,
  depends on nothing — it must land BEFORE 1.2.1, whose verification calls anti-03.
  - Files: `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`,
    `packages/luca-cli/src/hook/helpers/classify-bash-command.ts`
  - Verification: ac-20.1, ac-20.2, ac-20.3

#### Wave 3: Correct the phantom prose
- [ ] **Task 1.3.1**: [DROPPED — folded into 1.2.4; see decisions 2026-07-20]
- [ ] **Task 1.3.2**: Correct four phantom claims in the finalize instruction body: `luca
  repo-cleanup apply-fix` (`:159`) and the `luca repo-cleanup` surface reference (`:43`) →
  `luca repo cleanup-apply` (the bare prose "repo-cleanup actions" at `:416` is correct English
  and already cites the real verb — leave it); the three `luca preferences consult
  --section …` lines (`:306-308`) collapse to bare `luca preferences read` — `preferences read`
  declares NO args and `rejectUnknownFlags` hard-exits 1 on `--section`, so do not invent it;
  and BOTH `luca rules suggest` write-claims — `:22` ("promote recurring pitfalls to draft
  .luca/rules/*.ts templates") and `:286` ("renders draft `.luca/rules/*.ts` templates"). It
  performs no filesystem write; it prints markdown to stdout (`rules.ts:122-134`). ac-12.1
  matches both lines today and fails until both are reworded. Invent no CLI surface.
  - Files: `packages/luca-tools/src/artifacts/modes/finalize.ts`
  - Verification: ac-13, ac-14, ac-12.1, ac-12.3

#### Wave 4: Pin every grant (disjoint test files, fully parallel)
- [ ] **Task 1.4.1**: Add `.changeset` cases to the write-path suite: `.changeset/foo.md`
  matches, `.changeset/README.md` and `.changeset/config.json` do not.
  - Files: `packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts`
  - Verification: ac-15.1, ac-15.2
  - Dependencies: 1.1.1
- [ ] **Task 1.4.2**: Add explicit hook decisions for a `.changeset/*.md` write — allow in
  FINALIZING and EXECUTING, block in PLANNING and REVIEWING — plus `.luca/tmp/pr-body-draft.md`.
  - Files: `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.test.ts`
  - Verification: ac-16.1, ac-16.2
  - Dependencies: 1.1.1, 1.2.2
- [ ] **Task 1.4.3**: Pin the compound `git add . && git commit -m x` max-merge to
  `bash-commit`, bare `git add` to `bash-stage` with its target preserved, the
  `git add . && rm -rf build` tie case to `bash-mutate`, and `luca rules suggest` as read-only.
  - Files: `packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts`
  - Verification: ac-17.1, ac-17.2, anti-06
  - Dependencies: 1.2.1, 1.2.4
- [ ] **Task 1.4.4**: Add a completeness invariant test scoped to `LUCA_NOUN_VERBS`: every
  `<noun> <verb>` pair whose verb is absent from `LUCA_READ_VERBS` must have a
  `WRITE_COMMAND_PHASES` key (absence is a silent skip, never a deny). After Task 1.2.3 the
  exemption list is empty — add no dead exemption.
  - Files: `packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts`
  - Verification: ac-18.1, ac-18.2
  - Dependencies: 1.2.3, 1.2.4

## Deliverables
- **D1**: Core fix — narrow `.changeset/*.md` path class, matrix column, hook switch, `git add` reclassification, `.luca/tmp` extension mismatch → ac-01, ac-02, ac-03, ac-04, ac-05.1, ac-05.2, ac-07, ac-08.1, ac-08.2, ac-09, ac-10, ac-19, ac-21.1, ac-21.2, ac-21.3, ac-21.4, ac-21.5, ac-22
- **D2**: Pin untested load-bearing behavior — compound max-merge, explicit `.changeset/*.md` FINALIZING decision, pr-body-draft path → ac-15.1, ac-15.2, ac-16.1, ac-16.2, ac-17.1, ac-17.2
- **D3**: Phantom verbs in `modes/finalize.ts` corrected or dropped → ac-13, ac-14, ac-12.3
- **D4**: `WRITE_COMMAND_PHASES` completeness plus a guard test → ac-11.1, ac-11.2, ac-18.1, ac-18.2
- **D5**: `luca rules suggest` misclassification resolved — the classifier is correct, the finalize prose was wrong → ac-12.1, ac-20.1, ac-20.2, ac-20.3, anti-06

## Verification Criteria
- **ac-01**: `bun -e` calling `classifyWritePath('.changeset/happy-cats-sing.md')` returns class `release-artifact`.
- **ac-02**: `bun -e` calling `classifyWritePath('.changeset/README.md')` returns class `code`.
- **ac-03**: `bun -e` calling `classifyWritePath('.changeset/config.json')` returns class `code`.
- **ac-04**: `bun -e` importing `STAGE_TOOL_MATRIX` asserts `FINALIZING['release-artifact'] === true`.
- **ac-05**: [SPLIT → ac-05.1, ac-05.2]
- **ac-05.1**: `bun -e` importing `STAGE_TOOL_MATRIX` asserts `release-artifact` is `false` in each of PLANNING, REVIEWING.
- **ac-05.2**: `bun -e` importing `STAGE_TOOL_MATRIX` asserts `release-artifact` is `true` in EXECUTING (matching today's `EXECUTING['code-write'] === true`, `stage-tool-matrix.ts:60`).
- **ac-06**: [DROPPED — see decisions 2026-07-20]
- **ac-07**: `bun -e` calling `classifyBashCommand('git add .')` returns category `bash-stage`.
- **ac-08**: [SPLIT → ac-08.1, ac-08.2]
- **ac-08.1**: `bun -e` importing `STAGE_TOOL_MATRIX` asserts `bash-stage` is `true` in each of EXECUTING, FINALIZING.
- **ac-08.2**: `bun -e` importing `STAGE_TOOL_MATRIX` asserts `bash-stage` is `false` in each of PLANNING, REVIEWING.
- **ac-09**: `bun -e` calling `classifyBashCommand('git add . && git commit -m x')` returns category `bash-commit`.
- **ac-10**: `bun -e` asserts `TMP_PATH_PATTERN.test('.luca/tmp/pr-body-draft.md') === true` (the hook's ephemeral allow at `handle-stage-gate-hook.ts:425` consumes this pattern, derived from `TMP_FILE_RE`).
- **ac-11**: [SPLIT → ac-11.1, ac-11.2]
- **ac-11.1**: `bun -e` importing `WRITE_COMMAND_PHASES` asserts keys exist for each of `snapshot create`, `snapshot diff`, `budget check`, `state claim-owner`, `state set-current-phase`.
- **ac-11.2**: `bun -e` asserts each of those five keys has value `[]` (a non-empty value would make `runWriteHandler` hard-exit).
- **ac-12**: [SPLIT → ac-12.1, ac-12.3]
- **ac-12.1**: `! grep -qiE 'draft .{0,4}\.luca/rules|rule (stubs?|templates?|files?)|promotes? .{0,40}to draft' packages/luca-tools/src/artifacts/modes/finalize.ts` exits 0.
- **ac-12.2**: [DROPPED — see decisions 2026-07-20]
- **ac-12.3**: `! grep -q 'preferences consult' packages/luca-tools/src/artifacts/modes/finalize.ts` exits 0.
- **ac-13**: `! grep -q 'apply-fix' packages/luca-tools/src/artifacts/modes/finalize.ts` exits 0.
- **ac-14**: `! grep -q 'luca repo-cleanup' packages/luca-tools/src/artifacts/modes/finalize.ts` exits 0 — scoped to the `luca `-prefixed CLI references only, leaving the bare-prose "repo-cleanup actions" at `:416` untouched.
- **ac-15**: [SPLIT → ac-15.1, ac-15.2]
- **ac-15.1**: `grep -c 'changeset' packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts` returns at least 3 (currently 0).
- **ac-15.2**: `timeout 120 bun test packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts` exits 0.
- **ac-16**: [SPLIT → ac-16.1, ac-16.2]
- **ac-16.1**: `grep -c 'changeset' packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.test.ts` returns at least 4 (currently 0).
- **ac-16.2**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.test.ts` exits 0.
- **ac-17**: [SPLIT → ac-17.1, ac-17.2]
- **ac-17.1**: `grep -c 'bash-stage' packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` returns at least 2 (currently 0 — threshold set to 2 because only two of the four cases naturally carry the literal).
- **ac-17.2**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0.
- **ac-18**: [SPLIT → ac-18.1, ac-18.2]
- **ac-18.1**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` exits 0.
- **ac-18.2**: `bun -e` asserts each `LUCA_NOUN_VERBS` pair whose verb is absent from `LUCA_READ_VERBS` has a `WRITE_COMMAND_PHASES` key.
- **ac-19**: `bunx --bun tsc --noEmit` exits 0.
- **ac-20**: [SPLIT → ac-20.1, ac-20.2]
- **ac-20.1**: `bun -e` imports `bashCategoryToToolCategory` from `handle-stage-gate-hook.ts` without a binding error.
- **ac-20.2**: `bun -e` imports `LUCA_READ_VERBS` from `classify-bash-command.ts` without a binding error.
- **ac-20.3**: `bun -e` imports `SEVERITY` from `classify-bash-command.ts` without a binding error.
- **ac-22**: `! grep -q 'handoff files or previews' packages/luca-core/src/luca-dir/helpers/is-valid-luca-path.ts` exits 0 — the stale `.json`-only error string at `:111` is reworded.
- **ac-21**: [SPLIT → ac-21.1, ac-21.2, ac-21.3, ac-21.4, ac-21.5]
- **ac-21.1**: `bun -e` asserts `SEVERITY['bash-readonly'] < SEVERITY['bash-stage']`.
- **ac-21.2**: `bun -e` asserts `SEVERITY['bash-stage'] < SEVERITY['bash-mutate']`.
- **ac-21.3**: `bun -e` asserts `SEVERITY['luca-write'] === SEVERITY['bash-mutate']` (the deliberate shared tier documented at `classify-bash-command.ts:374-377`).
- **ac-21.4**: `bun -e` asserts `SEVERITY['bash-mutate'] < SEVERITY['bash-commit']`.
- **ac-21.5**: `bun -e` asserts `SEVERITY['bash-commit'] < SEVERITY['denied']`.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — grant `code-write` in FINALIZING. Probe: `bun -e` asserts `STAGE_TOOL_MATRIX.FINALIZING['code-write'] === false`.
- **anti-02**: MUST NOT — allow an arbitrary `.changeset/` non-markdown write. Probe: `bun -e` calling `classifyWritePath('.changeset/evil.ts')` returns class `code`.
- **anti-03**: MUST NOT — newly block bare `git add` in EXECUTING. Probe: `bun -e` asserts `isToolAllowed({ phase: 'EXECUTING', category: bashCategoryToToolCategory(classifyBashCommand('git add .').category) }) === true`.
- **anti-04**: MUST NOT — grant `bash-commit` in EXECUTING. Probe: `bun -e` asserts `STAGE_TOOL_MATRIX.EXECUTING['bash-commit'] === false`.
- **anti-05**: MUST NOT — let the widened `TMP_FILE_RE` admit a nested path. Probe: `bun -e` asserts `TMP_PATH_PATTERN.test('.luca/tmp/sub/x.md') === false` (a slash-admitting rewrite is the realistic failure; the traversal string is already unmatchable by the anchored name class).
- **anti-06**: MUST NOT — reclassify the `rules` noun as a write. Probe: `bun -e` asserts `LUCA_TOPLEVEL_READ` still contains `rules`.
- **anti-07**: MUST NOT — let a mutation ride into FINALIZING on a `bash-stage` severity tie. Probe: `bun -e` asserts `classifyBashCommand('git add . && rm -rf build').category === 'bash-mutate'`.
- **anti-08**: MUST NOT — drop the `git add` target extraction. Probe: `bun -e` asserts `classifyBashCommand('git add secrets.env').targetPaths` contains `secrets.env`.
- **anti-09**: MUST NOT — break the `luca-write`/`bash-mutate` shared tier when renumbering. Probe: `bun -e` asserts `classifyBashCommand('luca checks run && rm -f x').category === 'luca-write'` (a bumped `bash-mutate` would flip this to `bash-mutate`, denied in PLANNING/REVIEWING/FINALIZING).

## Risks & Mitigations
- **Adding two ToolCategory columns** touches every matrix row AND the four
  `Record<ToolCategory, boolean>` literals in `is-tool-allowed.test.ts` (`:22`, `:43`, `:65`,
  `:86`) — root `tsconfig.json` has no `include`, so test files are in the `tsc` program. Both
  Task 1.1.1 and Task 1.2.1 carry that file so ac-19 holds after each.
- **ac-02/ac-03/anti-02 pass against today's tree by construction.** They are not vacuous: a
  naive `.changeset/*` glob in Task 1.1.1 breaks all three. They constrain the implementation,
  not the starting state.
- **Task 1.2.1 leaves `classify-bash-command.test.ts:105` red until Task 1.4.3.** Harmless —
  the phase gate is `tsc`, and Wave 4 restores green.
- **Structural probes use `bun -e` against real exports**, not single-line greps. Grep appears
  only for literal presence/absence in an instruction body (ac-12.x, ac-13, ac-14) and for
  test-case existence counts (ac-15.1, ac-16.1, ac-17.1).

## Decisions
- 2026-07-20 — Subagents inherit the owner `session_id` and are NOT bystander-exempt (live probe,
  independently reproduced by the reviewer subagent).
- 2026-07-20 — Use a distinct `bash-stage` category instead of moving `git add` to the commit set.
- 2026-07-20 — `bash-stage` sits strictly below `bash-mutate`, not merely below `bash-commit`.
  `maxCategory` keeps the first-seen on a tie, so a tier-1 tie would launder
  `git add . && rm -rf build` into FINALIZING as `bash-stage` (plan-review G-SEC-002).
- 2026-07-20 — The renumber PRESERVES `luca-write === bash-mutate`. That shared tier is
  deliberate (`classify-bash-command.ts:374-377`); bumping only `bash-mutate` would satisfy the
  stage ordering while flipping `luca checks run && rm -f x` from `luca-write` to `bash-mutate`,
  a tightening of the same class `bash-stage` exists to avoid. `SEVERITY` has exactly one
  consumer — `maxCategory` at `:385` — so the renumber's blast radius is a single expression.
  Pinned by ac-21.1–21.5 plus anti-09 (plan-review G-SEC-001b).
- 2026-07-20 — Widen `TMP_FILE_RE` to `.md` rather than forcing the PR body to `.json`.
- 2026-07-20 — Grant `release-artifact` in EXECUTING as well as FINALIZING, because
  `EXECUTING['code-write']` is `true` today and a FINALIZING-only grant would tighten a legal path.
- 2026-07-20 — ac-06 dropped: a text scan for a `case` arm duplicated ac-16's behavioral coverage.
- 2026-07-20 — **D5 retargeted.** Context.md assumed `luca rules suggest` writes draft
  `.luca/rules/*.ts`. It does not: `rules.ts:122-134` prints markdown to stdout and performs no
  filesystem write. `LUCA_TOPLEVEL_READ` is CORRECT; the false claim lives in the instruction
  body. Moving the noun would have reclassified three unrelated verbs, and the compensating
  `WRITE_COMMAND_PHASES` key would have been inert — `rulesCommand` never routes through
  `runWriteHandler`. **Flagged for user review — this reinterprets a user-decided item.**
- 2026-07-20 — `budget check` KEEPS its `WRITE_COMMAND_PHASES` entry even though `budget.ts:147`
  calls `mutateState` directly and never routes through `runWriteHandler`, so the key is
  currently unenforced. Unlike `rules suggest` it IS a genuine state mutation, so the declaration
  is correct and the completeness invariant needs no exemption; routing `budget check` through
  `runWriteHandler` is a real but separate defect, out of scope here (plan-review G-ADV-002).
- 2026-07-20 — `WRITE_COMMAND_PHASES['branch-guard']` (`step-artifacts.ts:81`) is a dead key —
  the lookup is `'branch guard'` (`branch.ts:35`). Left in place; ac-18.2's `LUCA_READ_VERBS`
  filter excludes the pair, so removing it is unrelated cleanup (plan-review G-ADV-003).
- 2026-07-20 — Task 1.3.1 folded into Wave 2 as Task 1.2.4 so the exports land before Wave 4
  consumes them; Wave 3 is now finalize-prose only.
