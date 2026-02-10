/**
 * git-feature Skill - Create a new feature branch linked to a ticket. Use when the user wants to create a feature branch, start a new branch, or begin work on a ticket.
 */
import { BaseSkillImpl } from '../base/base-skill';
import type { SkillConfig } from '../types/skill.types';

// Define the git-feature skill configuration
const gitFeatureConfig: SkillConfig = {
  frontmatter: {
    name: 'git-feature',
    description: `Create a new feature branch linked to a ticket. Use when the user wants to create a feature branch, start a new branch, or begin work on a ticket.`,

  },
  sections: [
    {
      title: 'main',
      content: `<main>
# Git Feature Branch

Create a new feature branch linked to a ticket.

## When to Use Which Ticket Number

**Use actual ticket (e.g., \`[TICKET-ID]\`)** when:

- Work is specifically assigned via a ticket
- The ticket was created before starting the work

**Use placeholder (e.g., \`[PLACEHOLDER]\`)** for all other work:

- GitHub Issues (even auto-generated ones)
- Tech debt from code reviews
- Quick fixes, refactoring, documentation updates
- Any work not tied to a specific ticket

Configure your project's ticket pattern in `.planning/config.json` or during setup with \`luca init\`.

## Instructions

1. **Ensure clean working directory**: \`git status\`
2. **Update main**: \`git checkout main && git pull origin main\`
3. **Parse ticket and description** from user request
4. **Create branch**: \`git checkout -b [TICKET-ID]--[dash-cased-description]\`
5. **Push with upstream**: \`git push -u origin [branch-name]\`
6. **Report branch name**

## Branch format

\`[TICKET-ID]--[description]\`

Examples (adjust to your project's ticket pattern):

- \`PROJ-1234--add-user-authentication\` (Jira-driven, if pattern is \`PROJ-\\\\d+\`)
- \`PT-123--fix-login-bug\` (if pattern is \`PT-\\\\d+\`)
- \`GITHUB-567--update-readme\` (if pattern is \`GITHUB-\\\\d+\`)
- \`PROJ-0000--fix-security-vulnerability\` (placeholder)
- \`PROJ-0000--refactor-auth-hooks\` (tech debt)

**Key principle:** No ticket? Use your configured placeholder ticket (default: \`PROJ-0000\`).
</main>`,
      order: 1
    }
  ]
};

export class GitFeatureSkill extends BaseSkillImpl {
  constructor() {
    super(gitFeatureConfig);
  }
}
