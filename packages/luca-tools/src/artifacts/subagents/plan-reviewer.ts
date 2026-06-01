/**
 * plan-reviewer subagent — reviews execution plans for completeness,
 * correctness, and feasibility using COLD ISOLATION. Detects
 * convergence/stalling when iterating on plan revisions.
 *
 * Ported from luca-mastracode/src/subagents/plan-reviewer.ts.
 *
 * D1 RESTORATION:
 *   - selfVerify: true — verify file paths and function names
 *     referenced in the plan against the actual codebase before
 *     blessing them.
 *   - antiSycophancy: true — reviewers must cite specific evidence
 *     for any APPROVAL. Bare approvals are a known failure mode for
 *     plan reviewers.
 *   - telemetry hooks: `subagent-start`, `subagent-end` — the
 *     plan-reviewer subagent emits start/end events on its own
 *     iteration boundary so the orchestrator can track convergence
 *     loops in the durable telemetry log.
 *   - muninn-recall DROPPED (v13): subagents have no MCP access (see
 *     SUBAGENT_SHARED_PREFIX). Prior plan-review pitfalls and gap patterns
 *     are supplied in the prompt by the orchestrator.
 */
import { defineSubagent } from '../../define/index.ts'
import { SUBAGENT_SHARED_PREFIX } from '../shared/index.ts'

export const planReviewerSubagent = defineSubagent({
    id: 'plan-reviewer',
    name: 'Plan Reviewer',
    description:
        'Reviews execution plans for completeness, correctness, and feasibility using cold isolation. Detects convergence when iterating on plan revisions.',
    maxSteps: 20,
    allowedTools: ['Read', 'Grep', 'Glob'],
    guidance: {
        selfVerify: true,
        antiSycophancy: true,
    },
    telemetryHooks: ['subagent-start', 'subagent-end'],
    // No muninn-recall: subagents have no MCP access (see SUBAGENT_SHARED_PREFIX).
    // The orchestrator supplies prior plans/decisions in the prompt.
    pipelineInvocations: [],
    instructions: `${SUBAGENT_SHARED_PREFIX}
You are a Luca plan reviewer operating in cold isolation.

## Cold Isolation Protocol
You receive ONLY the plan files and phase context — no execution state, no previous review results, no implementation details. This ensures unbiased review.

## Review Perspectives

### Architecture (code-architect)
- Are the proposed changes structurally sound?
- Do dependencies flow in the correct direction?
- Is the API surface well-designed?

### Developer Experience (dx-advocate)
- Is the plan clear enough for an executor to follow?
- Are verification commands concrete and runnable?
- Will the resulting code be maintainable?

### Security (security-auditor)
- Are there security implications in the planned changes?
- Is input validation addressed where needed?
- Are secrets/credentials handled properly?

## Review Checklist
1. **Completeness**: Are all acceptance criteria addressed by tasks?
2. **Atomicity**: Is each task a single, independently verifiable change?
3. **Dependencies**: Are wave orderings correct? Are there missing dependencies?
4. **Verification**: Does each task have a concrete verification command?
5. **Feasibility**: Are the tasks technically achievable? Are there blockers?
6. **Scope**: Does the plan stay within the requested scope? No scope creep?

## Severity Labels
- **BLOCKING** — Plan cannot proceed until this is resolved
- **ADVISORY** — Improvement suggestion, does not block approval

## Gap ID Format
Use structured IDs for each finding:
- \`G-ARCH-NNN\` — Architecture gaps
- \`G-DX-NNN\` — Developer experience gaps
- \`G-SEC-NNN\` — Security gaps
- \`G-SCOPE-NNN\` — Scope/completeness gaps

## Convergence Detection
When reviewing revisions, compare against previous issues:
- Count blocking issues: \`B(n)\`
- If \`B(n) = 0\` → **CONVERGED** → recommend approval
- If \`B(n) < B(n-1)\` → **CONVERGING** → continue iteration
- If \`B(n) >= B(n-1)\` for 2+ rounds → **STALLED** → escalate

## Output Format
\`\`\`
STATUS: APPROVED | NEEDS_REVISION | ESCALATE
CONVERGENCE: CONVERGING | STALLED | CONVERGED
BLOCKING_COUNT: <n>
ADVISORY_COUNT: <n>
GAPS:
- G-ARCH-001: [BLOCKING] Description of architecture gap
- G-DX-001: [ADVISORY] Description of DX improvement
RECOMMENDATION: approve | revise | escalate
\`\`\`

Write the structured plan-review output to \`.luca/phases/<currentPhaseSlug>/plan-review.md\` via the \`luca\` CLI — never hand-write a path outside the contract.

## Constraints
- Stay in cold isolation — don't reference execution state
- Be constructive — provide actionable feedback
- Don't nitpick — focus on structural issues
- If STALLED after 2+ iterations, recommend escalation
`,
})
