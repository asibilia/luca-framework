# Research: Worktree-snapshot capture for the review re-entry diff-gate (follow-up to #320)

## Summary

The #320 gate cannot work on the flagship path for two independent reasons: (1) the HEAD-SHA baseline predates all phase work (the known finding), and (2) — newly found — both gate sites in `review.ts`/`lu-review` run in the REVIEWING coarse phase where the stage-gate hook **blocks every git snapshot primitive** (`stash`, `add`, `write-tree`) as `bash-mutate`, and even the already-shipped `git ls-files --others --exclude-standard` union command is mutate-classified and will be blocked at the exact step it must run. The cleanest resolution is not prose incantations but two small `luca` CLI verbs (snapshot-create / snapshot-diff, temp-index `write-tree` + tree-to-tree diff), because `luca-write` is matrix-allowed in REVIEWING, the untracked-file semantics are exactly right only with a tree-to-tree diff, and deterministic code removes the real-index-corruption hazard of LLM-followed `GIT_INDEX_FILE` prose.

## Dimension 1 — Git mechanics

- **(a) `git stash create` is side-effect-free but insufficient — HIGH.** Creates dangling commits without touching worktree/index/stash-reflog, prints empty on a clean worktree (needs `|| git rev-parse HEAD` fallback), and **cannot capture untracked files** (`create` takes no `-u`). On the flagship no-commit path every file *created* during round-1 is untracked, so the existing `ls-files` union re-conflates them at re-entry and the gate still ~never skips. Also `stash` ∈ `GIT_MUTATE_SUBCOMMANDS` (`classify-bash-command.ts:108`) → blocked in REVIEWING.
- **(b) Temp-index `write-tree` is the only mechanism capturing tracked+staged+unstaged+untracked with zero side effects — HIGH.** `GIT_INDEX_FILE=<tmp> git read-tree HEAD && GIT_INDEX_FILE=<tmp> git add -A && GIT_INDEX_FILE=<tmp> git write-tree` yields a tree sha; real index/worktree untouched.
- **Critical subtlety — one-arg `git diff <snapshot-tree>` does NOT close the loop — MEDIUM-HIGH.** One-arg diff compares the tree against the index/worktree *tracked view*: a path present in the snapshot tree but still untracked in the real index reports as **deleted**, so every round-1-created file re-appears in the diff forever. Correct compare is **tree-to-tree**: build a second temp-index tree at re-entry and `git diff <treeA> <treeB> --name-only` (exact, untracked symmetric, no `ls-files` union needed).
- **(c) `git add -A` into the real index — REJECT, HIGH.** Mutates shared index; violates executor gotcha "never `git add -A`" (`subagents/executor.ts:64`); interrupt leaves everything staged, silently emptying review Step 1's plain `git diff` (`review.ts:63`).
- **(d) Textual manifest (porcelain + hashes) — REJECT as primary, MEDIUM.** `??` entries carry no content hashes → in-place edits to round-1 untracked files invisible → **false-skip risk** (quality breach). Hash commands are mutate-classified anyway.
- **GC safety — HIGH.** Dangling trees survive gc for `gc.pruneExpire` (default 2 weeks) ≫ the Route B→re-entry window; aggressive prune degrades via existing ABSENT branch (`rev-parse --verify` fails → full round-2, fail-safe). `rev-parse --verify` works on tree shas and is readonly-classified.

## Dimension 2 — Codebase constraints (the crux)

- **Route B capture and Step 3.5 compare both run in the `review` step → REVIEWING — HIGH.** `pipeline-machine.ts:267-285`; `stage-tool-matrix.ts:68-78` sets `bash-mutate: false` there. Only `GIT_READONLY_SUBCOMMANDS` (`classify-bash-command.ts:84-96`) pass. `git rev-parse HEAD` (shipped capture) passes; **every candidate snapshot command does not**.
- **Shipped latent bug — HIGH.** `git ls-files` is NOT in `GIT_READONLY_SUBCOMMANDS` → unknown subcommand → `bash-mutate` (`classify-bash-command.ts:449-450`) → the #320 untracked-union command (`review.ts:94`, `lu-review/index.ts:34`) is **hook-blocked in the review step today**. Any fix must add `ls-files` to the readonly set or retire the token (tree-to-tree design retires it).
- **Env-prefixed commands classify as unknown → mutate — HIGH.** shell-quote yields `GIT_INDEX_FILE=…` as the command token → temp-index prose incantation blocked in REVIEWING. Prose-only fixes require classifier surgery.
- **Escape hatch: `luca-write` allowed in every non-IDLE phase — HIGH.** `stage-tool-matrix.ts:77`; `classifyLucaCommand` (`classify-bash-command.ts:271-309`). A new noun/verb in `LUCA_NOUN_VERBS` (`classify-bash-command.ts:242-263`) runs legally at Route B and Step 3.5 with no matrix change. CLI-shells-to-git precedent: `luca-branch-guard.ts:21`.
- **Other two bodies unconstrained — HIGH.** `phase-execute` Step 8/8.1 runs in EXECUTING (bash-mutate allowed); `execute.ts:412` is mirror-only. Payload writes to `.luca/tmp/review-prefix-sha.json` legal in any step (`TMP_PATH_PATTERN`, `handle-stage-gate-hook.ts:425`; `TMP_FILE_RE` `constants.ts:38`).

