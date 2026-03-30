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
  const safeVault = vault.replace(/'/g, "\\'");
  const safeRecallContext = recallContext.replace(/'/g, "\\'");
  const lines = [
    "<memory_protocol>",
    "PHASE 1 — RECALL (do this FIRST):",
    `1. Load project identity: mcp__muninn__muninn_recall(vault: '${safeVault}', context: ['project identity', 'brain project'])`,
  ];

  if (isolation !== "cold") {
    lines.push(
      `2. Load session context: mcp__muninn__muninn_recall(vault: '${safeVault}', context: ['session context', '${safeRecallContext}'])`,
    );
  }

  if (isolation === "none") {
    lines.push(
      `3. Load relevant patterns: mcp__muninn__muninn_recall(vault: 'default', context: ['${safeRecallContext}'])`,
    );
  }

  lines.push(
    "",
    "PHASE 2 — OBSERVE (during your work):",
    `Store significant findings: mcp__muninn__muninn_remember(vault: '${safeVault}', concept: 'session:candidate-pattern', content: '...')`,
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
4. **Deduplicate comments:** Group comments with identical or near-identical body text.
   For each group, designate ONE as the primary and track the remaining IDs as duplicates.
   Automated reviewers (e.g., Copilot) often post the same comment multiple times on the
   same file. Every duplicate ID must still receive a reply — the respond agent needs
   the full ID list per unique concern.
5. Return: actionable comment count, PR metadata, and the duplicate map
</task>

${outputContract("ACTIONABLE_COUNT: {unique actionable comments}\nDUPLICATE_COUNT: {total duplicate IDs across all groups}\nPR_NUMBER: {PR number}")}
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
5. **Reply to ALL comment IDs including duplicates.** Automated reviewers (e.g., Copilot)
   often post the same comment multiple times. For the primary comment, post the full
   response. For each duplicate ID of the same concern, post a short reply:
   "Duplicate — {fixed in COMMIT_HASH / see reply on primary comment}."
6. **Verify zero unreplied:** After posting all replies, run a verification query:
   \\\`\\\`\\\`bash
   gh api repos/{owner}/{repo}/pulls/{pr}/comments --paginate --jq '
     [.[] | select(.user.login == "{author}") | .in_reply_to_id] as $replied |
     [.[] | select(.user.login != "{author}") | select(.id as $id | $replied | index($id) | not)] | length'
   \\\`\\\`\\\`
   If count > 0, post replies to remaining unreplied comment IDs before proceeding.
7. Push all fix commits to remote: git push
8. Post a summary comment on the PR with a table of: fixes applied, responses, contested items
</task>

${outputContract("REPLIES_POSTED: {N}\\nDUPLICATE_REPLIES: {N}\\nUNREPLIED_REMAINING: {should be 0}\\nPUSH_STATUS: {success/failure}")}
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
): string => {
  const sanitizedErrors = errors.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
<role>
You are the harness fixer. Fix the specific TypeScript errors listed below.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "fixing harness errors")}

<errors_to_fix>
${sanitizedErrors}
</errors_to_fix>

<task>
1. Read each error, identify the file and line
2. Fix the root cause (not just the symptom)
3. Commit fixes: git add <files> && git commit -m "fix: resolve harness errors"
4. Re-run bunx --bun tsc --noEmit to verify fix
</task>

${outputContract("FIXED_COUNT: {N}\nREMAINING_ERRORS: {N}")}
`;
};

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
const VALID_REVIEWERS = [
  "architecture",
  "dx-advocate",
  "security",
  "simplifier",
] as const;

export const CODE_REVIEW_PROMPT = (
  reviewer: string,
  p: AgentPromptParams,
): string => {
  if (!VALID_REVIEWERS.includes(reviewer as (typeof VALID_REVIEWERS)[number])) {
    throw new Error(`Invalid reviewer: ${reviewer}`);
  }
  return `
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
};

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
const VALID_ROUTES = [
  "phase-execute",
  "quick",
  "pr-address",
  "debug",
  "session-plan",
  "progress",
  "project-new",
  "milestone-new",
] as const;

export const ROUTE_HANDLER_PROMPT = (
  route: string,
  p: AgentPromptParams,
): string => {
  if (!VALID_ROUTES.includes(route as (typeof VALID_ROUTES)[number])) {
    throw new Error(`Invalid route: ${route}`);
  }
  return `
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
};

// ─── v2 Research Pipeline Templates ─────────────────────────────────────

/**
 * Prompt for lu-phase-researcher in v2 scope mode.
 *
 * Produces a RESEARCH-SCOPE.md that decomposes the phase domain into
 * 4 specialist areas (architecture, implementation, ecosystem, risks)
 * with specific research questions and search terms for each.
 *
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for research scoping
 *
 * @example
 * ```typescript
 * const prompt = RESEARCH_SCOPE_PROMPT({ phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'researching' })
 * ```
 */
export const RESEARCH_SCOPE_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-phase-researcher operating in v2 scope mode. Produce a RESEARCH-SCOPE.md that decomposes the phase domain into 4 specialist areas.
${AGENT_CONSTRAINT}
</role>

<v2_mode>true</v2_mode>

${memoryProtocol(p.vault, "warm", `phase ${p.phase} research scoping`)}

<task>
1. Read the phase goal from .planning/ROADMAP.md (Phase ${p.phase})
2. Read CONTEXT.md in the phase directory if it exists (locked decisions)
3. Decompose the research domain into 4 specialist areas:
   - Architecture: system design, project structure patterns, module boundaries
   - Implementation: code patterns, API usage, library integration
   - Ecosystem: library landscape, community patterns, state of the art
   - Risks: pitfalls, failure modes, edge cases
4. For each specialist, generate 3-5 specific research questions and suggested search terms
5. Write RESEARCH-SCOPE.md to the phase directory
6. Commit: git add && git commit -m "docs(${p.phase}): research scope for v2 pipeline"
</task>

${outputContract("SCOPE_PATH: {path to RESEARCH-SCOPE.md}\\nSPECIALISTS: 4\\nQUESTIONS_TOTAL: {N}")}
`;

/**
 * Prompt for a specialist researcher in the v2 parallel research pipeline.
 *
 * Invokes one of 4 specialist researchers (architecture, implementation,
 * ecosystem, risks) to research their assigned domain and produce a
 * numbered output file in the phase research/ subdirectory.
 *
 * @param specialist - The specialist type to invoke
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for parallel research
 *
 * @example
 * ```typescript
 * const prompt = PARALLEL_RESEARCH_PROMPT('architecture', { phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'researching' })
 * ```
 */
export const PARALLEL_RESEARCH_PROMPT = (
  specialist: "architecture" | "implementation" | "ecosystem" | "risks",
  p: AgentPromptParams,
): string => `
<role>
You are lu-${specialist}-researcher. Research the ${specialist} domain for phase ${p.phase}.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "cold", `${specialist} research for phase ${p.phase}`)}

