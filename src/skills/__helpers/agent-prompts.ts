/**
 * Shared Agent() prompt template factory functions.
 *
 * Contains typed prompt template functions for all ~30 Agent() sub-agents
 * used across the 5 orchestrators (lu, phase-execute, pr-address, verify,
 * milestone-complete). Each function accepts parameters and returns a
 * complete prompt string including role, memory protocol, task instructions,
 * and output contract.
 *
 * Templates are designed for the flat orchestrator pattern where ALL Agent()
 * calls originate from the orchestrator. Sub-agents are leaf workers that
 * CANNOT spawn other agents.
 *
 * @module agent-prompts
 * @see docs/skill-to-agent-migration/architecture.md
 * @see docs/skill-to-agent-migration/muninndb-context-pattern.md
 */

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Common parameters passed to all Agent() prompt templates.
 */
export interface AgentPromptParams {
  phase: string;
  complexity: string;
  vault: string;
  currentState: string;
}

// ─── Shared Blocks ────────────────────────────────────────────────────────

const AGENT_CONSTRAINT = `You have access to Read, Write, Edit, Bash, Grep, Glob, and MCP tools.
You CANNOT call Agent(), Task(), or Skill(). You are a leaf worker.`;

/**
 * Build the MuninnDB memory protocol block for an agent prompt.
 *
 * @param vault - The repo vault name (e.g., "luca-framework")
 * @param isolation - "none" (full), "warm" (session + brain), "cold" (brain only)
 * @param recallContext - Domain-specific recall query for step 2/3
 */
const memoryProtocol = (
  vault: string,
  isolation: "none" | "warm" | "cold",
  recallContext: string,
): string => {
  const lines = [
    "<memory_protocol>",
    "PHASE 1 — RECALL (do this FIRST):",
    `1. Load project identity: mcp__muninn__muninn_recall(vault: '${vault}', context: ['project identity', 'brain project'])`,
  ];

  if (isolation !== "cold") {
    lines.push(
      `2. Load session context: mcp__muninn__muninn_recall(vault: '${vault}', context: ['session context', '${recallContext}'])`,
    );
  }

  if (isolation === "none") {
    lines.push(
      `3. Load relevant patterns: mcp__muninn__muninn_recall(vault: 'default', context: ['${recallContext}'])`,
    );
  }

  lines.push(
    "",
    "PHASE 2 — OBSERVE (during your work):",
    `Store significant findings: mcp__muninn__muninn_remember(vault: '${vault}', concept: 'session:candidate-pattern', content: '...')`,
    "",
    "PHASE 3 — HANDOFF: Return results in the output contract format below.",
    "",
    "If MuninnDB is unavailable (MCP tool error), fall back to:",
    "- .planning/STATE.md for state",
    "- .planning/config.json for configuration",
    "- Proceed with available context rather than failing.",
    "</memory_protocol>",
  );

  return lines.join("\n");
};

const outputContract = (extraFields?: string): string => {
  const base = `<output_contract>
When done, output exactly:
STATUS: success OR failure
RESULT: {summary of what was done}`;
  return extraFields
    ? `${base}\n${extraFields}\n</output_contract>`
    : `${base}\n</output_contract>`;
};

// ─── pr-address Templates ─────────────────────────────────────────────────

/**
 * Prompt for pr-fetch: resolve PR context and fetch comments from GitHub.
 */
export const PR_FETCH_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR fetcher. Resolve PR context and fetch all comment types from GitHub.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "PR review workflow")}

<task>
1. Resolve PR context — find the PR number from the current branch or arguments
2. Use gh CLI to fetch: review comments, issue comments, reviews, and diff
3. Filter to actionable comments (not from author, not resolved, not from bots)
4. Return the actionable comment count and PR metadata
</task>

${outputContract("ACTIONABLE_COUNT: {number of actionable comments}\nPR_NUMBER: {PR number}")}
`;

/**
 * Prompt for pr-validate: categorize and validate PR review concerns.
 */
export const PR_VALIDATE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR validator. Categorize PR comments by concern type and validate each.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "PR validation patterns")}

<task>
1. Read the PR comments and diff from the context provided by the orchestrator
2. Categorize each comment by type: security, architecture, performance, code-quality, accessibility, testing, general
3. For each concern, validate whether it is legitimate by reading the relevant code
4. Classify each as: valid (real issue), disputed (debatable), or informational (no action needed)
5. Flag any split verdicts where your analysis disagrees with the reviewer
</task>

${outputContract("VALID_COUNT: {N}\nDISPUTED_COUNT: {N}\nSPLIT_VERDICTS: {N}")}
`;

