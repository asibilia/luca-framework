# Research: stage-gate / finalize contract contradiction

## Key findings (summary)

1. **The contradiction is REAL but PARTIAL, and the blocked set is not what the phase goal assumed.** In `FINALIZING`, `git commit` / `git push` / `git tag` / `gh pr create` are **ALLOWED** (`bash-commit: true`). What is genuinely blocked is (a) the `.changeset/<slug>.md` write (classifies `code-write`, denied) and (b) a **standalone** `git add` (classifies `bash-mutate`, denied). — HIGH
2. **A severity max-merge quirk means `git add . && git commit -m x` is ALLOWED while bare `git add .` is BLOCKED.** `maxCategory` promotes the compound to `bash-commit`, which FINALIZING permits. This is very likely why the contradiction appeared intermittently across runs. — HIGH
3. **`.changeset/` is outside the `.luca/` contract entirely** — it falls to the default `class: 'code'` branch, and `STAGE_TOOL_MATRIX.FINALIZING['code-write'] === false`. There is a test that explicitly pins this denial. — HIGH
4. **A second, undocumented block: the PR-body draft path.** finalize instructs writing `.luca/tmp/pr-body-draft.md`, but `TMP_FILE_RE` requires a **`.json`** extension, so that path misses the ephemeral allow and hits `artifactPathGate`, which for `finalize` permits only `learn` and `audits/*`. — HIGH
5. **`WRITE_COMMAND_PHASES` is NOT implicated** in the block. Absence of an entry means "no self-check" (skipped), never a denial. It is a *soundness* gap, not a *blocking* one. — HIGH
6. **Two phantom `luca` verbs in the finalize body** (`luca repo-cleanup apply-fix`, `luca preferences consult`) do not exist on the CLI; the first additionally classifies `bash-mutate` and is stage-gate blocked. — HIGH

---

## 1. The exact mechanism

**Coarse-phase derivation.** `coarsePhaseOf` (`packages/luca-core/src/state/helpers/coarse-phase-of.ts:19-21`) delegates to `STEP_TO_COARSE_PHASE`, derived at module load from the XState machine's `meta` (`packages/luca-core/src/state/machine/pipeline-machine.ts:362-374`). The `finalizing` node is the sole owner of the `finalize` step:

```ts
// pipeline-machine.ts:287-297
finalizing: {
    meta: { coarsePhase: 'FINALIZING' },
    initial: 'finalize',
    states: { finalize: { id: 'finalize', on: { ADVANCE: STEP_TRANSITIONS.finalize } } },
},
```

So `finalize` is the **only** step in FINALIZING (`packages/luca-core/src/state/constants.ts:6-20` lists all 13 steps). — HIGH

**The matrix.** `packages/luca-core/src/state/configs/stage-tool-matrix.ts:79-87`:

```ts
FINALIZING: {
    'code-write': false,
    'planning-write-general': true,
    'planning-write-audit': true,
    'bash-readonly': true,
    'bash-mutate': false,
    'bash-commit': true,
    'luca-write': true,
},
```

Looked up by `isToolAllowed` (`packages/luca-core/src/state/helpers/is-tool-allowed.ts:16-24`), called from the hook at `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts:317`.

**Permitted in FINALIZING:** `bash-readonly`, `bash-commit`, `luca-write`, `planning-write-general`, `planning-write-audit` (the latter two only after passing `artifactPathGate`, which short-circuits at `handle-stage-gate-hook.ts:214-242` and never reaches the matrix).
**Denied in FINALIZING:** `code-write`, `bash-mutate`. — HIGH

**Notably, FINALIZING is the *only* phase where `bash-commit: true`** — PLANNING/EXECUTING/REVIEWING all deny it (`stage-tool-matrix.ts:50-78`). That is the design intent stated in `finalize.ts:51`: "the rest of this mode runs under the FINALIZING phase, whose stage-gate permits the commits and `gh pr create` that PR creation needs".

---

## 2. What finalize actually needs

Instruction body: `packages/luca-tools/src/artifacts/modes/finalize.ts` (BODY at `:35-523`).