## Dimension 3 — Convention impact (the 9 literal tokens)

- **Survive unchanged (7) — HIGH**: `review-prefix-sha.json`, `diff is empty`, `provable zero overlap`, `skip round-2`, `only when provably safe`, `When in doubt, re-review`, `luca todo add --status backlog --source review-finding`.
- **Change (2) — HIGH**: `git diff <pre-fix-sha> --name-only` → the new compare literal (CLI form, e.g. `luca snapshot diff`, or tree-to-tree form); `git ls-files --others --exclude-standard` → **deleted** (untracked is inside the trees; also currently hook-blocked). The `.luca/` exclusion note survives, now scoping the tree-diff output.
- **Payload shape — MEDIUM**: `{"sha": "<HEAD>", "phase": …}` → tree sha (keep key `sha` documented as "snapshot tree sha" to minimize token churn, or introduce `tree`). ABSENT-handling literal (`git rev-parse --verify` fails → ABSENT) survives verbatim with a tree sha.
- **Consume-once + phase-key lifecycle unchanged — HIGH** (`review.ts:101`, `lu-review:41`, `phase-execute:894`). ac-grep scheme carries over; two changed literals need new definitions; add an anti-criterion pinning the *absence* of the retired form.

## Dimension 4 — Risk

- **GC pruning mid-run — LOW risk.** 2-week default window; degrades fail-safe via ABSENT branch.
- **`stash create` empty-string on clean worktree** — only relevant if that mechanism chosen; `HEAD` fallback semantically exact.
- **Legacy commit-per-task path — HIGH.** Tree-snapshot form is commit-agnostic: with per-task commits the snapshot tree ≈ HEAD tree and the diff is exactly the fix delta. Replacing the HEAD form on BOTH paths is strictly correct — no path-conditional prose.
- **False-skip hazards — HIGH.** (i) one-arg diff deleted-file artifact → never-skip (fail-safe but defeats the phase); (ii) porcelain-only manifests → genuine false-skips on edited-untracked files (quality breach); (iii) prose `GIT_INDEX_FILE` risks real-index corruption if the LLM drops an env prefix — code, not prose, should own the incantation.
- **Inter-step drift — LOW.** Between capture and compare only verify (no mutate) and `.luca/` writes occur; `.luca/` already excluded from diff scope.

## Recommended mechanism

**Two new `luca` CLI verbs (noun `snapshot`: `create` and `diff`), implemented with temp `GIT_INDEX_FILE` + `read-tree HEAD` + `add -A` + `write-tree`, compared tree-to-tree.** `create` writes/updates the `.luca/tmp/review-prefix-sha.json` payload (tree sha + phase); `diff` rebuilds the current tree and prints `--name-only` paths (`.luca/` pre-excluded). Rationale: only option that is (1) legal in REVIEWING (`luca-write`) — capture stays at Route B, gate at Step 3.5, all G-ARCH decisions and consume-once/phase-key lifecycle intact; (2) captures/compares untracked files *exactly* (tree-to-tree) — no prose-legal readonly combination can; (3) collapses fragile multi-command prose into one deterministic, testable command per site; (4) correct on both live and legacy paths. Fallback if CLI scope refused: executor-side capture/compare at execute entry/exit writing a `changedFiles` list into the payload — workable but spreads gate ground-truth across modes and keeps the prose hazard.

**Independent must-do regardless of mechanism:** fix the shipped `git ls-files` REVIEWING block — add `ls-files` to `GIT_READONLY_SUBCOMMANDS` (genuinely read-only) or retire the token (recommended design retires it).

## Open questions for discuss

1. Scope appetite: luca-cli addition (new noun + handler + tests + `LUCA_NOUN_VERBS` registration) vs instruction-only + classifier carve-outs? (#320 was deliberately instruction-only; this phase is COMPLEX.)
2. Naming: `snapshot create|diff` vs `worktree snapshot|diff`; keep payload filename `review-prefix-sha.json` (token stability) vs rename (semantic honesty, 4-body churn)? Keep key `sha` vs `tree`?
3. Should `snapshot diff` also perform the `.luca/` exclusion and the cite-overlap check (more gate in deterministic code), or stay a pure diff primitive with overlap left to prose?
4. Add `ls-files` to `GIT_READONLY_SUBCOMMANDS` anyway as a standalone classifier fix, even though the recommended design retires the token?
5. Unborn-branch edge (`read-tree HEAD` fails pre-first-commit): CLI substitutes the empty tree, or out of scope?
6. Does `phase-execute` Step 8.1 (EXECUTING, prose-legal) adopt the same CLI command for uniformity (recommended: yes — one literal set across all four bodies)?

## Key files

`packages/luca-tools/src/artifacts/modes/review.ts`, `modes/execute.ts`, `skills/lu-review/index.ts`, `skills/phase-execute/index.ts`, `packages/luca-cli/src/hook/helpers/classify-bash-command.ts`, `packages/luca-core/src/state/configs/stage-tool-matrix.ts`, `packages/luca-cli/src/write-surface/handlers/luca-branch-guard.ts` (CLI-git precedent).
