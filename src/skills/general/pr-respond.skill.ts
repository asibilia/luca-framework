/**
 * pr-respond Sub-Skill — Post responses to PR comments and push changes.
 *
 * Extracts Steps 8-9 from the monolithic pr-address skill.
 *
 * **Responsibility:** Read fix tracking, debate results, and disputed concerns
 * from context file. Post responses to addressed comments, post responses to
 * disputed concerns, include split verdict information for deferred-to-human
 * items, push all fixes, post summary comment on PR.
 *
 * **Input:** Fix tracking + debate results from context file
 * **Output:** Populated `pr_respond` section in `/tmp/pr-address-context.json`
 *
 * This is a leaf skill — it does NOT spawn sub-agents via Task().
 * It executes gh API calls directly.
 *
 * @see .planning/phases/223-anti-skip-pilot/01-PLAN.md Task 8
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const prRespondConfig: SkillConfig = {
  frontmatter: {
    name: "pr-respond",
    description:
      "Post responses to PR review comments and push changes to the remote.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# pr-respond — Post PR Responses and Push Changes

Post responses to all PR review comments (addressed fixes, disputed concerns, deferred items) and push changes to the remote.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at \`/tmp/pr-address-context.json\`.

**Read:** Call \`readPrContext()\` from \`src/skills/__schemas/pr-address-context.schemas.ts\`. If \`success: false\`, ABORT immediately. Requires \`pr_fetch\`, \`pr_validate\`, and \`pr_fix\` sections to be populated.

**Write:** Call \`writePrContext({ pr_respond: { ... } })\` to populate the \`pr_respond\` section.

## Process

### Step 8: Respond to PR Comments

Read the context file for fix tracking, debate results, and disputed concerns.

**For each addressed fix (fix_tracking where verified: true):**

\`\`\`bash
# Reply to the specific review comment
gh api -X POST "/repos/\${REPO}/pulls/\${PR_NUMBER}/comments/\${COMMENT_ID}/replies" \\
  -f body="Fixed in \${COMMIT_HASH}. \${FIX_DESCRIPTION}"
\`\`\`

**For each disputed concern (disputed_concerns array):**

\`\`\`bash
# Reply with the disagree response
gh api -X POST "/repos/\${REPO}/pulls/\${PR_NUMBER}/comments/\${COMMENT_ID}/replies" \\
  -f body="\${DISAGREE_RESPONSE}"
\`\`\`

**For split verdicts deferred to human (debate_results where deferred_to_human: true):**

Include both perspectives in the response so the human reviewer has full context.

### Step 9: Push and Summary

\`\`\`bash
# Push all fixes
git push

# Post summary comment on PR
gh pr comment \${PR_NUMBER} --body "$(cat <<'SUMMARY'
## PR Feedback Addressed

### Fixes Implemented
| Concern | Fix | Commit |
|---------|-----|--------|
| \${CONCERN_1} | \${FIX_1} | \${HASH_1} |

### Responses Posted
| Comment | Response |
|---------|----------|
| \${COMMENT_2} | Respectfully disagree because... |

### Contested Comments (Human Review Requested)

| Comment | Split | Majority | Dissent | Recommendation |
|---------|-------|----------|---------|----------------|
| #{id}   | 3-3   | Valid    | Invalid | Defer to human |

(Omit this section if no split verdicts were deferred to human.)

### No Action Needed
- \${INFO_COMMENT_1}

---
*Addressed via Luca \\\`/pr-address\\\`*
SUMMARY
)"
\`\`\`

### Step 9.9: Write to Context File

Write response tracking to the shared context file:

\`\`\`typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_respond: {
    responses_posted: responsesPosted.map(r => ({
      comment_id: r.comment_id,
      response_type: r.response_type,  // "fix", "dispute", "deferred"
      posted: r.posted,
    })),
    summary_posted: true,
    pushed: true,
  },
});
\`\`\`

## Output

On success, the context file will include:

\`\`\`json
{
  "pr_respond": {
    "responses_posted": [
      { "comment_id": "123", "response_type": "fix", "posted": true },
      { "comment_id": "456", "response_type": "dispute", "posted": true }
    ],
    "summary_posted": true,
    "pushed": true
  }
}
\`\`\`

## Error Handling

- **Context file missing or invalid:** ABORT — pr-fix must run first
- **GitHub API failure (posting comment):** Log warning, mark response as posted: false, continue with remaining comments
- **git push failure:** Log error, set pushed: false, still post summary (without pushed status)
- **gh pr comment failure:** Log error, set summary_posted: false

## Constraints

- This is a **leaf skill** — do NOT spawn sub-agents via Task()
- This skill performs GitHub API calls directly via gh CLI
- Do NOT re-validate or re-fix concerns — only respond and push
- Post responses in order: fixes first, disputes second, deferred last
- The summary comment should include ALL categories (fixes, disputes, deferred, no-action)
</main>`,
      order: 1,
    },
  ],
};

export const prRespondSkill = createSkill(prRespondConfig);