| Operation | Cited at | Classification | FINALIZING verdict |
|---|---|---|---|
| Write `.changeset/<slug>.md` | `finalize.ts:339`, `:518` | `classifyWritePath` → `'code'` (`classify-write-path.ts:270`) → `code-write` | **BLOCKED** |
| Write `.luca/tmp/pr-body-draft.md` | `finalize.ts:347-354` | `.md` fails `TMP_FILE_RE` (`luca-dir/constants.ts:38`, requires `.json`) → `planning-general` → `artifactPathGate` | **BLOCKED** |
| `git push` (feature branch) | `finalize.ts:368` | `GIT_COMMIT_SUBCOMMANDS` (`classify-bash-command.ts:104`) → `bash-commit` | ALLOWED |
| `gh pr create` | `finalize.ts:370`, `:518` | `GH_COMMIT_PATTERNS` (`:143`) → `bash-commit` | ALLOWED |
| `git add` (standalone) | *not in finalize.ts*; `gh-prepare/index.ts:107`, `milestone-complete/index.ts:151` | `GIT_MUTATE_SUBCOMMANDS` (`:107`) → `bash-mutate` | **BLOCKED** |
| `git commit` / `git tag` | `milestone-complete/index.ts:152-153` | `bash-commit` | ALLOWED |
| `luca retro`, `luca claim-verify` | `:236`, `:262`, `:353` | `LUCA_TOPLEVEL_WRITE` (`:242-250`) → `luca-write` | ALLOWED |
| `luca verification aggregate`, `luca branch guard`, `luca telemetry *`, `luca rules suggest` | `:182`, `:262`, `:284`, `:367` | `LUCA_READ_VERBS` / `LUCA_TOPLEVEL_READ` (`:216-222`, `:259-272`) → `bash-readonly` | ALLOWED |
| `luca todo update`, `luca confidence log`, `luca state advance`, `luca checks run`, `luca repo cleanup-apply` | `:185`, `:378`, `:483`, `:413`, `:514` | `luca-write` | ALLOWED |
| `luca repo-cleanup apply-fix` | `finalize.ts:159` | noun `repo-cleanup` absent from `LUCA_NOUN_VERBS`/toplevel sets → `undefined` → generic → `bash-mutate` | **BLOCKED** (and phantom — no such CLI noun, `cli.ts:73`) |
| `luca preferences consult` | `finalize.ts:306-308` | known noun, unknown verb → `'luca-write'` (`classify-bash-command.ts:356-364`) | Allowed by hook, but **CLI would reject** — `preferences` verbs are `read\|write` only (`:280`) |

**Important negative finding:** `finalize.ts` never instructs `git add` or `git commit` directly. It says only "**Push** the feature branch" (`:368`). The `git add`/`git commit` pairing enters via `gh-prepare` (`skills/gh-prepare/index.ts:107`) and `milestone-complete` (`skills/milestone-complete/index.ts:151-152`), the latter invoked from finalize per `skills/lu/index.ts:124`. — HIGH

---

## 3. Is the contradiction real and total, or partial?

**Partial.** Empirically, from the classifier source and its pinned tests:

**(a) Genuinely blocked**
- `Write .changeset/foo.md` → `code-write` → denied. Pinned by the sibling test `handle-stage-gate-hook.test.ts:345-351` ("blocks Edit on src/foo.ts (no code in FINALIZING)"), which exercises the identical `code-write`/FINALIZING path.
- `git add -A` / `git add .` standalone → `bash-mutate` → denied. `classify-bash-command.test.ts:105` pins `'git add .' → bash-mutate`.
- `Write .luca/tmp/pr-body-draft.md` → `artifactPathGate` block; `STEP_ARTIFACTS.finalize = ['learn', 'audits/*']` (`step-artifacts.ts:56-58`).
- `luca repo-cleanup apply-fix` → `bash-mutate` → denied.

**(b) Allowed, but the instructions/lore read as blocked**
- `git commit -m …`, `git push`, `git tag`, `gh pr create` are all ALLOWED. `classify-bash-command.test.ts:114-127` pins all four as `bash-commit`; `handle-stage-gate-hook.test.ts:320-343` pins FINALIZING allowing `git push origin main` (exit 0).
- **The compound loophole:** `SEVERITY` (`classify-bash-command.ts:372-382`) ranks `bash-commit: 2` above `bash-mutate: 1`, and `maxCategory` (`:384-386`) takes the max. So `git add . && git commit -m x` merges to `bash-commit` → **ALLOWED**, while the same `git add .` alone is blocked. Semantics confirmed by `classify-bash-command.test.ts:145-154`; **no test pins this specific compound** — flag for coverage. This is the most plausible explanation for the intermittent live symptom. — MEDIUM-HIGH (mechanism HIGH; attribution to the observed runs MEDIUM, the run transcripts were not readable)

**(c) Blocked only in some sub-steps** — N/A. FINALIZING has exactly one step (`finalize`), so there is no intra-phase variation.

**On `WRITE_COMMAND_PHASES`:** it is **not implicated in any block**. `runWriteHandler` (`packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts:53-67`) only enforces when the entry exists **and is non-empty**; a missing key yields `undefined` and skips the check entirely. The reported gaps are real (no `snapshot create|diff`, no `budget check`, no `confidence *` beyond `log` — `step-artifacts.ts:77-127`), but they *weaken* self-enforcement rather than cause denials. This matters for design option (b) below. — HIGH

