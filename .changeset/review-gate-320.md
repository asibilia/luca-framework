---
"@alecsibilia/luca-tools": minor
---

feat: diff-gated convergence re-review — skip the round-2 reviewer fan-out only when the post-fix diff is provably incapable of changing a finding (#320)

Route B in review mode forced a full round-2 (all N reviewers) whenever round 1 produced any MUST-FIX/SHOULD-FIX, even when the fix diff was empty or touched none of the cited locations. Adds a conservative re-entry diff gate across the four review-driving instruction bodies — instruction-body only, no luca-core change.

- **Stash convention**: pre-fix HEAD SHA captured to a runtime stash file (review-prefix-sha.json under the repo-scoped .luca/tmp/ scratch dir, payload `{"sha", "phase"}`) at every loop-back writer site (`modes/review.ts` Route B, `skills/lu-review`, `skills/phase-execute` Step 8.1); consume-once deletion on every gate outcome.
- **Gate** (review mode Step 3.5, mirrored in `lu-review` and `phase-execute`): re-entry diff is working-tree-inclusive — `git diff <pre-fix-sha> --name-only` unioned with `git ls-files --others --exclude-standard` (never the always-empty `<sha>..HEAD` form on the no-commit path). Skip round-2 only when the diff is empty OR has provable zero overlap with the prior round's MUST-FIX and SHOULD-FIX `File:line` cites. Missing/unparsable stash, phase mismatch, unresolvable SHA, empty cite set with a non-empty diff, any overlap, any ambiguity — full round-2. When in doubt, re-review.
- **Post-skip routing**: unresolved findings are backlog-captured (`luca todo add --status backlog --source review-finding`), the skip reason is noted in the audit artifact, and the loop exits toward learn — a skip never drops findings and never re-fires Route B.
- **Quality-neutral by construction**: reviewer fan-out, perspective count, cold isolation, independence auditor, and the >=2-perspective severity promotion are unchanged; re-verify is explicitly NOT gated (its acceptance criteria are not location-scoped). `modes/execute.ts` re-entry carries a cross-reference mirror to the authoritative gate.

Scope: Lever-2 only — no Lever-1a shared precomputed-diff artifact, no reviewer consolidation. Instruction-body edits reach installed harnesses via `bun run build` + a `luca init` re-run.