<task>
1. Read the RESEARCH-SCOPE.md in the phase directory for your specialist assignment
2. Read the "Shared Context" section for project constraints
3. Research your assigned questions using Context7, WebSearch, WebFetch, and codebase analysis
4. Write your findings to the research subdirectory:
   - architecture → research/01-architecture-patterns.md
   - implementation → research/02-implementation-approaches.md
   - ecosystem → research/03-existing-solutions.md
   - risks → research/04-pitfalls-and-risks.md
5. Include confidence levels (HIGH/MEDIUM/LOW) for each finding
6. Store significant findings as research:* engrams in MuninnDB:
   mcp__muninn__muninn_remember(vault: '${p.vault}', concept: 'research:${specialist}-{finding}', content: '...')
</task>

${outputContract("OUTPUT_FILE: {path}\\nFINDINGS_COUNT: {N}\\nCONFIDENCE: {overall HIGH/MEDIUM/LOW}")}
`;

/**
 * Prompt for lu-research-synthesizer to merge 4 specialist research outputs.
 *
 * Reads all specialist outputs from the phase research/ directory and
 * produces a unified RESEARCH.md following the standard format, resolving
 * conflicts between specialist findings by preferring higher confidence.
 *
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for research synthesis
 *
 * @example
 * ```typescript
 * const prompt = RESEARCH_SYNTHESIS_PROMPT({ phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'researching' })
 * ```
 */
export const RESEARCH_SYNTHESIS_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-research-synthesizer. Merge 4 specialist research outputs into a unified RESEARCH.md.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", `phase ${p.phase} research synthesis`)}

<task>
1. Read all 4 specialist outputs from the phase research/ directory:
   - research/01-architecture-patterns.md
   - research/02-implementation-approaches.md
   - research/03-existing-solutions.md
   - research/04-pitfalls-and-risks.md
2. Merge into a unified RESEARCH.md following the standard format:
   - Standard Stack, Architecture Patterns, Don't Hand-Roll, Common Pitfalls, Code Examples
3. Resolve conflicts between specialist findings (prefer higher confidence)
4. Write the merged RESEARCH.md to the phase directory
5. Write SUMMARY.md documenting the synthesis process
</task>

${outputContract("RESEARCH_PATH: {path to RESEARCH.md}\\nSECTIONS_MERGED: {N}\\nCONFLICTS_RESOLVED: {N}")}
`;

/**
 * Prompt for a research reviewer in the v2 review loop.
 *
 * Invokes one of 3 reviewers (accuracy, completeness, actionability) to
 * evaluate the research corpus and rate each finding. Supports iteration
 * context for convergence detection in the review loop.
 *
 * @param reviewer - The review dimension to evaluate
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for research review
 *
 * @example
 * ```typescript
 * const prompt = RESEARCH_REVIEW_PROMPT('accuracy', { phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'reviewing' })
 * ```
 */