---

## 4. Design space for the fix

**(a) Widen the FINALIZING allowlist**
- *Files:* `packages/luca-core/src/state/configs/stage-tool-matrix.ts:79-87` (flip `bash-mutate` and/or `code-write` to `true`).
- *Security:* Flipping `code-write: true` in FINALIZING re-opens arbitrary source edits at the moment the PR is being cut — precisely the drift the phase is designed to prevent (`finalize.ts:339`: "Writing these before this point is the #1 cause of drift"). Flipping `bash-mutate: true` admits `rm`, `sed -i`, `git reset`, `git checkout`, `bun install` (`classify-bash-command.ts:106-126`, `:153-187`). Both are blunt: the matrix has no path granularity, so there is no way to say "code-write, but only under `.changeset/`".
- *Risk:* Highest blast radius, lowest precision. Breaks the two pinned tests at `handle-stage-gate-hook.test.ts:345` and `:186`-analogues.

**(a′) Narrow variant — teach `classifyWritePath` a `.changeset/` class.** Add a class (e.g. `release-artifact`) recognized before the `'code'` fallback at `classify-write-path.ts:269-270`, plus a matrix column allowed only in FINALIZING.
- *Files:* `classify-write-path.ts`, `stage-tool-matrix.ts` (new `ToolCategory` at `:13-25`), `handle-stage-gate-hook.ts:519-535` (`pathClassToToolCategory` switch is exhaustive — must be extended).
- *Security:* Much tighter than (a). The permission granted is exactly "write files under `.changeset/`". Residual concern: `.changeset/config.json` is real configuration, so the pattern should be scoped to `.changeset/*.md` excluding `README.md` (cf. `gh-prepare/index.ts:89`, which already excludes README).
- *Risk:* Hard-codes a changesets-specific convention into luca-core; repos not using changesets carry a dead class. `luca init` already detects this (`skills/luca-init/index.ts:38`), so it is at least a known project axis.

**(b) Route mutations through dedicated `luca` verbs — the `snapshot` precedent.**
- *Precedent:* `packages/luca-cli/src/commands/write-surface/snapshot.ts`, registered at `cli.ts:79-82` and in the classifier at `classify-bash-command.ts:301` with the explicit rationale comment at `:297-301`: neither verb is in `LUCA_READ_VERBS`, so both classify `luca-write`, "legal in REVIEWING". `budget: new Set(['check'])` (`:307`) follows the same pattern with the same comment style (`:302-306`).
- *Shape here:* e.g. `luca changeset write --file .luca/tmp/changeset.json`, or `luca release stage`.
- *Files:* new `packages/luca-cli/src/commands/write-surface/<noun>.ts`; register in `cli.ts:23+`; add to `LUCA_NOUN_VERBS` (`classify-bash-command.ts:276-308`); add to `WRITE_COMMAND_PHASES` (`step-artifacts.ts:77-127`); update `finalize.ts` body + `gh-prepare`.
- *Security:* **This is the option that satisfies the standing lesson.** `classify-bash-command.ts:200-202` states the invariant explicitly: "The matrix allows `luca-write` in every non-IDLE phase; the CLI itself self-enforces each verb's per-step phase precondition (WRITE_COMMAND_PHASES)". Registering a verb *is* granting a phase-wide permission, so it is only justified if the verb ships a **non-empty** `WRITE_COMMAND_PHASES` entry (e.g. `'changeset write': ['finalize']`). Note that `snapshot` and `budget` were both registered *without* such an entry — the precedent is real but its self-enforcement half was not honored (`step-artifacts.ts` has no `snapshot`/`budget` key). Repeating that omission would grant a bare permission. — HIGH
- *Risk:* Most code. Also does not by itself solve `git add`.

**(c) Run mutations after an explicit state transition (formalize the observed workaround).**
- The live workaround was "do finalize writes after reset to `idle`", and IDLE is fully permissive (`stage-tool-matrix.ts:41-49`; hook short-circuits at `handle-stage-gate-hook.ts:161-169`).
- *Files:* `finalize.ts` body ordering only — no core change.
- *Security:* Worst option as a *policy*. It moves the PR-cutting work into the zero-enforcement phase, meaning the changeset, claim-verify gate, and PR body are all authored with the gate off. It also breaks the ordering invariant that `luca claim-verify` runs *before* `gh pr create` under supervision (`finalize.ts:518`, `:522`).
- *Risk:* Cheap, but it institutionalizes the fragility rather than fixing it.

