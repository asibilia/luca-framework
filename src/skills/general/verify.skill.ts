/**
 * verify Skill - Validate built features through conversational UAT testing against acceptance criteria.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the verify skill configuration
const verifyConfig: SkillConfig = {
  frontmatter: {
    name: "verify",
    description: `Validate built features through conversational UAT testing against acceptance criteria.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Verify Work

Validate built features through conversational testing with persistent state.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-debugger\` - Diagnoses root causes of UAT failures (parallel)
- \`lu-planner\` - Creates fix plans in --gaps mode
- \`lu-plan-checker\` - Verifies fix plans before execution
- \`dx-advocate\` - Code quality review
- \`code-simplifier\` - DRY and complexity review
- \`code-architect\` - Architecture review
- \`ui\` - Tailwind/styling review
- \`security-auditor\` - Security review (conditional)

**DO NOT** attempt to diagnose, plan, or review code yourself. Spawn the appropriate agents.

**Reference:** See \`.cursor/luca/references/task-directive.md\` for Task() syntax patterns.

### Model Resolution

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent              | quality | balanced | budget |
| ------------------ | ------- | -------- | ------ |
| lu-debugger     | opus    | sonnet   | sonnet |
| lu-planner      | opus    | opus     | sonnet |
| lu-plan-checker | sonnet  | sonnet   | haiku  |
| reviewers (all)    | opus    | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# All verification agents require reasoning → omit (inherit from parent)
debugger_model = (omit)
planner_model = (omit)
checker_model = (omit)
reviewer_model = (omit)
\`\`\`

**Note:** This is now integrated into \`/phase-execute\` by default. Use this standalone command only if:

- You want to re-run UAT on a previously completed phase
- You skipped UAT during execution (\`--skip-uat\`)
- You want to resume an interrupted UAT session

**Purpose:** Confirm what AI built actually works from user's perspective. One test at a time, plain text responses, no interrogation. When issues are found, automatically diagnose, plan fixes, and prepare for execution.

**Arguments:** \`[phase number, e.g., '4']\`

**Output:** \`{phase}-UAT.md\` tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for \`/phase-execute\`

## Execution Context

Read these reference files before executing:

- \`.cursor/luca/workflows/verify-work.md\`
- \`.cursor/luca/templates/UAT.md\`

## Process

1. **Check for active UAT sessions** (resume or start new)
2. **Find SUMMARY.md files** for the phase
3. **Extract testable deliverables** (user-observable outcomes)
4. **Create {phase}-UAT.md** with test list
5. **Present tests one at a time:**
   - Show expected behavior
   - Wait for plain text response
   - "yes/y/next" = pass, anything else = issue (severity inferred)
6. **Update UAT.md** after each response
7. **On UAT completion:** commit results
8. **If UAT issues found:**

   **MANDATORY**: You MUST spawn sub-agents to diagnose and plan fixes. Do NOT attempt to diagnose or plan yourself.

   First, spawn parallel debuggers to diagnose each issue:

   \`\`\`python
   # For each UAT issue - spawn in PARALLEL
   Task(
     prompt="""
   <debug_context>

   **UAT Issue:** {issue_description}
   **Phase:** {phase_number}
   **Expected:** {expected_behavior}
   **Actual:** {actual_behavior}

   </debug_context>

   Diagnose the root cause of this UAT failure.
   Return diagnosis with affected files and suggested fix approach.
   """,
     subagent_type="lu-debugger",
     model="{debugger_model}",
     description="Diagnose UAT issue: {issue_summary}"
   )
   \`\`\`

   After diagnosis, spawn planner in gaps mode:

   \`\`\`python
   Task(
     prompt="""
   <planning_context>

   **Phase:** {phase_number}
   **Mode:** gap_closure
   **Phase Directory:** {phase_dir}

   **Diagnosed Issues:**
   {diagnosed_issues}

   </planning_context>

   Create fix plans for these diagnosed UAT issues.
   """,
     subagent_type="lu-planner",
     model="{planner_model}",
     description="Plan UAT fixes"
   )
   \`\`\`

   Then verify with plan-checker (iterate max 3 times):

   \`\`\`python
   Task(
     prompt="""
   <verification_context>

   **Phase:** {phase_number}
   **Fix Plans:** {plans_content}
   **Original Issues:** {diagnosed_issues}

   </verification_context>

   Verify these fix plans will address the UAT issues.
   """,
     subagent_type="lu-plan-checker",
     model="{checker_model}",
     description="Verify fix plans"
   )
   \`\`\`

   - Present ready status with \`/clear\` then \`/phase-execute\`

9. **If UAT passes:** Run code quality review

   **Complexity gate:** Code review runs at MODERATE and above. If complexity is TRIVIAL or SIMPLE, skip code review entirely and proceed to step 12.

   **Spawn reviewers based on complexity** (read from STATE.md \`Task Complexity:\` field):

   | Agent | MODERATE | COMPLEX | CRITICAL |
   |-------|----------|---------|----------|
   | dx-advocate | Run | Run | Run |
   | code-simplifier | Run | Run | Run |
   | code-architect | Skip | Run | Run |
   | tailwind-auditor | If UI files | If UI files | Run |
   | security-auditor | If auth files | If auth files | Always |

   If no complexity is set in STATE.md, default to spawning all reviewers (backward-compatible).

   **MANDATORY**: You MUST spawn reviewer agents in PARALLEL. Do NOT review code yourself.

   Get changed files and spawn reviewers:

   \`\`\`bash
   CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
   \`\`\`

   \`\`\`python
   # Spawn ALL reviewers in PARALLEL (same message)
   Task(
     prompt="Review for conventions and standards: {changed_files}",
     subagent_type="dx-advocate",
     model="{reviewer_model}",
     description="DX review"
   )

   Task(
     prompt="Review for DRY and complexity: {changed_files}",
     subagent_type="code-simplifier",
     model="{reviewer_model}",
     description="Simplification review"
   )

   Task(
     prompt="Review for architecture: {changed_files}",
     subagent_type="code-architect",
     model="{reviewer_model}",
     description="Architecture review"
   )

   Task(
     prompt="Review for Tailwind patterns: {changed_files}",
     subagent_type="ui",
     model="{reviewer_model}",
     description="Tailwind review"
   )

   # Conditional: only if auth/api files changed
   Task(
     prompt="Review for security: {changed_files}",
     subagent_type="security-auditor",
     model="{reviewer_model}",
     description="Security review"
   )
   \`\`\`

   **Do NOT proceed until ALL Tasks return.**

   - Merge findings by severity (CRITICAL/HIGH/MEDIUM/LOW)

10. **If CRITICAL quality issues:** Plan fixes (same planner → checker loop)
11. **If HIGH/MEDIUM only:** Report and offer options (fix now / continue / review)
12. **Present ready status** for next phase

## Anti-Patterns

- Don't use AskQuestion for test responses — plain text conversation
- Don't ask severity — infer from description
- Don't present full checklist upfront — one test at a time
- Don't run automated tests — this is manual user validation
- Don't fix issues during testing — log as gaps, diagnose after all tests complete

## Routes After Testing

**Route A: All tests pass, more phases remain**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed ✓
Code quality review passed ✓

## ▶ Next Up

- /phase-discuss {Z+1} — gather context and clarify approach
- /phase-plan {Z+1} — create implementation plan
- /phase-execute {Z+1} — execute if plan exists
\`\`\`

**Route B: All tests pass, milestone complete**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Final phase verified ✓
All UAT tests passed ✓
Code quality review passed ✓

## ▶ Next Up

/milestone-audit
\`\`\`

**Route C: Issues found, fix plans ready**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} ISSUES FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{M} tests passed
{X} issues diagnosed
Fix plans verified ✓

## ▶ Next Up

/phase-execute {Z} --gaps-only
\`\`\`

**Route D: Issues found, planning blocked**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} BLOCKED ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Manual intervention required
\`\`\`

**Route E: UAT passes, code quality issues found**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {Z} CODE REVIEW ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N}/{N} UAT tests passed ✓
{X} code quality issues found

| Severity | Count | Examples |
|----------|-------|----------|
| HIGH | {N} | Native .map() instead of Lodash |
| MEDIUM | {N} | Duplicated validation logic |

## Options

1. Fix now — plan and execute quality fixes
2. Continue — address in future iteration
3. Review details — see full findings
\`\`\`

**Route F: UAT passes, quality fixes ready**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► QUALITY FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} quality issues planned for fixing.

## ▶ Next Up

/phase-execute {Z} --quality-fixes
\`\`\`

## Success Criteria

- [ ] UAT.md created with tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] Plain text responses (no structured forms)
- [ ] Severity inferred, never asked
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on UAT completion
- [ ] If UAT issues: parallel debug agents diagnose root causes
- [ ] If UAT issues: lu-planner creates fix plans from diagnosed gaps
- [ ] If UAT issues: lu-plan-checker verifies fix plans (max 3 iterations)
- [ ] If UAT issues: ready for \`/phase-execute --gaps-only\`
- [ ] If UAT passes: code quality review runs on changed files
- [ ] If UAT passes: dx-advocate checks conventions
- [ ] If UAT passes: code-simplifier checks DRY/complexity
- [ ] If UAT passes: code-architect checks structure/patterns
- [ ] If UAT passes: tailwind-auditor checks Tailwind/dynamic colors
- [ ] If UAT passes: security-auditor checks (if auth/api files changed)
- [ ] CRITICAL quality issues block, HIGH/MEDIUM are warnings with options
- [ ] If quality fixes needed: ready for \`/phase-execute --quality-fixes\`
- [ ] If all clean: show next-phase commands (\`/phase-discuss\`, \`/phase-plan\`, \`/phase-execute\`)
- [ ] If final phase: show \`/milestone-audit\`

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| All tests passed, more phases | Plan next phase | \`/phase-plan {N+1}\` |
| All tests passed, milestone done | Complete milestone | \`/milestone-audit\` |
| Issues found | Plan fixes | \`/phase-plan {N} --gaps\` |

**Primary:** \`/progress\` — Check status and get smart routing

**Also available:**

- \`/phase-plan {N} --gaps\` — Create fix plans for failures
- \`/milestone-audit\` — Complete the milestone
</main>`,
      order: 1,
    },
  ],
};

export class VerifySkill extends BaseSkillImpl {
  constructor() {
    super(verifyConfig);
  }
}