export const RESEARCH_REVIEW_PROMPT = (
  reviewer: "accuracy" | "completeness" | "actionability",
  p: AgentPromptParams,
): string => `
<role>
You are lu-${reviewer}-reviewer. Review the research corpus for ${reviewer} issues.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "cold", `${reviewer} review of phase ${p.phase} research`)}

<task>
1. Read the RESEARCH.md and specialist outputs in the phase directory
2. Evaluate ${reviewer}:
   ${reviewer === "accuracy" ? "- Verify claims against sources\\n   - Flag unverified URLs or hallucinated references\\n   - Check confidence levels match evidence" : ""}
   ${reviewer === "completeness" ? "- Identify missing facets and coverage gaps\\n   - Check all RESEARCH-SCOPE.md questions were answered\\n   - Flag sections with insufficient depth" : ""}
   ${reviewer === "actionability" ? "- Can a planner create concrete tasks from each finding?\\n   - Are code examples specific enough to implement?\\n   - Flag vague or non-actionable guidance" : ""}
3. Rate each finding: PASS, NEEDS_EXPANSION (gap found), CRITICAL_GAP (must address)
4. Return structured review with gap list
</task>

${outputContract("PASS_COUNT: {N}\\nNEEDS_EXPANSION: {N}\\nCRITICAL_GAPS: {N}\\nOVERALL: PASS/NEEDS_WORK")}
`;

/**
 * Prompt for lu-research-graduator to filter and promote research findings.
 *
 * Recalls all research:* engrams, scores them by confidence, actionability,
 * and uniqueness, then promotes qualifying findings to permanent MuninnDB
 * storage as patterns, pitfalls, or decisions in the default vault.
 *
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for research graduation
 *
 * @example
 * ```typescript
 * const prompt = RESEARCH_GRADUATION_PROMPT({ phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'graduating' })
 * ```
 */
export const RESEARCH_GRADUATION_PROMPT = (p: AgentPromptParams): string => `
<role>
You are lu-research-graduator. Filter research findings by quality and promote the best to permanent MuninnDB storage.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "none", `phase ${p.phase} research graduation`)}

<task>
1. Recall all research:* engrams from repo vault: mcp__muninn__muninn_recall(vault: '${p.vault}', context: ['research findings'])
2. Score each engram: score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
3. Filter by thresholds (default: score >= 0.55, confidence >= MEDIUM)
4. Promote qualifying findings to permanent storage:
   - Architecture findings → pattern:{name} in default vault
   - Risk findings → pitfall:{name} in default vault
   - Decision findings → decision:{name} in default vault
5. Link graduated engrams to related existing memories
6. Store graduation metrics: mcp__muninn__muninn_remember(vault: '${p.vault}', concept: 'metric:research-graduation-phase-${p.phase}', content: '{metrics}')
</task>

${outputContract("TOTAL_RESEARCH: {N}\\nGRADUATED: {N}\\nFILTERED: {N}\\nPROMOTED_PATTERNS: {N}\\nPROMOTED_PITFALLS: {N}")}
`;

/**
 * Prompt for lu-plan-checker in review loop mode with convergence detection.
 *
 * Verifies plans against the phase goal, compares findings against previous
 * iteration issues, and detects convergence (converging, stalled, resolved)
 * to recommend whether to approve, continue, or escalate.
 *
 * @param iteration - The current review loop iteration number
 * @param previousIssues - Issues from the previous iteration (empty string on first)
 * @param p - Common agent prompt parameters
 * @returns Formatted prompt string for plan review
 *
 * @example
 * ```typescript
 * const prompt = PLAN_REVIEW_PROMPT(1, '', { phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'planning' })
 * const prompt2 = PLAN_REVIEW_PROMPT(2, 'Missing error handling tasks', { phase: '231', complexity: 'COMPLEX', vault: 'luca-framework', currentState: 'planning' })
 * ```
 */
export const PLAN_REVIEW_PROMPT = (
  iteration: number,
  previousIssues: string,
  p: AgentPromptParams,
): string => `
<role>
You are lu-plan-checker operating in review loop mode. Verify plans against phase goal with convergence awareness.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", `phase ${p.phase} plan review iteration ${iteration}`)}

<iteration_context>
  <iteration>${iteration}</iteration>
  <previous_issues>
${previousIssues || "<!-- First iteration, no previous issues -->"}
  </previous_issues>
</iteration_context>

<task>
1. Run standard plan verification (all 6 dimensions + 10 steps from your agent definition)
2. Compare findings against previous iteration issues (if any)
3. Detect convergence:
   - If blocker count decreased: CONVERGING
   - If blocker count same or increased after revision: STALLED
   - If zero blockers: RESOLVED
4. Recommend: approve (resolved), continue (converging), escalate (stalled)
5. Return structured verification result with convergence status
</task>

${outputContract("VERDICT: PASSED/ISSUES\\nITERATION: ${iteration}\\nCONVERGING: {true/false/n/a/resolved}\\nRECOMMEND: {approve/continue/escalate}\\nBLOCKER_COUNT: {N}")}
`;