**(d) Redefine the coarse phase for finalize / split the step.**
- E.g. split `finalize` into `finalize` (audit, gated) + a `release` step mapped to a more permissive phase.
- *Files:* `constants.ts:6-20` (new step value), `pipeline-machine.ts:287-297`, `STEP_TRANSITIONS`, `step-artifacts.ts:43-59`, `pipeline-transitions.ts`, plus every consumer that switches on step.
- *Security:* Can be made precise (the permissive window is bounded to a step that does nothing but package/ship), but it is a pipeline-shape change — the machine is the derived source of truth for `STEP_TO_COARSE_PHASE`, so the change is load-bearing.
- *Risk:* Largest surface; touches the state machine and its parity fixtures. Also interacts with the documented "`finalize → finalize` is an illegal self-transition" trap (`finalize.ts:51-54`, `:533`).

**(e) Orthogonal, cheap, and independent of the above:** fix `TMP_FILE_RE` or the instruction. Either extend `.luca/tmp/` to allow `.md` handoffs (`luca-dir/constants.ts:38`) or change `finalize.ts:351` to stage the PR body as `.json`. This one is nearly free and unblocks the claim-verify loop regardless of which option wins. — HIGH

---

## 5. Blast radius + existing tests

Existing coverage that constrains any fix:

- `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.test.ts:320-351` — the FINALIZING describe block; `:339-343` pins `git push` allowed, `:345-351` pins code-write blocked. Fixture built via `makeProjectAtStep('milestone')` (`:323`) — note this uses a **legacy** step name that folds to `finalize` via `LEGACY_PIPELINE_STEP_MAP` (`constants.ts:36`), which is worth confirming still resolves as intended.
- `handle-stage-gate-hook.test.ts:186-192` — pins `git commit` blocked outside FINALIZING.
- `packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts:105` (`git add .` → mutate), `:114-127` (commit set), `:145-159` (max-merge semantics).
- `packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` — binds `CLI_SUBCOMMANDS` to the classifier registries; any new noun (option b) **must** be registered or this test fails, and the `DELIBERATELY_UNCLASSIFIED` set (`:30-41`) carries the justification requirement in prose.
- `packages/luca-core/src/state/helpers/coarse-phase-of.test.ts`, `packages/luca-core/src/state/configs/pipeline-transitions.test.ts` — constrain option (d).

**New coverage needed regardless of option:**
1. A FINALIZING test asserting the changeset path decision (allow or block) explicitly, rather than inferring it from the `src/foo.ts` case.
2. A classifier test pinning `git add . && git commit -m x` — today's max-merge behavior is load-bearing and untested.
3. A test asserting `.luca/tmp/pr-body-draft.md` resolves as intended.
4. If option (b): a `WRITE_COMMAND_PHASES` completeness assertion — currently nothing fails when a registered noun has no phase entry, which is how `snapshot`/`budget` slipped through.

---

## 6. Risks / unknowns

- **Could NOT verify:** the three live `/lu` run transcripts. Every claim above is from source + tests; the mapping from "observed block" to "which of the four blocked operations fired" is inference. The planner should not assume the user hit the `git add` case rather than the `.changeset/` case — the remedies differ. — flagged LOW confidence on attribution.
- **Did NOT execute any test or the classifier.** All classification verdicts are traced by reading `classifySubcommand` (`classify-bash-command.ts:453-669`) and `classifyWritePath` (`:189-271`). High confidence, but not empirically run (read-only constraint).
- **`makeProjectAtStep('milestone')`** — the call site (`handle-stage-gate-hook.test.ts:323`) was read but not the helper's body; whether the fixture writes `pipelineStep: 'milestone'` and relies on the Zod legacy preprocess is unconfirmed. — LOW
- **Bystander exemption may mask the bug.** `handle-stage-gate-hook.ts:154-157, 300-314` exempts any session that is not `state.ownerSessionId` from the matrix. If the finalize mode runs as a subagent with a different `session_id`, it would be exempt and *nothing* would block — meaning reproduction is session-dependent. How `session_id` propagates to subagent tool calls is unverified. This is the single biggest source of planner overconfidence risk. — MEDIUM
- **The `luca rules suggest` misclassification** (`rules` in `LUCA_TOPLEVEL_READ`, `classify-bash-command.ts:216-222`, but the verb writes draft `.luca/rules/*.ts` per `finalize.ts:286`) is a latent correctness hole in the opposite direction — a write classified read-only. Out of scope for this phase but worth recording; it also illustrates the cross-noun leak already documented at `classify-bash-command.ts:254-258`.
- **Scope creep hazard:** items (e), the two phantom verbs, and the `WRITE_COMMAND_PHASES` gaps are all genuine defects adjacent to this phase but distinct from the core contradiction. They should be explicitly in-or-out at the discuss step, not silently absorbed.
