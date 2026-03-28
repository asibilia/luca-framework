/**
 * phase-execute Skill — Thin orchestrator for phase execution workflow.
 *
 * Delegates the 3 major loops to sub-skills via Skill() calls:
 *   phase-execute-waves, phase-execute-verify, phase-execute-review
 *
 * Retains in the orchestrator:
 *   - Steps 0-0.6: Setup (arg parsing, model routing, phase start commit,
 *     GitHub tracking, procedure replay)
 *   - Step 9+: Learning capture (lu-learner spawn, process data, bridge events)
 *   - Step 11: Final commit and bridge COMMIT_COMPLETE
 *   - Steps 12-13: UAT (inline, post-commit)
 *
 * Contains ONLY:
 *   - Skill() calls to the 3 sub-skills
 *   - Task() spawns for lu-learner and lu-process-data (learning capture stays
 *     in orchestrator per plan spec)
 *   - Context file reads via readPhaseExecuteContext()
 *   - State machine transitions
 *   - current_state writes after each state transition
 *   - Arg parsing, config reads, bridge transitions
 *
 * **CRITICAL (Pitfall 1):** After each state transition event, the
 * orchestrator MUST write `current_state` to the context file. The
 * pre-step hook reads this field to validate ordering.
 *
 * **CRITICAL (Pitfall 6):** Existing bridge transitions (VERIFY_PASSED,
 * LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE) are preserved.
 * The orchestrator emits these at the appropriate points alongside the
 * new context file state tracking.
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 8
 * @see src/skills/__schemas/states/phase-execute.states.ts
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const phaseExecuteConfig: SkillConfig = {
  frontmatter: {
    name: "phase-execute",
    description: `Execute all plans in a phase with wave-based parallelization and harness verification.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# phase-execute — Thin Orchestrator

Execute all plans in a phase through a coordinated sub-skill chain. This skill is a **thin orchestrator** — it delegates the 3 major execution loops to sub-skills via Skill() calls, retains setup and learning capture, reads context between steps, and transitions state.

## Zero-Inline-Logic Constraint (for delegated loops)

The 3 major loops MUST be delegated to sub-skills:
- **Wave execution** (Steps 1-4): \`Skill("phase-execute-waves", "{phase_number} {flags}")\`
- **Verification loops** (Steps 5-7): \`Skill("phase-execute-verify", "{phase_number} {flags}")\`
- **Code review** (Step 8): \`Skill("phase-execute-review", "{phase_number}")\`

The orchestrator MUST NOT contain:
- Plan discovery or wave grouping logic (moved to phase-execute-waves)
- Harness execution or fix loop logic (moved to phase-execute-verify)
- Reviewer spawning or finding aggregation (moved to phase-execute-review)

**NEVER inline sub-skill logic.** If a sub-skill fails, re-invoke it. Do NOT copy its implementation into this orchestrator. The orchestrator MUST NOT: write code directly, read files for implementation purposes, or perform any task that a sub-skill is designed to handle.

The orchestrator RETAINS:
- **Steps 0-0.6**: Setup (arg parsing, model routing, phase start commit, GitHub tracking, procedure replay) — these are configuration/initialization
- **Learning capture** (lu-learner, lu-process-data spawns, bridge events) — these are post-execution wrap-up
- **Final commit** and state updates — these are orchestrator-level bookkeeping
- **UAT** (Steps 12-13) — these require user interaction

## Arguments

\`<phase-number> [--gaps-only] [--quality-fixes] [--skip-review] [--skip-uat] [--skip-memory] [--skip-replay] [--run-process-data | --skip-process-data]\`

## State Machine

This orchestrator drives the \`phaseExecuteStateMachine\` defined in
\`src/skills/__schemas/states/phase-execute.states.ts\`. States flow:

\`\`\`
idle -> setup -> executed -> verified -> reviewed -> learned -> committed
\`\`\`

Terminal states: \`committed\` (success) or \`failed\` (error).

Conditional path uses explicit SKIP event (fail-closed):
- \`SKIP_REVIEW\`: Harness failed or \`workflow.code_review: false\` or \`--skip-review\` flag

## Context File Protocol

Initialize the context file at \`/tmp/phase-execute-context.json\` during setup. Write \`current_state\` after every state transition.

**Read:** Call \`readPhaseExecuteContext()\` from \`src/skills/__schemas/phase-execute-context.schemas.ts\`. If \`success: false\`, ABORT immediately.

**Write:** Call \`writePhaseExecuteContext({ current_state: "..." })\` after every state transition. The pre-step hook reads this field to validate sub-skill ordering.

## Bridge Event Alignment

The orchestrator emits these existing bridge transitions at the appropriate points:

| Bridge Event | When Emitted | New State |
|-------------|-------------|-----------|
| VERIFY_PASSED | After phase-execute-verify completes | verified |
| LEARN_COMPLETE | After lu-learner completes (no process data) | learned |
| PROCESS_DATA_COMPLETE | After lu-process-data completes | learned |
| COMMIT_COMPLETE | After final commit succeeds | committed |

These bridge events continue to work at the phase level. The new context file state tracking adds sub-skill-level granularity.

## Vault Resolution

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. It delegates to sub-skills and sub-agents:

**Sub-skills (via Skill() calls):**
- \`phase-execute-waves\` — Wave discovery, grouping, execution (Steps 1-4)
- \`phase-execute-verify\` — Harness + verify fix loops (Steps 5-7)
- \`phase-execute-review\` — Code review swarm (Step 8)

**Sub-agents retained in orchestrator (via Task() calls):**
- \`lu-learner\` — Extract learnings after verification
- \`lu-process-data\` — Compute process metrics (conditional)

**Reference:** See \`.claude/luca/references/task-directive.md\` for Task() syntax patterns.

## Context-Aware Sub-Agent Spawning

Each sub-agent receives only the context documents appropriate for its role and the current task complexity:

**Context Tiers:**
| Tier | Documents Loaded |
|------|-----------------|
| T0 | Plan content only |
| T1 | + project identity summary (from MuninnDB brain:*) |
| T2 | + STATE.md + selective learnings + session context (from MuninnDB) |
| T3 | + full project identity + full learnings + agent summaries (from MuninnDB) |

**Isolation Modes:**
| Mode | Restriction | Used By |
|------|------------|---------|
| none | Full context per tier | lu-executor, lu-planner, lu-learner |
| cold | Only git diff + project identity | dx-advocate, code-simplifier, code-architect |
| warm | Plans + summaries, NO session context | lu-verifier |

## Execution Context

Read these reference files before executing:

- \`.claude/luca/references/ui-brand.md\`
- \`.claude/luca/workflows/execute-phase.md\`
- \`.claude/luca/workflows/learning-capture.md\`

## Process

### Step 0: Setup (orchestrator handles directly)

#### 0.0 Initialize Context File

\`\`\`typescript
import { writePhaseExecuteContext } from "src/skills/__schemas/phase-execute-context.schemas";

await writePhaseExecuteContext({});
// Write initial state
await writePhaseExecuteContext({ current_state: "idle" });
\`\`\`

#### 0.1 Resolve Model Routing

Model routing is handled by \`resolveModelForAgent(agentName, complexity)\` from \`src/complexity/__helpers/model-routing.ts\`. See the complexity-gating rule for the routing table summary.

#### 0.2 Capture Phase Start Commit

\`\`\`bash
PHASE_START_COMMIT=$(git rev-parse HEAD)
ALREADY_PROMOTED=false
INITIAL_COMPLEXITY="$COMPLEXITY"
\`\`\`

#### 0.5 Verify GitHub Tracking (Gate)

Read STATE.md and check for \`GitHub Issue:\` line. If issue exists, extract issue number for commit messages. If missing, present the setup gate (same as current monolith Step 0.5).

#### 0.6 Procedure Replay Check

Unless \`--skip-replay\` is passed:
1. Recall validated procedures from MuninnDB
2. Check if any procedures match the current phase context
3. If matches found, replay the procedure steps as context for the execution

#### 0.7 Transition to setup state

After all setup steps complete, transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "setup" });
\`\`\`

**State: idle -> SETUP_COMPLETE -> setup**

### Step 1-4: Wave Execution (delegated to phase-execute-waves)

\`\`\`
Skill("phase-execute-waves", "{phase_number} {flags}")
\`\`\`

Wait for the Skill to complete. Read context to check results:

\`\`\`typescript
const ctx = await readPhaseExecuteContext();
if (!ctx.success) { /* ABORT */ }
// Waves result now in ctx.data.phase_execute_waves
\`\`\`

Transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "executed" });
\`\`\`

**State: setup -> WAVES_COMPLETE -> executed**

### Step 5-7: Verification Loops (delegated to phase-execute-verify)

\`\`\`
Skill("phase-execute-verify", "{phase_number} {flags}")
\`\`\`

Wait for the Skill to complete. Read context:

\`\`\`typescript
const ctx = await readPhaseExecuteContext();
if (!ctx.success) { /* ABORT */ }
const harnessPassed = ctx.data.phase_execute_verify?.harness_passed ?? false;
const verifyPassed = ctx.data.phase_execute_verify?.verify_passed ?? false;
\`\`\`

Emit existing bridge transition:

\`\`\`bash
luca-bridge transition --event=VERIFY_PASSED 2>/dev/null || true
\`\`\`

Transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "verified" });
\`\`\`

**State: executed -> VERIFY_COMPLETE -> verified**

### Step 8: Code Review (delegated to phase-execute-review, or SKIP)

Decide whether to run code review:

\`\`\`bash
# Skip conditions:
# 1. --skip-review flag passed
# 2. workflow.code_review: false in config
# 3. Harness failed (harness_passed = false from verify context)
\`\`\`

**If code review should run:**

\`\`\`
Skill("phase-execute-review", "{phase_number}")
\`\`\`

Wait for completion. Transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "reviewed" });
\`\`\`

**State: verified -> REVIEW_COMPLETE -> reviewed**

**If code review should be skipped:**

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "reviewed" });
\`\`\`

**State: verified -> SKIP_REVIEW -> reviewed**

### Step 9: Update State and Requirements

Update STATE.md and REQUIREMENTS.md with phase completion status. Run checkpoint cleanup and shadow debt advisory scan (same as current monolith Steps 9-10.6).

### Step 10: Learning Capture (orchestrator handles directly)

**MANDATORY:** Spawn lu-learner sub-agent. Do NOT attempt to capture learnings yourself.

\`\`\`python
Task(
  prompt="""
<learning_context>

**Recipient:** phase-execute orchestrator (report findings back to this orchestrator)

**Phase:** {phase_number}
**Verification Result:** {verification_result}

**Working Memory (session findings):**
{working_content}

**Current Long-Term Memory:**
{memory_content}

</learning_context>

<extraction_targets>
1. **Patterns**: What execution approaches worked well?
2. **Decisions**: What implementation choices were made?
3. **Pitfalls**: What issues were encountered during execution?
4. **Preferences**: What conventions emerged from this phase?
</extraction_targets>

<output_requirements>
- Extract ONLY validated learnings (verified by outcome)
- Write curated insights to MuninnDB via muninn_remember
- Clear session context via muninn_forget after extraction
- Return summary of learnings captured
</output_requirements>

Extract learnings from this phase execution and store in MuninnDB.
""",
  subagent_type="lu-learner",
  model="{learner_model}",
  description="Capture phase learnings"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Step 10.5: Process Data Collection (conditional)

Check the \`process_data\` flag (fail-closed: absent flag = skip):

\`\`\`bash
if echo "$ARGS" | grep -q -- "--run-process-data"; then
  PROCESS_DATA_GATE="true"
else
  PROCESS_DATA_GATE="false"
fi
\`\`\`

**If process data enabled:** Spawn lu-process-data, store metrics, emit bridge transition:

\`\`\`bash
luca-bridge transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true
\`\`\`

**If process data disabled:** Emit bridge transition:

\`\`\`bash
luca-bridge transition --event=LEARN_COMPLETE 2>/dev/null || true
\`\`\`

Transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "learned" });
\`\`\`

**State: reviewed -> LEARN_COMPLETE -> learned**

### Step 11: Final Commit

\`\`\`bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
\`\`\`

Emit bridge transition:

\`\`\`bash
luca-bridge transition --event=COMMIT_COMPLETE 2>/dev/null || true
\`\`\`

Transition:

\`\`\`typescript
await writePhaseExecuteContext({ current_state: "committed" });
\`\`\`

**State: learned -> COMMIT_COMPLETE -> committed**

### Step 12: User Acceptance Testing (UAT)

**Skip if:** \`--skip-uat\` flag passed OR \`workflow.uat_required: false\` in config.

| Complexity | UAT | Verification Mode |
|-----------|-----|-------------------|
| TRIVIAL | Run (quick) | quick |
| SIMPLE | Run (quick) | quick |
| MODERATE | Run (standard) | standard |
| COMPLEX | Run (full) | full |
| CRITICAL | Run (full + thorough) | full+human |

Auto-transition into UAT mode:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE {Z} EXECUTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**
{Y} plans executed
Goal verified
Code review passed

## > Starting UAT

Testing deliverables from this phase...
\`\`\`

Follow verify-work workflow inline:

1. **Find SUMMARY.md files** for the phase
2. **Extract testable deliverables** (user-observable outcomes)
3. **Create {phase}-UAT.md** with test list
4. **Present tests one at a time** — show expected behavior, wait for response
5. **Process responses:** "yes/y/pass/next" = pass; anything else = issue
6. **Update UAT.md** after each response

### Step 13: Handle UAT Results

**Route A: All tests pass, more phases remain** — Route to \`/phase-discuss {N+1}\`

**Route B: All tests pass, milestone complete** — Route to \`/milestone-audit\`

**Route C: UAT issues found** — Diagnose and create fix plans:
- Spawn parallel debug agents
- Root Cause Tribunal (conditional: config + COMPLEX+ + multi-issue)
- Spawn lu-planner in --gaps mode
- Route to \`/phase-execute {Z} --gaps-only\`

**Route D: Verifier gaps found** — Route to \`/phase-plan {N} --gaps\`

## Session Logging During Execution

Throughout execution, log findings to MuninnDB:

\`\`\`
mcp__muninn__muninn_remember(vault: REPO_VAULT, concept: "session:findings", content: "[timestamp] [Plan X complete - finding Y]")
\`\`\`

## Deviation Rules

During execution (within sub-skills), handle discoveries automatically:

1. **Auto-fix bugs** — Fix immediately, document in Summary
2. **Auto-add critical** — Security/correctness gaps, add and document
3. **Auto-fix blockers** — Can't proceed without fix, do it and document
4. **Ask about architectural** — Major structural changes, stop and ask user

## Commit Rules

**IMPORTANT:** Always use \`bun run commit\` with flags. Always stage ALL files with \`git add .\` before committing.

**Per-Task Commits:**
\`\`\`bash
git add .
bun run commit --message="{task-name}" --type={type} --scope={phase}-{plan} --no-push --skip-checks
\`\`\`

**Phase Completion Commit:**
\`\`\`bash
git add .
bun run commit --message="complete {phase-name} phase" --type=docs --scope={phase} --no-push --skip-checks
\`\`\`

## Success Criteria

- [ ] All incomplete plans in phase executed (via phase-execute-waves)
- [ ] Each plan has SUMMARY.md
- [ ] Phase goal verified (via phase-execute-verify)
- [ ] VERIFICATION.md created in phase directory
- [ ] Code review completed (via phase-execute-review, unless skipped)
- [ ] CRITICAL code issues block until fixed
- [ ] Learning capture completed (lu-learner spawned)
- [ ] Bridge transitions emitted (VERIFY_PASSED, LEARN_COMPLETE/PROCESS_DATA_COMPLETE, COMMIT_COMPLETE)
- [ ] current_state written to context file after every state transition
- [ ] STATE.md reflects phase completion
- [ ] ROADMAP.md updated
- [ ] REQUIREMENTS.md updated

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| UAT passed, more phases | Discuss next phase | \`/phase-discuss {N+1}\` |
| UAT passed, milestone complete | Audit milestone | \`/milestone-audit\` |
| UAT gaps found | Execute gap fixes | \`/phase-execute {N} --gaps-only\` |
| Code review critical issues | Execute quality fixes | \`/phase-execute {N} --quality-fixes\` |
| Verifier gaps found | Plan gap closure | \`/phase-plan {N} --gaps\` |

**Primary:** \`/progress\` — Check status and get smart routing

**Also available:**
- \`/verify {phase}\` — Run UAT separately
- \`/session-pause\` — Create handoff if stopping mid-work
</main>
`,
      order: 1,
    },
  ],
  evals: [
    {
      prompt:
        "Execute phase 5 which has plans 5.1 (no deps), 5.2 (depends on 5.1), and 5.3 (no deps).",
      expected:
        "Plans 5.1 and 5.3 execute in parallel (wave 1), plan 5.2 executes in wave 2 after 5.1 completes.",
      criteria: [
        "Groups independent plans into the same wave for parallel execution",
        "Respects dependency ordering between waves",
        "Delegates wave execution to phase-execute-waves sub-skill",
      ],
    },
    {
      prompt:
        "Phase execution completed but bun test reports 2 failures. What happens next?",
      expected:
        "Harness detects test failures, spawns executor to fix, re-runs harness (up to max iterations).",
      criteria: [
        "Delegates verification to phase-execute-verify sub-skill",
        "Sub-skill runs harness fix loop with iteration limits",
        "Orchestrator reads harness_passed from context file",
      ],
    },
    {
      prompt:
        "All plans in phase 8 have executed and harness passes. What state transitions occur?",
      expected:
        "Phase marked complete in STATE.md, lu-verifier runs, lu-learner captures learnings, code review agents spawn.",
      criteria: [
        "Updates STATE.md with phase completion",
        "Delegates verification to phase-execute-verify",
        "Triggers learning capture via lu-learner in orchestrator",
        "Writes current_state after each transition",
      ],
    },
  ],
};

export const phaseExecuteSkill = createSkill(phaseExecuteConfig);