/**
 * Prompt for pr-debate: handle split verdicts when validators disagree.
 */
export const PR_DEBATE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR debate facilitator. Analyze split verdicts where validators disagreed.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "PR debate patterns")}

<task>
1. Read the split verdicts from the orchestrator's context
2. For each split: analyze both perspectives (the original reviewer's concern vs the validator's assessment)
3. Weigh evidence: read the actual code, consider project conventions, check for precedent
4. Make a recommendation: agree with reviewer, agree with validator, or defer to human
5. Document your reasoning for each verdict
</task>

${outputContract("RESOLVED_COUNT: {N}\nDEFERRED_COUNT: {N}")}
`;

/**
 * Prompt for pr-fix: implement fixes for validated PR concerns.
 */
export const PR_FIX_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR fixer. Implement code fixes for validated PR review concerns.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", "code fix patterns")}

<task>
1. Read the validated concerns from the orchestrator's context
2. For each valid concern:
   a. Read the relevant source files
   b. Implement the fix (edit existing code, do not create unnecessary files)
   c. Commit atomically: git add <files> && git commit -m "fix(pr): {description}"
3. Track which concerns were fixed, skipped, or need manual review
4. Run bunx --bun tsc --noEmit to verify no type errors introduced
</task>

${outputContract("FIXED_COUNT: {N}\nSKIPPED_COUNT: {N}\nCOMMIT_HASHES: {comma-separated}")}
`;

/**
 * Prompt for pr-learn: capture PR review patterns as MuninnDB engrams.
 */
export const PR_LEARN_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR learner. Extract reusable pitfall patterns from this PR review cycle.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", "PR review learning patterns")}

<task>
1. Review all categorized concerns, fixes, and debate outcomes
2. For each pattern worth remembering (what reviewers caught, why it matters, how to avoid):
   mcp__muninn__muninn_remember(vault: 'default', concept: 'pitfall:{descriptive-name}', content: '{what, why, how-to-avoid}')
3. Link new engrams to related existing memories if found
4. Return count of patterns captured
</task>

${outputContract("PATTERNS_CAPTURED: {N}")}
`;

/**
 * Prompt for pr-respond: post responses to PR comments and push changes.
 */
export const PR_RESPOND_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the PR responder. Post replies to PR comments and push fixes to remote.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "PR response workflow")}

<task>
1. Read fix tracking, debate results, and concern classifications from context
2. For each addressed fix: reply to the PR comment with the fix commit hash using gh CLI
3. For each disputed concern: reply with a respectful explanation of why we disagree
4. For deferred items: reply noting both perspectives, deferring to human judgment
5. Push all fix commits to remote: git push
6. Post a summary comment on the PR with a table of: fixes applied, responses, contested items
</task>

${outputContract("REPLIES_POSTED: {N}\nPUSH_STATUS: {success/failure}")}
`;

// ─── verify Templates ─────────────────────────────────────────────────────

/**
 * Prompt for verify-extract: find summaries and create UAT template.
 * NOTE: verify-test stays INLINE (interactive), no template needed.
 */
export const VERIFY_EXTRACT_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the deliverable extractor. Find phase summaries and create a UAT test template.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "phase verification")}

<task>
1. Find all SUMMARY.md files in .planning/phases/${p.phase}-*/
2. Extract testable deliverables (user-observable outcomes) from SUMMARY.md and PLAN.md
3. Create a UAT.md template at .planning/phases/${p.phase}-*/${p.phase}-UAT.md with:
   - Test items table (ID, description, expected outcome, status)
   - Each test should be independently verifiable
4. Return the UAT template path and count of test items
</task>

${outputContract("UAT_PATH: {path to UAT.md}\nTEST_COUNT: {N}")}
`;

/**
 * Prompt for verify-diagnose: debug UAT failures and create fix plans.
 */
export const VERIFY_DIAGNOSE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the test failure diagnostician. Debug UAT failures using scientific method.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "debugging patterns")}

<task>
1. Read the failed test items provided by the orchestrator
2. For each failure:
   a. Reproduce the issue by reading relevant code
   b. Identify root cause
   c. Propose a fix with specific file paths and changes
3. Create a fix plan with tasks, one per failure
4. Return the diagnosis and fix plan
</task>

${outputContract("DIAGNOSED_COUNT: {N}\nFIX_PLAN_READY: true/false")}
`;

/**
 * Prompt for verify-review: run code quality review on changed files.
 */
export const VERIFY_REVIEW_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the code quality reviewer. Review changed files for quality, architecture, and security.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "cold", "code review")}

