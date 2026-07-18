/**
 * lu-review skill — Re-enter the Luca pipeline at the review step to audit completed work.
 *
 * Ported from fd0b169be^:packages/luca-framework/skills/commands/lu-review.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# /lu-review

Run the **review** step against the active phase — a structured multi-perspective audit of executed code. Use this after \`/phase-execute\` + verification, or to re-audit a phase before closing it.

You are orchestration only: read state, run the reviewers, let them persist their audits with the \`Write\` tool.

## Step 0 — Read state

Run \`luca state read\`. The review step has exactly one legal entry: \`verify → review\`. There is no bypass — \`luca state advance\` rejects illegal jumps.

- \`pipelineStep === "verify"\` → run \`luca state advance --to-step review\`, then proceed.
- \`pipelineStep === "review"\` → already there, proceed.
- anything else → STOP. Tell the user the pipeline must reach \`verify\` before review can run, and point them at \`/lu\` to drive it there. Do not attempt to force the transition.

Run \`luca phase current\` to get the active slug. If no phase is active, abort.

## Re-run gate

Applies ONLY when \`.luca/tmp/review-prefix-sha.json\` exists — i.e., a previous review pass directed the user back to \`/phase-execute\` and stashed the pre-fix HEAD SHA. On a first pass (no stash file), skip this gate entirely and run the reviewers.

The gate may skip round-2 — the reviewer fan-out below — but **only when provably safe**. When in doubt, re-review.

1. Read the pre-fix stash \`.luca/tmp/review-prefix-sha.json\` (payload \`{"sha": "<HEAD>", "phase": "<phase slug>"}\`). File unparsable, \`phase\` not matching the active phase slug, or a \`sha\` that no longer resolves (\`git rev-parse --verify\` fails) → treat the stash as ABSENT — this is a first pass, run the full review (run the reviewers).
2. Compute the changed set: \`git diff <pre-fix-sha> --name-only\` unioned with \`git ls-files --others --exclude-standard\`. Scoping note: \`.luca/\` paths in the untracked union are pipeline-generated artifacts, not reviewable code — exclude them from the union (this keeps the empty-diff branch reachable).
3. Collect the prior MUST-FIX and SHOULD-FIX \`File:line\` cites from the previous pass's \`audits/<reviewer>.md\` files.
4. Decide:
   - **diff is empty** (both outputs empty after the \`.luca/\` exclusion) → skip round-2.
   - The prior cite set is **EMPTY** and the diff is NON-EMPTY → full re-review (run the reviewers) — never a vacuous skip on an empty cite set.
   - Changed paths have **provable zero overlap** with the prior MUST-FIX and SHOULD-FIX \`File:line\` cites → skip round-2.
   - ANY overlap, ANY parse failure, or ANY ambiguity (a cite whose path cannot be resolved, a malformed audit file) → full re-review (run the reviewers).
5. **Consume the stash**: whichever branch step 4 selects (skip OR full re-review — and also when step 1 treats the stash as ABSENT), delete \`.luca/tmp/review-prefix-sha.json\` now. The stash is consume-once; every loop-back re-stashes a fresh value (Aggregate below).

**Post-skip routing** (when the gate skips round-2):

1. Capture every unresolved MUST-FIX and SHOULD-FIX item as a backlog todo: \`luca todo add --status backlog --source review-finding …\` — nothing is lost.
2. Note the skip reason (empty diff or zero overlap, citing the pre-fix SHA) in the active phase's audit artifact.
3. Advance with \`luca state advance --to-step learn\`. A skip proceeds toward learn — it NEVER loops back into this gate.

## Run the reviewers

Spawn the \`reviewer\` subagent via the \`Agent\` tool — once per perspective, in parallel:

- \`architect\` — structural correctness, dependency direction, API surface
- \`dx\` — readability, error messages, ergonomics
- \`security\` — input validation, injection, secret handling
- \`simplification\` — unnecessary complexity, dead code
- \`test-quality\` — vacuous mocks, presence-only assertions, coverage-by-existence

Pass each reviewer its assigned perspective and the active phase slug. Each reviewer persists its own audit by writing \`audits/<reviewer>.md\` with the \`Write\` tool to the canonical phase path (the stage-gate hook only permits that write in the \`review\` step).

Scale the perspective set to complexity: TRIVIAL/SIMPLE may run only \`architect\` + \`security\`; MODERATE+ runs the full set.

## Aggregate

When all reviewers return, summarize for the user:

- Total MUST-FIX / SHOULD-FIX / NOTE counts across audits
- Whether any reviewer returned \`REQUEST_CHANGES\`

If there are MUST-FIX findings, the phase is not ready to advance — first stash the pre-fix HEAD SHA: write \`{"sha": "<HEAD>", "phase": "<active phase slug>"}\` (SHA from \`git rev-parse HEAD\`, phase from \`luca phase current\`) to \`.luca/tmp/review-prefix-sha.json\` via the native Write tool, then direct the user back to \`/phase-execute\` to address them (the \`verify → checks → execute\` loop-back path). The re-run gate reads this SHA on the next review pass. If all reviewers APPROVE, advance with \`luca state advance --to-step learn\`.

## What you must NOT do

- Do NOT force a transition into \`review\` from a non-\`verify\` state. Honor the no-bypass policy.
- Do NOT write audit files yourself — the reviewers write \`audits/<reviewer>.md\` with the \`Write\` tool to the canonical path; the hook blocks any other write.
- Do NOT fix the findings yourself in this skill. Review reports; execute fixes.

$ARGUMENTS
`

export const luReviewSkill = defineSkill({
    name: 'lu-review',
    description:
        'Re-enter the Luca pipeline at the review step to audit completed work.',
    body: BODY,
})
