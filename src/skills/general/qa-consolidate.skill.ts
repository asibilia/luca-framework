/**
 * qa-consolidate Skill - Consolidate QA testing plans from merged feature PRs onto a parent release PR.
 */
import { createSkill } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.schemas";

// Define the qa-consolidate skill configuration
const qaConsolidateConfig: SkillConfig = {
  frontmatter: {
    name: "qa-consolidate",
    description: `Consolidate QA testing plans from merged feature PRs onto a parent release PR.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# QA Plan Consolidation

Consolidate QA testing plans from merged feature PRs onto the parent release PR to main.

## Prerequisites

- \`gh\` CLI authenticated (\`gh auth status\`)
- On a feature branch or know the release branch name

## Instructions

### Step 1: Detect Context

\`\`\`bash
# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
\`\`\`

If on a feature branch, extract the release branch it targets. If not on a feature branch, prompt the user for the release branch name.

### Step 2: Find the Release PR to Main

\`\`\`bash
# Replace RELEASE_BRANCH with actual branch name
gh pr list --head RELEASE_BRANCH --base main --state open --json number,url,title
\`\`\`

If no release PR exists, stop and inform the user: "No open release PR found for branch [RELEASE_BRANCH] to main."

### Step 3: Fetch All Merged Feature PRs

\`\`\`bash
# Get all merged feature PRs into the release branch
gh pr list --base RELEASE_BRANCH --state merged --json number,title,body,comments
\`\`\`

### Step 4: Extract QA Comments

For each merged feature PR:

1. Check PR comments for content containing "Manual QA Testing Plan" or "Testing Plan"
2. If no QA comment found, check the PR body
3. If still no QA content, mark as "QA plan pending"

### Step 5: Check for Existing Consolidated Comment

\`\`\`bash
# Get the release PR number first, then check its comments
# Replace OWNER/REPO with your repository (or use $(gh repo view --json nameWithOwner -q .nameWithOwner))
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api repos/$REPO/issues/[RELEASE_PR_NUMBER]/comments --jq '.[] | select(.body | contains("CONSOLIDATED-QA-PLAN")) | {id: .id, url: .html_url}'
\`\`\`

### Step 6: Build Consolidated QA Markdown

Use this exact format:

\`\`\`markdown
<!-- CONSOLIDATED-QA-PLAN -->
## Release QA Testing Plan - [RELEASE-ID]

This release includes the following features and fixes. Each section contains the QA testing plan from the original PR.

---

### Included Features and Fixes

| PR | Title | Type |
|----|-------|------|
| #123 | FEATURE-5678: Feature A | Feature |
| #124 | FIX-5679: Fix B | Fix |

---

### Individual QA Plans

#### FEATURE-5678: Feature A (#123)

[Copy the full QA plan content from the feature PR comment here]

---

#### FIX-5679: Fix B (#124)

[Copy the full QA plan content from the feature PR comment here]

---

### Release Regression Checklist

- [ ] All individual feature tests pass
- [ ] Cross-feature integration works
- [ ] No regressions in existing functionality

---

*Last updated: [timestamp] after merging #[latest_merged_pr]*
\`\`\`

For feature PRs without QA plans:

\`\`\`markdown
#### FEATURE-XXXX: Title (#NNN)

**QA plan pending** - No QA testing plan was found for this PR.
\`\`\`

### Step 7: Post or Update the Comment

**If existing consolidated comment found:**

\`\`\`bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api repos/$REPO/issues/comments/[COMMENT_ID] -X PATCH -f body='[NEW_BODY]'
\`\`\`

**If no existing comment:**

\`\`\`bash
gh pr comment [RELEASE_PR_NUMBER] --body '[BODY]'
\`\`\`

## Determining PR Type

Map PR title prefixes to types:

| Title Prefix | Type |
|--------------|------|
| \`fix(...)\` | Fix |
| \`feat(...)\` | Feature |
| \`chore(...)\` | Chore |
| \`refactor(...)\` | Refactor |
| \`docs(...)\` | Docs |
| Other | Change |

## Retroactive QA Plan Generation

When merged feature PRs are missing QA plans, use this workflow to generate them retroactively before consolidating.

### Step 1: Identify PRs Missing QA Plans

After Step 4 (Extract QA Comments), note which PRs have no QA content. Filter out automated PRs:

\`\`\`bash
# Get merged feature PRs (exclude automated bump PRs)
gh pr list --base RELEASE_BRANCH --state merged --json number,title | jq '[.[] | select(.title | test("^(fix|feat|chore|refactor|docs)\(") and (test("automated") | not))]'
\`\`\`

### Step 2: Fetch PR Diff for Each Missing PR

\`\`\`bash
# Get the diff for a specific PR
gh pr diff [PR_NUMBER]
\`\`\`

### Step 3: Generate QA Plan Using Subagent

For each PR missing a QA plan, invoke the \`qa-plan-generator\` subagent:

\`\`\`
Task with subagent_type="qa-plan-generator":

"Generate a QA testing plan for PR #[PR_NUMBER] titled '[PR_TITLE]'.

Here is the diff:

[PASTE DIFF OUTPUT HERE]

Follow the qa-plan-generator format and include:
- Affected portals based on changed files
- Specific test scenarios with steps and expected results
- Regression risks"
\`\`\`

### Step 4: Post Generated QA Plan to Original Feature PR

\`\`\`bash
gh pr comment [PR_NUMBER] --body '[GENERATED_QA_PLAN]'
\`\`\`

This creates a permanent record on the original PR for future reference.

### Step 5: Continue with Consolidation

Now re-run the consolidation workflow from Step 4 onwards. The newly posted QA comments will be picked up automatically.

### Batch Retroactive Generation

For multiple PRs missing QA plans:

1. **List all PRs needing QA plans:**

   \`\`\`bash
   # This outputs PR numbers and titles for PRs without QA comments
   REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
   for pr in $(gh pr list --base RELEASE_BRANCH --state merged --json number -q '.[].number'); do
     has_qa=$(gh api repos/$REPO/issues/$pr/comments --jq '[.[] | select(.body | contains("Testing Plan"))] | length')
     if [ "$has_qa" = "0" ]; then
       gh pr view $pr --json number,title -q '"(.number): (.title)"'
     fi
   done
   \`\`\`

2. **Generate QA plans in parallel:**
   - Open multiple Task invocations with \`qa-plan-generator\` subagent
   - Each handles one PR's diff

3. **Post all generated plans:**
   - Post each generated QA plan to its respective feature PR
   - Verify with \`gh pr view [PR_NUMBER] --comments\`

4. **Run final consolidation:**
   - Execute the main consolidation workflow
   - All QA plans (original + retroactively generated) are now included

### Retroactive Generation Format

When generating retroactive QA plans, prefix them to indicate they were created post-merge:

\`\`\`markdown
## Manual QA Testing Plan

*Generated retroactively for release consolidation*

[Rest of QA plan content...]
\`\`\`

## Error Handling

| Error | Resolution |
|-------|------------|
| No release PR found | Ensure the release branch has an open PR to main |
| gh not authenticated | Run \`gh auth login\` |
| API rate limit | Wait and retry, or use \`--limit\` on queries |
| Comment too long | Summarize individual QA plans if needed |
| PR diff too large | Focus on key files, summarize large diffs |
| Subagent timeout | Split into smaller chunks or retry |

## Integration with qa-plan-generator

The \`qa-plan-generator\` subagent is used for:

1. **Individual PR QA plans** - Generate before merging
2. **Retroactive generation** - Generate for merged PRs missing plans

Invoke it with:

\`\`\`
Task with subagent_type="qa-plan-generator":
"Generate QA testing plan for feature PR #[NUMBER] based on its changes"
\`\`\`

The subagent will:

- Analyze the diff to identify affected portals
- Create specific test scenarios with steps
- Highlight regression risks
- Format output for direct posting

## Example Invocations

### Standard Consolidation

User says: "consolidate QA plans for RELEASE-1345"

1. Find release PR: \`gh pr list --head RELEASE-1345--release --base main --state open\`
2. Get merged feature PRs: \`gh pr list --base RELEASE-1345--release --state merged\`
3. Extract QA comments from each
4. Build and post consolidated comment

### Retroactive Generation + Consolidation

User says: "generate missing QA plans and consolidate for RELEASE-1345"

1. Find release PR and list merged feature PRs
2. Check each feature PR for QA plan comments
3. For PRs missing QA plans:
   - Fetch diff: \`gh pr diff [PR_NUMBER]\`
   - Invoke \`qa-plan-generator\` subagent with the diff
   - Post generated QA plan to original feature PR
4. Build and post consolidated comment with all QA plans
</main>`,
      order: 1,
    },
  ],
};

export const qaConsolidateSkill = createSkill(qaConsolidateConfig);
