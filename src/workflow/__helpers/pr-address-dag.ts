/**
 * pr-address workflow DAG definition for gap detection.
 *
 * Defines the pr-address workflow as a `WorkflowDAG` (using
 * `WorkflowDAGSchema` from `workflow.schemas.ts`). This DAG is consumed
 * by the gap detector for post-execution coverage auditing.
 *
 * **This DAG is NOT used for runtime execution.** The orchestrator prompt
 * drives execution via Agent() calls. The DAG serves as the formal
 * specification of what steps MUST execute, enabling Layer 4 (gap
 * detection) of the anti-skip enforcement architecture.
 *
 * **PREMORTEM Constraint #2:** pr-debate and pr-learn steps are marked
 * `optional: true`. This prevents the gap detector from emitting
 * `fail` severity when SKIP_DEBATE or SKIP_LEARN events fire during
 * a clean run without split verdicts or learnable comments.
 *
 * **Bridge integration:**
 *
 * ```bash
 * # Via bridge (reads checkpoint from persisted state):
 * luca-bridge audit-gaps --dag=pr-address
 *
 * # Via direct import (for non-bridge consumers like lu-verifier):
 * import { prAddressDAG } from "~/workflow/__helpers/pr-address-dag";
 * import { detectGaps } from "~/workflow";
 * const result = detectGaps(prAddressDAG, checkpoint);
 * ```
 *
 * @see .planning/phases/223-anti-skip-pilot/01-CONTEXT.md Decision #3
 * @see .planning/phases/223-anti-skip-pilot/01-PREMORTEM.md Constraint #2
 * @see src/workflow/__helpers/gap-detector.ts
 */

import type { WorkflowDAG } from "../__schemas/workflow.schemas";

/**
 * pr-address workflow DAG — 10 steps covering the full PR comment
 * address lifecycle.
 *
 * Step mapping to Agent() sub-agents:
 *
 * | Step ID       | Handler   | Agent Name | Optional |
 * |---------------|-----------|------------|----------|
 * | pr-fetch      | fetch     | fetch      | false    |
 * | pr-categorize | validate  | validate   | false    |
 * | pr-validate   | validate  | validate   | false    |
 * | pr-debate     | debate    | debate     | true     |
 * | pr-plan       | fix       | fix        | false    |
 * | pr-fix        | fix       | fix        | false    |
 * | pr-verify     | fix       | fix        | false    |
 * | pr-learn      | learn     | learn      | true     |
 * | pr-respond    | respond   | respond    | false    |
 * | pr-push       | respond   | respond    | false    |
 */
export const prAddressDAG: WorkflowDAG = {
  name: "pr-address",
  version: "1.0.0",
  steps: [
    {
      id: "pr-fetch",
      name: "Fetch PR data",
      handler: "fetch",
      dependsOn: [],
      optional: false,
      metadata: {
        category: "gate",
        parallel: false,
        description:
          "Resolve PR context and fetch comments, reviews, and diff from GitHub.",
      },
    },
    {
      id: "pr-categorize",
      name: "Categorize comments",
      handler: "validate",
      dependsOn: ["pr-fetch"],
      optional: false,
      metadata: {
        category: "classify",
        parallel: false,
        description:
          "Categorize PR comments by concern type (security, architecture, etc.).",
      },
    },
    {
      id: "pr-validate",
      name: "Validate concerns",
      handler: "validate",
      dependsOn: ["pr-categorize"],
      optional: false,
      metadata: {
        category: "verify",
        parallel: false,
        description:
          "Spawn reviewer agents in parallel to validate categorized concerns.",
      },
    },
    {
      id: "pr-debate",
      name: "Debate split verdicts",
      handler: "debate",
      dependsOn: ["pr-validate"],
      optional: true, // PREMORTEM Constraint #2
      metadata: {
        category: "verify",
        parallel: false,
        description:
          "Debate split verdicts where validators produced a tie or narrow majority.",
      },
    },
    {
      id: "pr-plan",
      name: "Plan fixes",
      handler: "fix",
      dependsOn: ["pr-validate"],
      optional: false,
      metadata: {
        category: "plan",
        parallel: false,
        description: "Create fix plans for valid concerns via lu-planner.",
      },
    },
    {
      id: "pr-fix",
      name: "Execute fixes",
      handler: "fix",
      dependsOn: ["pr-plan"],
      optional: false,
      metadata: {
        category: "execute",
        parallel: false,
        description: "Implement fixes with atomic commits via lu-executor.",
      },
    },
    {
      id: "pr-verify",
      name: "Verify fixes",
      handler: "fix",
      dependsOn: ["pr-fix"],
      optional: false,
      metadata: {
        category: "verify",
        parallel: false,
        description: "Verify fixes address original concerns via lu-verifier.",
      },
    },
    {
      id: "pr-learn",
      name: "Capture learnings",
      handler: "learn",
      dependsOn: ["pr-verify"],
      optional: true, // PREMORTEM Constraint #2
      metadata: {
        category: "learn",
        parallel: false,
        description: "Extract PR review pitfalls to MuninnDB via lu-learner.",
      },
    },
    {
      id: "pr-respond",
      name: "Post responses",
      handler: "respond",
      dependsOn: ["pr-verify"],
      optional: false,
      metadata: {
        category: "commit",
        parallel: false,
        description: "Post replies to PR comments and summary comment.",
      },
    },
    {
      id: "pr-push",
      name: "Push changes",
      handler: "respond",
      dependsOn: ["pr-respond"],
      optional: false,
      metadata: {
        category: "commit",
        parallel: false,
        description: "Push all fix commits to the remote branch.",
      },
    },
  ],
};
