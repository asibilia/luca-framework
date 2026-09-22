# Context — Phase 01: resolve stage-gate/finalize contract contradiction

Complexity: COMPLEX (heuristic MODERATE, promoted — this widens a security boundary and the
standing repo lesson is that an allowlist entry IS a permission grant).

## Framing correction (from research — do not re-litigate)

The phase was opened on the belief that `git add`/`git commit` were blocked in FINALIZING. That is
**wrong**. `git commit`, `git push`, `git tag`, `gh pr create` all classify `bash-commit`, and
FINALIZING is the ONLY phase where `bash-commit: true`. The genuinely blocked operations are:

1. `Write .changeset/<slug>.md` → `code-write` → denied (`stage-tool-matrix.ts:80`).
2. Standalone `git add` → `bash-mutate` → denied (`stage-tool-matrix.ts:84`).
3. `Write .luca/tmp/pr-body-draft.md` → `TMP_FILE_RE` requires `.json`, so it misses the ephemeral
   allow and fails `artifactPathGate` (`STEP_ARTIFACTS.finalize = ['learn','audits/*']`).
4. `luca repo-cleanup apply-fix` → unknown noun → `bash-mutate` → denied (also a phantom verb).

The intermittency across the three observed runs is explained by the severity max-merge: `git add .
&& git commit -m x` promotes to `bash-commit` and PASSES, while bare `git add .` FAILS.

## D1 — Fix mechanism: narrow path class + git add reclassification [user-decided]

**Chosen:** teach the classifier a narrow release-artifact path class, allowed only in FINALIZING;
move `git add` into the commit set; fix the `.luca/tmp/` extension mismatch.

- `classify-write-path.ts` — recognize `.changeset/*.md` (EXCLUDING `README.md`, per the existing
  exclusion precedent in `skills/gh-prepare/index.ts:89`) as a new class **before** the `'code'`
  fallback at `:269-270`. `.changeset/config.json` is real configuration and MUST NOT be included.
- `stage-tool-matrix.ts` — new `ToolCategory` column, `true` in FINALIZING (and IDLE), `false`
  everywhere else. `handle-stage-gate-hook.ts:519-535` `pathClassToToolCategory` is an exhaustive
  switch and must be extended.
- `git add` — move from `GIT_MUTATE_SUBCOMMANDS` to the commit set so staging travels with the act
  it belongs to.
- `luca-dir/constants.ts` — `TMP_FILE_RE` accepts `.md` alongside `.json` (or finalize stages the PR
  body as `.json`; implementer's call, but ONE of them must change).

**Rejected:** (a) blunt matrix flip of `code-write`/`bash-mutate` in FINALIZING — no path
granularity, re-opens arbitrary source edits exactly when drift is most costly. (b) a dedicated
`luca changeset write` verb — defensible, but it is the most code, it does not address `git add` at
all, and its self-enforcement half (`WRITE_COMMAND_PHASES`) is precisely what `snapshot`/`budget`
already skipped. (c) running mutations after the idle reset — institutionalizes the observed
workaround and authors the changeset + PR body with the gate off. (d) splitting the finalize step —
a pipeline-shape change touching the XState machine and its parity fixtures; disproportionate.

### D1a — `git add` reclassification consequence [AI-owned, verified live]

Reclassifying `git add` as `bash-commit` makes bare `git add` **blocked in EXECUTING** for the owner
session (EXECUTING is `bash-mutate: true`, `bash-commit: false` — verified at
`stage-tool-matrix.ts:59-67`). This is deliberate and is NOT a regression of a working path: today
EXECUTING permits staging but forbids committing, which is incoherent, and the compound
`git add . && git commit` that executors are instructed to run ALREADY merges to `bash-commit` and
is already denied there. Executor commits therefore depend on the bystander exemption
(`handle-stage-gate-hook.ts:154-157`, `:300-314`), not on `git add` being `bash-mutate`.

**The planner MUST NOT treat this as settled fact without a probe.** Resolve empirically: confirm
whether a subagent's tool calls carry the owner `session_id`. If executors are NOT exempt, this
change tightens a path they rely on and the plan must either keep `git add` where it is or make
EXECUTING permit the new classification. This is the single largest overconfidence risk in the
phase (researcher flagged it MEDIUM, unverified).

## D2 — Adjacent defects: ALL in scope [user-decided]

The user selected every adjacent item. Each is a distinct deliverable, not a silent absorption:

1. **Pin the untested behaviors** — tests for the compound `git add . && git commit -m x` max-merge
   (load-bearing and currently untested), an explicit `.changeset/*.md` FINALIZING decision (today
   it is only inferred from the `src/foo.ts` case at `handle-stage-gate-hook.test.ts:345-351`), and
   the `.luca/tmp/pr-body-draft.md` path.
2. **Phantom finalize verbs** — `luca repo-cleanup apply-fix` (`finalize.ts:159`; no such noun,
   `cli.ts:73`) and `luca preferences consult` (`finalize.ts:306-308`; `preferences` verbs are
   `read|write` only). Correct the instruction body to the real verbs, or drop the steps if no real
   verb exists. Do not invent a CLI surface to match the prose.
3. **WRITE_COMMAND_PHASES completeness** — add the missing entries (`snapshot create|diff`,
   `budget check`, `confidence` verbs beyond `log`) AND a completeness test so a classifier-
   registered write noun cannot ship without a phase precondition. Absence currently means "skip the
   check", never "deny" (`run-handler.ts:53-67`) — a silent soundness hole. Overlaps the existing
   backlog "disposition manifest" todo; close it here.
4. **`luca rules suggest` misclassification** — `rules` sits in `LUCA_TOPLEVEL_READ`
   (`classify-bash-command.ts:216-222`) but the verb writes draft `.luca/rules/*.ts`
   (`finalize.ts:286`) — a write classified read-only. Fix in the permissive-hole direction.

## Constraints

- Every classifier/matrix change is a permission grant. Each new allow needs a stated justification
  and a test that fails if the grant widens beyond its intent.
- Existing pinned tests that constrain the work: `handle-stage-gate-hook.test.ts:186-192`, `:320-351`;
  `classify-bash-command.test.ts:105`, `:114-127`, `:145-159`;
  `classify-bash-command-registry.test.ts` (new nouns must register, `DELIBERATELY_UNCLASSIFIED`
  carries a prose justification requirement).
- `bunx --bun tsc --noEmit` is the gate. Run tests bounded (`timeout 120 bun test <file>`), never
  unbounded.
- Instruction-body edits (`finalize.ts`) reach users only via `bun run build` + a `luca init` re-run
  — note it, do not attempt the deploy here.
