/**
 * jira-issue Skill - Create a GitHub issue from a Jira ticket. Use when the user wants to import a Jira ticket, create GitHub issue from Jira, sync Jira to GitHub, or link Jira ticket.
 */
import { BaseSkillImpl } from '../base/base-skill';
import type { SkillConfig } from '../types/skill.types';

// Define the jira-issue skill configuration
const jiraIssueConfig: SkillConfig = {
  frontmatter: {
    name: 'jira-issue',
    description: `Create a GitHub issue from a Jira ticket. Use when the user wants to import a Jira ticket, create GitHub issue from Jira, sync Jira to GitHub, or link Jira ticket.`,
    
  },
  sections: [
    {
      title: 'main',
      content: `<main>
# Jira to GitHub Issue

Create a GitHub issue from a Jira ticket.

## Required Environment Variables

Must be set in shell environment or \`.env\`:

- \`JIRA_BASE_URL\` - e.g., \`https://yourcompany.atlassian.net\`
- \`JIRA_USER_EMAIL\` - Your Atlassian account email
- \`JIRA_API_TOKEN\` - Generate at <https://id.atlassian.com/manage/api-tokens>
- \`JIRA_TICKET_PREFIX\` - Your project's ticket prefix (e.g., \`PROJ\`, \`DEV\`)

## Instructions

1. **Parse ticket number** (e.g., \`PROJ-1234\`)

2. **Verify environment**:

   \`\`\`bash
   echo "JIRA_BASE_URL: ${JIRA_BASE_URL:-NOT SET}"
   echo "JIRA_USER_EMAIL: ${JIRA_USER_EMAIL:-NOT SET}"
   echo "JIRA_API_TOKEN: ${JIRA_API_TOKEN:+SET}"
   \`\`\`

3. **Fetch Jira issue**:

   \`\`\`bash
   curl -s -u "\$JIRA_USER_EMAIL:\$JIRA_API_TOKEN" \
     "\$JIRA_BASE_URL/rest/api/3/issue/PROJ-1234?fields=summary,description,issuetype,priority,status,assignee"
   \`\`\`

4. **Map labels**:

   | Jira Type | GitHub Label  |
   | --------- | ------------- |
   | Bug       | \`bug\`         |
   | Story     | \`enhancement\` |
   | Task      | \`task\`        |
   | Epic      | \`epic\`        |
   | Sub-task  | \`subtask\`     |

   Always add \`from-jira\` label.

5. **Create GitHub issue**:

   \`\`\`bash
   gh issue create \
     --title "[PROJ-1234] Summary text" \
     --body "..." \
     --label "from-jira" \
     --label "[mapped-type-label]"
   \`\`\`

## GitHub Issue Body Template

\`\`\`markdown
> **Jira Ticket:** [PROJ-1234](\$JIRA_BASE_URL/browse/PROJ-1234)

## Details

- **Type:** [type]
- **Priority:** [priority]
- **Status:** [status]
- **Assignee:** [assignee or "Unassigned"]

## Description

[description content]

---

_Created from Jira using jira-issue skill_
\`\`\`

## Troubleshooting

- **401 Unauthorized**: Check JIRA_USER_EMAIL and JIRA_API_TOKEN
- **404 Not Found**: Verify ticket exists and you have access
- **Connection error**: Check JIRA_BASE_URL (no trailing slash)
</main>`,
      order: 1
    }
  ]
};

export class JiraIssueSkill extends BaseSkillImpl {
  constructor() {
    super(jiraIssueConfig);
  }
}