<task>
1. Get the list of changed files: git diff --name-only main...HEAD
2. Read each changed file
3. Review for: architecture violations, security issues, performance concerns, code quality, DX
4. Group findings by severity: CRITICAL, HIGH, MEDIUM, LOW
5. Deduplicate overlapping concerns
6. Return findings summary
</task>

${outputContract("FINDINGS_COUNT: {N}\nCRITICAL_COUNT: {N}")}
`;

// ─── milestone-complete Templates ─────────────────────────────────────────

/**
 * Prompt for milestone-learn: extract and consolidate session learnings.
 */
export const MILESTONE_LEARN_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the milestone learning extractor. Consolidate session learnings before archival.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", "milestone learning patterns")}

<task>
1. Recall session learnings from MuninnDB: mcp__muninn__muninn_recall(vault: '${p.vault}', context: ['session candidate pattern', 'session candidate pitfall'])
2. Promote validated patterns (seen 3+ times) to High confidence via mcp__muninn__muninn_evolve
3. Mark decisions as Established if they held throughout the milestone
4. Return count of patterns promoted and decisions established
</task>

${outputContract("PATTERNS_PROMOTED: {N}\nDECISIONS_ESTABLISHED: {N}")}
`;

/**
 * Prompt for milestone-prune: detect and flag stale MuninnDB engrams.
 */
export const MILESTONE_PRUNE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the memory pruner. Identify stale MuninnDB engrams for review.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", "memory pruning patterns")}

<task>
1. Recall all engrams and check for staleness (5+ recalls with 0 positive feedback, 3+ milestones dormant)
2. List stale candidates with reasons
3. Run mcp__muninn__muninn_consolidate(vault: '${p.vault}') for milestone-boundary cleanup
4. Return stale candidate list for user review (orchestrator will handle interactive pruning)
</task>

${outputContract("STALE_COUNT: {N}\nCONSOLIDATION: complete")}
`;

/**
 * Prompt for milestone-shadow-gate: run shadow debt scan.
 */
export const MILESTONE_SHADOW_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the shadow debt scanner. Detect orphaned files, misplaced artifacts, and tech debt.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "shadow debt patterns")}

<task>
1. Scan the repository for: orphaned temp scripts, misplaced files, tool artifacts, dead exports, stale planning artifacts
2. Classify each finding by severity: CRITICAL, WARNING, INFO
3. For each finding, recommend action: delete, move, or investigate
4. Store metric: mcp__muninn__muninn_remember(vault: '${p.vault}', concept: 'metric:shadow-debt', content: '{scan results summary}')
5. Return the scan report
</task>

${outputContract("CRITICAL_COUNT: {N}\nWARNING_COUNT: {N}\nINFO_COUNT: {N}")}
`;

/**
 * Prompt for milestone-archive: archive milestone artifacts and update project state.
 */
export const MILESTONE_ARCHIVE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the milestone archiver. Archive artifacts, gather stats, update project documentation.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", "milestone archival")}

<task>
Read .planning/ROADMAP.md to determine the current milestone version, then:
1. Archive milestone roadmap to .planning/milestones/v{version}-ROADMAP.md
2. Archive requirements to .planning/milestones/v{version}-REQUIREMENTS.md (if exists)
3. Gather stats: count phases, plans, commits (git log), LOC changes (git diff --stat)
4. Extract accomplishments from phase SUMMARY.md files
5. Update PROJECT.md "Current State" section
6. Clear session context: recall session entries then forget each by ULID
7. Reset state machine: luca-bridge transition --event=ARCHIVE_COMPLETE
8. Create GitHub milestone: gh api repos/{owner}/{repo}/milestones -f title="v{version}" -f state="closed"
</task>

${outputContract("VERSION: {milestone version}\nPHASES_ARCHIVED: {N}\nCOMMIT_COUNT: {N}")}
`;

/**
 * Prompt for milestone-finalize: create final commit, tag, and handle divergent mode.
 */
export const MILESTONE_FINALIZE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the milestone finalizer. Create the final commit, git tag, and wrap up.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "milestone finalization")}

<task>
Read .planning/ROADMAP.md to determine the current milestone version, then:
1. Create final commit: git add . && git commit -m "archive v{version}"
2. Create git tag: git tag -a v{version} -m "v{version}"
3. Report the tag name and ask the orchestrator whether to push
4. Write state: luca-bridge transition --event=FINALIZE_COMPLETE
</task>

${outputContract("VERSION: {milestone version}\nTAG_CREATED: true/false")}
`;

