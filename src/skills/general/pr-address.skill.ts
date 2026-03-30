/**
 * pr-address Skill — Flat orchestrator for the PR comment address workflow.
 *
 * Delegates all work to 6 Agent() sub-agents (leaf workers):
 *   fetch, validate, debate, fix, learn, respond
 *
 * Uses shared prompt templates from `agent-prompts.ts` and structured
 * output contracts from `agent-output.schemas.ts`.
 *
 * Sub-agents CANNOT spawn other agents — they are leaf workers with
 * Read, Write, Edit, Bash, Grep, Glob, and MCP tool access.
 *
 * @see docs/skill-to-agent-migration/architecture.md
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const prAddressConfig: SkillConfig = {
  frontmatter: {
    name: "pr-address",
    description:
      "Address PR review comments by orchestrating Agent() sub-agents: fetch, validate, debate, fix, learn, respond.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# pr-address — Flat Agent() Orchestrator

Address pull request review comments through coordinated Agent() sub-agents. This skill is a **flat orchestrator** — it spawns leaf-worker agents via Agent(), reads context between steps, writes state transitions, and manages the pipeline.

## Constraints

- **ALL Agent() calls originate from this orchestrator** — sub-agents are leaf workers
- **Sub-agents CANNOT call Agent(), Task(), or Skill()** — they use Read, Write, Edit, Bash, Grep, Glob, and MCP tools only
- **Orchestrator writes all state transitions** — sub-agents return results, orchestrator writes context
- **Prompt templates live in \`src/skills/__helpers/agent-prompts.ts\`** — read that file for full Agent() prompt content

## Vault Resolution

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

## Input Modes

| Input     | Example                                             | Behavior                      |
| --------- | --------------------------------------------------- | ----------------------------- |
| No input  | \`/pr-address\`                                     | Detect PR from current branch |
| PR number | \`/pr-address 123\`                                 | Use specified PR number       |
| PR URL    | \`/pr-address https://github.com/.../pull/123\`     | Parse PR from URL             |

## Flags

- \`--dry-run\` — Validate and plan only, don't execute or respond
- \`--skip-validation\` — Skip agent validation, address all comments
- \`--category=security\` — Only address comments of specific category
- \`--no-respond\` — Execute fixes but don't post responses

## State Machine

\`\`\`
idle -> fetched -> validated -> [debated] -> fixed ->
[learned] -> pushed
\`\`\`

Terminal states: \`pushed\` (success) or \`failed\` (error).

## Orchestrator Flow

### Step 0: Parse Args, Crash Recovery, Initialize Context

Parse the PR number/URL from args. Extract any flags.

**Crash recovery:** Before initializing, check if a previous session was interrupted:

\`\`\`bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state pr-address 2>/dev/null || echo "")
if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
  echo "Resuming from state: $EXISTING_STATE"
  # Skip steps that already completed based on current_state
else
  bun src/skills/__schemas/context-cli.ts init pr-address
fi
\`\`\`

### Step 1: Fetch PR Data

Read \`src/skills/__helpers/agent-prompts.ts\` for the PR_FETCH_PROMPT template, then:

\`\`\`
Agent(name: "fetch", description: "Fetch PR data",
  prompt: PR_FETCH_PROMPT with phase={pr_number}, vault=REPO_VAULT, complexity=current, currentState="idle")
\`\`\`

Parse Agent output for STATUS and DUPLICATE_COUNT. On failure: write state "failed", HALT.

**Write state (include duplicate map so respond agent can use it):**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"fetched"}'
\`\`\`

**IMPORTANT:** The fetch agent groups duplicate comments (same body text) and returns
a duplicate map. Pass this map through context so the respond agent (Step 6) can reply
to ALL comment IDs, not just the primary ones.

### Step 2: Validate and Categorize Comments

\`\`\`
Agent(name: "validate", description: "Validate PR concerns",
  prompt: PR_VALIDATE_PROMPT with current context)
\`\`\`

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"validated"}'
\`\`\`

### Step 3: Conditional Debate (Split Verdicts)

Read context to check for split verdicts from the validate step's output:

\`\`\`bash
CTX=$(bun src/skills/__schemas/context-cli.ts read pr-address 2>/dev/null)
# Parse SPLIT_VERDICTS count from validate agent's output
\`\`\`

**If split verdicts > 0:**

\`\`\`
Agent(name: "debate", description: "Debate split verdicts",
  prompt: PR_DEBATE_PROMPT with split verdict context)
\`\`\`

On failure (optional): log warning, continue.

**If NO split verdicts:** Skip debate (SKIP_DEBATE).

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"debated"}'
\`\`\`

### Step 4: Plan and Execute Fixes

\`\`\`
Agent(name: "fix", description: "Fix PR concerns",
  prompt: PR_FIX_PROMPT with validated concerns from context)
\`\`\`

The fix agent reads the validated concerns, implements code fixes with atomic commits, and runs type-check. It does ALL fix work as a leaf agent (no sub-agent spawning).

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"fixed"}'
\`\`\`

### Step 5: Conditional Learning

Check if there were valid concerns worth learning from:

**If valid concerns exist:**

\`\`\`
Agent(name: "learn", description: "Capture PR patterns",
  prompt: PR_LEARN_PROMPT with concern data)
\`\`\`

On failure (optional): log warning, continue.

**If NO valid concerns:** Skip learning (SKIP_LEARN).

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"learned"}'
\`\`\`

### Step 6: Respond and Push

\`\`\`
Agent(name: "respond", description: "Post PR responses",
  prompt: PR_RESPOND_PROMPT with fix tracking, debate results, AND the duplicate map from Step 1)
\`\`\`

The respond agent replies to ALL comment IDs — primary comments get full responses,
duplicate IDs get short "Duplicate — see reply on primary" responses. After posting,
it runs a verification query to confirm zero unreplied comments remain.

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write pr-address '{"current_state":"pushed"}'
\`\`\`

### Step 7: Gap Detection Audit

Build a DAGCheckpoint from the execution trace and call \`detectGaps(prAddressDAG, checkpoint)\` to verify coverage.

- \`completedSteps\`: Map each completed Agent() call to a DAG step ID
- \`skippedSteps\`: For SKIP_DEBATE or SKIP_LEARN, create entries with \`reason: "guard-false"\`, \`optional: true\`
- Report result: clean (all steps covered), warning (optional steps skipped), or fail (required steps missing)

## Error Handling

**Required agents** (fetch, validate, fix, respond):
- On failure -> write state "failed" -> workflow halts

**Optional agents** (debate, learn):
- On failure -> log warning -> continue to next step via SKIP event

Every transition is explicit: completion, skip, or abort. No silent omission.

## Success Criteria

- [ ] PR identified (from branch or input)
- [ ] All comments fetched and categorized (fetch + validate agents)
- [ ] Split verdicts debated OR explicitly skipped
- [ ] Fixes implemented with atomic commits (fix agent)
- [ ] Learnings captured OR explicitly skipped
- [ ] Responses posted and changes pushed (respond agent)
- [ ] Gap detection audit passes
- [ ] State machine reaches \`pushed\` or \`failed\`
- [ ] \`current_state\` written after every transition
</main>`,
      order: 1,
    },
  ],
};

export const prAddressSkill = createSkill(prAddressConfig);
