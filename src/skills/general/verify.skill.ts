/**
 * verify Skill — Thin orchestrator for UAT testing and code review.
 *
 * Decomposed from the monolithic verify skill into 4 sub-skills:
 * - verify-extract: Find summaries, extract deliverables, create UAT template
 * - verify-test: Present tests interactively, collect pass/fail results
 * - verify-diagnose: Diagnose failures, create fix plans (Path B only)
 * - verify-review: Run code quality review swarm (Path A only)
 *
 * This orchestrator contains ONLY:
 * - Arg parsing (phase number, --gaps-only flag)
 * - Skill() calls to sub-skills
 * - Context file reads for path decisions
 * - current_state writes after every transition
 * - Summary reporting
 *
 * **Divergent terminal paths:**
 * - Path A (no issues): idle -> extracted -> tested -> reviewed (terminal)
 * - Path B (issues found): idle -> extracted -> tested -> diagnosed (terminal)
 *
 * **CRITICAL:** Write `current_state` to context file after EVERY state
 * transition. The pre-step-verify hook reads this to enforce ordering.
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 9
 * @see src/skills/__schemas/states/verify.states.ts
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const verifyConfig: SkillConfig = {
  frontmatter: {
    name: "verify",
    description:
      "Validate built features through conversational UAT testing against acceptance criteria.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Verify Work — Thin Orchestrator

Validate built features through conversational testing with persistent state.

**Arguments:** \`[phase_number] [--gaps-only]\`

**Output:** \`{phase}-UAT.md\` tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for \`/phase-execute --gaps-only\`.

## Orchestration Protocol

This skill is a **thin orchestrator**. It contains ONLY:
- Arg parsing
- Skill() calls to sub-skills
- Context file reads for path decisions
- \`current_state\` writes after every state transition
- Summary reporting to user

**Zero inline logic constraint:** No \`gh\` commands, no \`Task()\` spawns, no template parsing, no data processing. All business logic lives in the sub-skills.

**NEVER inline sub-skill logic.** If a sub-skill fails, re-invoke it. Do NOT copy its implementation into this orchestrator.

## State Machine

\`\`\`
idle -> EXTRACT_COMPLETE -> extracted -> TEST_COMPLETE -> tested
  Path A (no issues): tested -> SKIP_DIAGNOSE -> reviewed (terminal)
  Path B (issues):    tested -> DIAGNOSE_COMPLETE -> diagnosed (terminal)
\`\`\`

**CRITICAL:** Write \`current_state\` to context file after EVERY transition:
\`\`\`typescript
import { writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";
await writeVerifyContext({ current_state: "extracted" });
\`\`\`

## Process

### Step 0: Parse Arguments and Initialize Context

Parse the phase number from arguments. Check for \`--gaps-only\` flag.

Initialize the context file:

\`\`\`typescript
import { VERIFY_CONTEXT_PATH, writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";
import { unlinkSync } from "fs";

// Clear any previous context (fresh run)
try { unlinkSync(VERIFY_CONTEXT_PATH); } catch {}

// Initialize with context_version and current_state
await writeVerifyContext({});
// Write initial state
await writeVerifyContext({ current_state: "idle" });
\`\`\`

### Step 1: Extract (idle -> extracted)

\`\`\`
Skill("verify-extract", "{phase_number}")
\`\`\`

On success, write state transition:
\`\`\`typescript
await writeVerifyContext({ current_state: "extracted" });
\`\`\`

### Step 2: Test (extracted -> tested)

\`\`\`
Skill("verify-test", "{phase_number}")
\`\`\`

On success, write state transition:
\`\`\`typescript
await writeVerifyContext({ current_state: "tested" });
\`\`\`

### Step 3: Path Decision (tested -> diagnosed OR reviewed)

Read the context file to check \`issues_found\`:

\`\`\`typescript
import { readVerifyContext } from "src/skills/__schemas/verify-context.schemas";

const result = await readVerifyContext();
if (!result.success) { /* ABORT */ }
const issuesFound = result.data.verify_test?.issues_found ?? false;
\`\`\`

#### Path B: Issues Found (tested -> diagnosed)

\`\`\`
Skill("verify-diagnose", "{phase_number}")
\`\`\`

On success, write state transition:
\`\`\`typescript
await writeVerifyContext({ current_state: "diagnosed" });
\`\`\`

**diagnosed is terminal.** Report to user and suggest \`/phase-execute --gaps-only\`.

#### Path A: No Issues (tested -> reviewed)

\`\`\`
Skill("verify-review", "{phase_number}")
\`\`\`

On success, write state transition:
\`\`\`typescript
await writeVerifyContext({ current_state: "reviewed" });
\`\`\`

**reviewed is terminal.** Report to user and suggest next phase.

### Step 4: Report Summary

Read final context and report to user based on terminal state.

**If diagnosed (Path B — issues found):**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE {N} ISSUES FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{passed}/{total} tests passed
{failed} issues diagnosed
Fix plans verified

Next: /phase-execute {N} --gaps-only
\`\`\`

**If reviewed (Path A — all clean):**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE {N} VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed
Code quality review completed

Next: /phase-discuss {N+1} or /milestone-audit
\`\`\`

**If reviewed with quality issues:**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE {N} CODE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed
{X} code quality issues found

Options:
1. Fix now
2. Continue
3. Review details
\`\`\`

## Error Handling

If any sub-skill fails, send ABORT to the state machine:
\`\`\`typescript
await writeVerifyContext({ current_state: "failed" });
\`\`\`

Report the failure to the user with the failing sub-skill name.

## Anti-Patterns

- **DO NOT** contain any gh commands, Task() spawns, data processing, or file reads beyond context file checks
- **DO NOT** diagnose, plan, or review code — delegate to sub-skills
- **DO NOT** skip writing current_state — the pre-step hook depends on it
- **DO NOT** silently omit a sub-skill call — every transition must be explicit

## Success Criteria

- [ ] UAT.md created with tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] If UAT issues: parallel debug agents diagnose root causes
- [ ] If UAT issues: lu-planner creates fix plans from diagnosed gaps
- [ ] If UAT issues: ready for \`/phase-execute --gaps-only\`
- [ ] If UAT passes: code quality review runs on changed files
- [ ] current_state written after every transition
- [ ] Orchestrator contains ONLY Skill() calls + context reads + state writes
</main>`,
      order: 1,
    },
  ],
};

export const verifySkill = createSkill(verifyConfig);