// ─── phase-execute Templates (shared standalone + inline) ─────────────────

/**
 * Prompt for wave execution: discover and execute PLAN.md files.
 */
export const EXECUTE_WAVES_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-executor. Execute the phase plan by reading PLAN.md files and implementing all tasks.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", `phase ${p.phase} execution`)}

<task>
1. Read .planning/phases/${p.phase}-*/*-PLAN.md files
2. Parse frontmatter for wave number and dependencies
3. Execute tasks in wave order, respecting depends_on
4. For each task: read the instructions, implement changes, commit atomically
5. Track: tasks completed, files modified, commit hashes, any deviations from plan
6. Run bunx --bun tsc --noEmit after each commit to catch type errors early
</task>

${outputContract("TASKS_COMPLETED: {N}\nCOMMIT_HASHES: {comma-separated}\nDEVIATIONS: {none or description}")}
`;

/**
 * Prompt for harness check: run type-check and report errors.
 */
export const HARNESS_CHECK_PROMPT = (p: AgentPromptParams): string => `
<role>
You are the harness checker. Run verification checks and report pass/fail with errors.
${AGENT_CONSTRAINT}
</role>

<task>
1. Run: bunx --bun tsc --noEmit 2>&1
2. Parse the output for errors
3. Report pass (zero errors) or fail (with error list)
</task>

${outputContract("PASSED: true/false\nERROR_COUNT: {N}\nERRORS: {newline-separated error messages if any}")}
`;

/**
 * Prompt for harness fix: fix specific errors reported by harness.
 */
export const HARNESS_FIX_PROMPT = (
  errors: string,
  p: AgentPromptParams,
): string => `
<role>
You are the harness fixer. Fix the specific TypeScript errors listed below.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "fixing harness errors")}

<errors_to_fix>
${errors}
</errors_to_fix>

<task>
1. Read each error, identify the file and line
2. Fix the root cause (not just the symptom)
3. Commit fixes: git add <files> && git commit -m "fix: resolve harness errors"
4. Re-run bunx --bun tsc --noEmit to verify fix
</task>

${outputContract("FIXED_COUNT: {N}\nREMAINING_ERRORS: {N}")}
`;

/**
 * Prompt for goal-backward verification: verify phase goal was achieved.
 */
export const GOAL_VERIFY_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-verifier. Verify the phase goal was achieved via goal-backward analysis.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", `phase ${p.phase} verification`)}

<task>
1. Read the phase goal from .planning/ROADMAP.md (Phase ${p.phase})
2. Read the PLAN.md success criteria
3. Read the execution summaries from SUMMARY.md
4. For each success criterion: verify it was met by checking the actual code/files
5. Write VERIFICATION.md to the phase directory with findings
6. Determine overall verdict: PASSED (all criteria met) or ISSUES (gaps found)
</task>

${outputContract("VERDICT: PASSED/ISSUES\nCRITERIA_MET: {N}/{total}\nVERIFICATION_PATH: {path to VERIFICATION.md}")}
`;

/**
 * Prompt for code review: review changed files for a specific quality dimension.
 *
 * @param reviewer - The review dimension (architecture, dx-advocate, security, simplifier)
 */
export const CODE_REVIEW_PROMPT = (
  reviewer: string,
  p: AgentPromptParams,
): string => `
<role>
You are a ${reviewer} code reviewer. Review phase ${p.phase} changes for ${reviewer} concerns.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "cold", `${reviewer} review`)}

<task>
1. Get changed files: git diff --name-only main...HEAD (or since phase start commit)
2. Read each changed file
3. Review specifically for ${reviewer} concerns
4. Report findings grouped by severity: CRITICAL, HIGH, MEDIUM, LOW
5. Be concise — only flag real issues, not style preferences
</task>

${outputContract("FINDINGS_COUNT: {N}\nCRITICAL_COUNT: {N}")}
`;

/**
 * Prompt for learning capture: extract patterns, decisions, pitfalls.
 */
export const LEARNING_CAPTURE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-learner. Extract validated patterns, decisions, and pitfalls from this phase.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", `phase ${p.phase} learning capture`)}

<task>
1. Recall all session candidate entries: mcp__muninn__muninn_recall(vault: '${p.vault}', context: ['session candidate pattern', 'session candidate pitfall', 'session candidate decision'])
2. For each validated pattern: promote to permanent via mcp__muninn__muninn_remember(vault: 'default', concept: 'pattern:{name}', content: '{description}')
3. For each validated pitfall: promote to permanent via mcp__muninn__muninn_remember(vault: 'default', concept: 'pitfall:{name}', content: '{description}')
4. Link new engrams to related existing memories
5. Return count of items promoted
</task>

${outputContract("PATTERNS_PROMOTED: {N}\nPITFALLS_PROMOTED: {N}\nDECISIONS_RECORDED: {N}")}
`;

