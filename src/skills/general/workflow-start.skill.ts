/**
 * workflow-start Skill - Start work on a Jira ticket following the full workflow. Use when the user wants to start a ticket, begin work on Jira issue, set up for new work, or initiate the full dev workflow.
 */
import { BaseSkillImpl } from '../base/base-skill';
import { SkillConfig } from '../types/skill.types';

// Define the workflow-start skill configuration
const workflowstartConfig: SkillConfig = {
  frontmatter: {
    name: 'workflow-start',
    description: `Start work on a Jira ticket following the full workflow. Use when the user wants to start a ticket, begin work on Jira issue, set up for new work, or initiate the full dev workflow.`,
    
  },
  sections: [
    {
      title: 'main',
      content: `<main>
# Workflow Start

**REDIRECT:** This workflow is now integrated into \`/lu\`.

## Usage

Instead of \`/workflow-start PROJ-1234\`, use:

\`\`\`
/lu PROJ-1234
\`\`\`

or

\`\`\`
/lu $JIRA_BASE_URL/browse/PROJ-1234
\`\`\`

## What /lu Does

When given a Jira ticket, \`/lu\` automatically:

1. **Fetches Jira details** via Atlassian MCP
2. **Creates GitHub issue** linked to the ticket
3. **Creates feature branch** (PROJ-####--description) off current base branch
4. **Updates STATE.md** with git context
5. **Runs cognitive pre-flight** with memory recall
6. **Classifies complexity** and routes appropriately
7. **Executes work** with verification
8. **Offers PR creation** when complete

## Flags

- \`--skip-branch\` - Skip branch creation (if already on correct branch)
- \`--force-complex\` - Force full planning pipeline
- \`--skip-memory\` - Skip memory recall

## Example

\`\`\`
/lu PROJ-1234
\`\`\`

Output:

\`\`\`
Luca > GIT CONTEXT

Jira:   PROJ-1234 - Feature description
Issue:  #789
Branch: PROJ-1234--feature-description
Base:   main (or release branch)
\`\`\`

Then proceeds with cognitive pre-flight and task execution.

## Legacy Reference

The original workflow was:

\`\`\`
Jira ticket -> GitHub issue -> Feature branch -> Plan -> Work -> PR
\`\`\`

This is now fully handled by \`/lu\` when given a Jira ticket input.
</main>`,
      order: 1
    }
  ]
};

export class WorkflowstartSkill extends BaseSkillImpl {
  constructor() {
    super(workflowstartConfig);
  }
}
