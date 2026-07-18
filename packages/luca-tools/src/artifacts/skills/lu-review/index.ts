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

Applies ONLY when \`.luca/tmp/review-prefix-tree.json\` exists — i.e., a previous review pass directed the user back to \`/phase-execute\` and captured a pre-fix worktree snapshot (Aggregate below). **ABSENT check**: if the payload file is MISSING, the snapshot is ABSENT → this is a first pass, skip this gate entirely and run the full review (run the reviewers). That is the ONLY body-side check — ALL validation (phase mismatch, unresolvable tree, parse failures) is delegated to the CLI; never short-circuit on payload contents here.

The gate may skip round-2 — the reviewer fan-out below — but **only when provably safe**. When in doubt, re-review.

1. Run \`luca snapshot diff\`. The CLI rebuilds the current worktree snapshot tree, performs the tree-to-tree compare against the stashed snapshot tree (\`.luca/\` excluded), parses the prior MUST-FIX and SHOULD-FIX \`File:line\` cites from the previous pass's \`audits/<reviewer>.md\` files, and returns a verdict: \`empty\` | \`zero-overlap\` | \`overlap\` | \`ambiguous\`. The command also CONSUMES the payload — consume-once lives in the CLI, so do NOT delete the file yourself; every loop-back re-creates a fresh snapshot (Aggregate below).
2. Act on the verdict:
   - \`empty\` or \`zero-overlap\` → skip round-2 (the reviewer fan-out).
   - \`overlap\` or \`ambiguous\` → full re-review (run the reviewers).

**Post-skip routing** (when the gate skips round-2):

1. Capture every unresolved MUST-FIX and SHOULD-FIX item as a backlog todo: \`luca todo add --status backlog --source review-finding …\` — nothing is lost.
2. Note the skip reason (verdict \`empty\` or \`zero-overlap\`, citing the snapshot tree sha) in the active phase's audit artifact.
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

If there are MUST-FIX findings, the phase is not ready to advance — first run \`luca snapshot create\` — it snapshots the current worktree (temp-index tree, commit-agnostic) and writes \`{"tree": "<snapshot tree sha>", "phase": "<slug>"}\` to \`.luca/tmp/review-prefix-tree.json\`; the \`tree\` key is a \`snapshot tree\` sha, never a commit sha — then direct the user back to \`/phase-execute\` to address them (the \`verify → checks → execute\` loop-back path). The re-run gate consumes this snapshot on the next review pass. If all reviewers APPROVE, advance with \`luca state advance --to-step learn\`.

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