/**
 * Prompt for process data collection: compute process metrics.
 */
export const PROCESS_DATA_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-process-data. Compute process metrics for this phase execution.
${AGENT_CONSTRAINT}
</role>

<task>
1. Compute per-phase metrics: task completion rate, deviation count, harness pass rate
2. Store metrics in MuninnDB: mcp__muninn__muninn_remember(vault: '${p.vault}', concept: 'metric:signal-rate-phase-${p.phase}', content: '{metrics JSON}')
3. Return metrics summary
</task>

${outputContract("METRICS_STORED: true/false")}
`;

// ─── lu-only Templates ────────────────────────────────────────────────────

/**
 * Prompt for cognitive pre-flight: load brain tree and session context.
 */
export const COGNITION_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-cognition. Run cognitive pre-flight: load project identity, recall patterns, initialize session.
${AGENT_CONSTRAINT}
</role>

<task>
1. Load project identity: mcp__muninn__muninn_recall(vault: '${p.vault}', context: ['project identity', 'brain project'])
2. Recall relevant patterns and decisions: mcp__muninn__muninn_recall(vault: '${p.vault}', context: ['patterns decisions pitfalls for current work'])
3. Also recall from default vault: mcp__muninn__muninn_recall(vault: 'default', context: ['cross-project patterns'])
4. Initialize session: mcp__muninn__muninn_remember(vault: '${p.vault}', concept: 'session:init', content: 'Session started. Complexity: ${p.complexity}. Phase: ${p.phase}.')
5. Generate intuition flags: RISK, CAUTION, OPPORTUNITY based on recalled context
6. Return the recalled context summary and intuition flags
</task>

${outputContract("INTUITION_FLAGS: {RISK/CAUTION/OPPORTUNITY flags}\nPATTERNS_RECALLED: {N}")}
`;

/**
 * Prompt for complexity classification and routing.
 */
export const CLASSIFY_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-router. Classify task complexity and determine the routing decision.
${AGENT_CONSTRAINT}
</role>

<task>
1. Read the user's request from the orchestrator's context
2. Classify complexity: TRIVIAL (1 file), SIMPLE (2-3), MODERATE (3-5), COMPLEX (5-10), CRITICAL (10+)
3. Determine route: phase-execute, quick, pr-address, debug, session-plan, progress, project-new, milestone-new
4. Return both decisions
</task>

${outputContract("COMPLEXITY: {level}\nROUTE: {route type}")}
`;

/**
 * Prompt for session configuration.
 */
export const CONFIGURE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-configure. Read configuration, apply overrides, validate session setup.
${AGENT_CONSTRAINT}
</role>

<task>
1. Read .planning/config.json for settings (oversight, max_phases, skip_uat, gap_retries, etc.)
2. Read .planning/STATE.md for current workflow state
3. Apply any CLI flag overrides from the orchestrator's context
4. Validate the environment (check .planning/ exists, ROADMAP.md exists)
5. Return the resolved configuration
</task>

${outputContract("OVERSIGHT: {level}\nMAX_PHASES: {N}\nSKIP_UAT: {true/false}")}
`;

/**
 * Prompt for backlog scan and roadmap revision.
 */
export const BACKLOG_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-backlog. Scan pending todos and propose roadmap revisions.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "backlog management")}

<task>
1. Read pending todos from .planning/todos/pending/
2. Read current ROADMAP.md
3. Identify unplanned work (todos not referenced in roadmap)
4. If unplanned todos found: score by WSJF (business value, time criticality, risk reduction, effort)
5. Propose phase placement for high-priority items
6. Return proposed changes for orchestrator to present to user
</task>

${outputContract("UNPLANNED_COUNT: {N}\nPROPOSED_CHANGES: {description of roadmap changes}")}
`;

/**
 * Prompt for non-phase-execute route handling.
 *
 * @param route - The specific route (quick, pr-address, debug, etc.)
 */
export const ROUTE_HANDLER_PROMPT = (
  route: string,
  p: AgentPromptParams,
): string => `
<role>
You are the ${route} route handler. Execute the ${route} workflow.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", `${route} workflow`)}

<task>
Execute the ${route} workflow as described in the user's request.
Read any relevant files, implement changes, and return the result.
</task>

${outputContract()}
`;
