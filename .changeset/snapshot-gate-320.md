---
"@alecsibilia/luca-cli": minor
"@alecsibilia/luca-tools": minor
---

feat: worktree-snapshot capture so the diff-gated convergence re-review fires on the live no-commit path (follow-up to #320)

The #320 gate keyed on a pre-fix HEAD SHA, but on the live review-fix path fixes are staged without commits — HEAD never moves, so the `git diff <sha>` re-entry check was structurally empty and the gate degraded to always-full-re-review. Moves capture and verdict computation from instruction-body git prose into two deterministic CLI verbs.

- **`luca snapshot create`** (luca-cli write surface): builds a worktree tree via a UUID temp `GIT_INDEX_FILE` (`read-tree HEAD` → `add -A` → `write-tree`; unborn branch falls back to an empty read-tree base, worktree still captured; real index never mutated) and writes `{"tree": "<snapshot tree sha>", "phase": "<slug>"}` to the repo-scoped `.luca/tmp/review-prefix-tree.json`. The `tree` key is a snapshot tree sha, never a commit sha.
- **`luca snapshot diff`**: consumes the payload (deletes it before validation on every path — consume-once now lives in the CLI, not the hook-blocked body), rebuilds the current worktree tree, runs a tree-to-tree `git -c core.quotepath=false diff <prior> <current> --name-only --no-renames`, excludes `.luca/` in code, parses MUST-FIX/SHOULD-FIX `File: path:line` cites from the active phase's `audits/*.md`, and prints a machine verdict `empty | zero-overlap | overlap | ambiguous`. Coded fail-safes all degrade to `ambiguous` (full re-review): missing/unparsable/mismatched payload, unresolvable tree, cite-parse failure (absolute, backslashed, drive-lettered, `.`/`..`, `line:col`, or multi-path cites; cite-less actionable findings), empty cite set with a non-empty diff.
- **Classifier**: `snapshot` noun registered (`create|diff` → luca-write, legal in REVIEWING); `ls-files` added to `GIT_READONLY_SUBCOMMANDS`.
- **luca-tools gate bodies**: the four review-driving bodies (`modes/review.ts` authoritative, `modes/execute.ts` cross-ref, `skills/lu-review`, `skills/phase-execute`) rework to run-command-act-on-verdict — skip round-2 only on `empty`/`zero-overlap`; `overlap`/`ambiguous` → full re-review; post-skip backlog capture and the "When in doubt, re-review" default retained; reviewer fan-out, cold isolation, and independence-auditor literals untouched. `subagents/reviewer.ts` gains an anti-drift note pinning `File: path:line` as a CLI parsing contract.

Scope: luca-cli + luca-tools only, no luca-core change. Instruction-body edits reach installed harnesses via `bun run build` + a `luca init` re-run.
