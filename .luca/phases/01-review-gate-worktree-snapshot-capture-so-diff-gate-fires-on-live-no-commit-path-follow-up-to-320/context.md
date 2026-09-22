# Context: review-gate worktree-snapshot capture (follow-up to #320)

## Phase goal (fixed by roadmap)

Make the #320 diff-gate able to actually fire on the live no-commit path by replacing the HEAD-SHA capture with a worktree snapshot, and harden the gate mechanics into deterministic CLI code.

## User decisions (decision-visualizer set, 4/4 resolved + one follow-up flip)

### D1 — Mechanism: two `luca snapshot` CLI verbs (create / diff) [user-input]

- Implement `luca snapshot create` and `luca snapshot diff` in luca-cli (write-surface handler pattern; precedent `luca-branch-guard.ts` shells to git via `Bun.spawn`).
- Snapshot via temp `GIT_INDEX_FILE`: `read-tree HEAD` → `add -A` → `write-tree` — captures tracked+staged+unstaged+untracked with ZERO side effects on the real index/worktree.
- Compare TREE-TO-TREE: `snapshot diff` rebuilds a current tree the same way and diffs the two trees (`--name-only` semantics). One-arg `git diff <tree>` is WRONG (untracked-in-index paths report as deleted — never-skip artifact).
- Register `snapshot: new Set(['create', 'diff'])` in `LUCA_NOUN_VERBS` (`classify-bash-command.ts:242`) → classified `luca-write`, legal in REVIEWING at both Route B and Step 3.5. No stage-tool-matrix change.
- Set aside: instruction-only + classifier carve-outs (real-index corruption hazard if LLM drops a `GIT_INDEX_FILE=` prefix; security-sensitive classifier surgery); executor-side capture (gate would trust an unverifiable precomputed list — the only design with a false-skip path).

### D2 — Gate logic: CLI owns the overlap check too [user-input]

- `luca snapshot diff` also parses the prior `File: {path:line}` cites (MUST-FIX **and** SHOULD-FIX) from `audits/<reviewer>.md` files and returns a machine verdict: `empty | zero-overlap | overlap | ambiguous`.
- The empty-cite-set guard and the conservative default live in TESTED CODE: empty cite set + non-empty diff → `ambiguous`-class verdict (→ full re-review); any parse failure → `ambiguous` (fail-safe). This makes both #320 round-1 bug classes (vacuous zero-overlap, cite-set/severity mismatch) structurally impossible.
- Gate prose in the 4 bodies collapses to: run the command, act on its verdict. The `.luca/` exclusion moves into the CLI diff output.
- Accepted coupling: the `File: {path:line}` audit format becomes a CLI contract — reviewer.ts audit-format prose gains an anti-drift note; format drift degrades to `ambiguous` (fail-safe, silently disables the skip — acceptable).

### D3 — Standalone classifier fix: add `ls-files` to GIT_READONLY_SUBCOMMANDS [user-input]

- One-line fix in `classify-bash-command.ts:84` set + one test case. Fixes the latent #320 bug (shipped `git ls-files` union command is hook-blocked in the review step) independent of the token retirement.

### D4 — Naming: RENAME to snapshot-tree semantics [user-override after follow-up]

- New filename `review-prefix-tree.json`, payload key `tree`: `{"tree": "<snapshot tree sha>", "phase": "<slug>"}`.
- User principle (drove the flip from an initial keep-sha pick): ambiguous prose that can be misread almost always leads to agent mistakes; 'sha' invites a future editor to reintroduce a commit-based diff. 'sha' confusion is not practically measurable, so the keep-option's acceptance condition was unsatisfiable.
- One-time mechanical churn across all ~9 sites (3 writers, 3 readers, 3 consume steps) in the 4 bodies; ac-01 redefined to the new literal; NEW anti-criterion pins the ABSENCE of the retired `review-prefix-sha.json` name.
- Consume-once + phase-key lifecycle semantics carry over UNCHANGED (only the filename/key spelling changes). `git rev-parse --verify` works on tree shas — ABSENT-handling logic carries over.

## Technical calls locked by research (AI-owned, per recommendation)

- Unborn-branch edge: `read-tree HEAD` fails pre-first-commit → CLI substitutes the empty tree (in scope, cheap).
- phase-execute Step 8.1 adopts the same CLI commands (one literal set across all four bodies; EXECUTING allows them trivially).
- GC risk accepted: dangling snapshot trees survive ≥ gc.pruneExpire (2-week default); pruned-tree edge degrades via the existing ABSENT branch (fail-safe).

## HARD CONSTRAINT (carried from #320)

Never sacrifice output or review quality to save cost. The gate skips only on a provably-safe verdict; every ambiguity re-reviews; skips never drop findings (backlog capture stays). Fan-out, perspective count, cold isolation, independence auditor, ≥2-perspective promotion: UNCHANGED.

## Explicitly NOT shipping

- Lever-1a (shared precomputed diff artifact for reviewers) and Lever-1b (consolidate reviewers) — still out.
- No LucaState schema change; payload stays in `.luca/tmp/` (contract-legal).
- No stage-tool-matrix changes; no classifier changes beyond the one-line `ls-files` readonly addition.
