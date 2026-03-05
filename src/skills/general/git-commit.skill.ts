/**
 * git-commit Skill - Stage and commit changes using the project's conventional commit CLI with ticket extraction.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the git-commit skill configuration
const gitCommitConfig: SkillConfig = {
  frontmatter: {
    name: "git-commit",
    description: `Stage and commit changes using the project's conventional commit CLI with ticket extraction.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Git Commit

Create commits using the project's custom CLI tool.

## Standard Workflow (Non-Interactive)

**ALWAYS** use non-interactive mode with flags:

\`\`\`bash
# Stage ALL files first (intentional - we don't do partial commits)
git add .

# Commit with flags
bun run commit --message="description" --type=fix --scope=apps --no-push
\`\`\`

**Flags:**

- \`--message="..."\` - Commit description (required for non-interactive)
- \`--type=fix|feat|chore|docs|refactor|test\` - Commit type (default: fix)
- \`--scope=apps|packages-ui|other|...\` - Commit scope (default: other)
- \`--no-push\` - Skip pushing to remote
- \`--skip-checks\` - Skip pre-commit checks (use after manual verification)

## Important Rules

1. **ALWAYS** use \`bun run commit\` instead of \`git commit -m\` directly
2. **ALWAYS** use \`git add .\` to stage ALL files before committing
3. **NEVER** do partial commits in standard workflow - partial commits are only for fixing errors
4. The tool handles ticket extraction from branch names automatically

## What the tool handles

- Commit message formatting with ticket extraction from branch names
- Changeset creation for deployable packages
- Pre-commit validation (lint, build, test)

## Interactive Mode (User-Initiated Only)

If the user explicitly requests interactive mode:

\`\`\`bash
bun run commit
\`\`\`

This prompts for commit details interactively.

## Branch Naming Convention

\`[TICKET-ID]--[description]\` (e.g., \`[TICKET-ID]--my-cool-feature\`)

> **Note:** Replace \`[TICKET-ID]\` with your project's configured ticket pattern (e.g., \`PROJ-123\`, \`PT-456\`, or your custom \`ticketPattern\` from \`.planning/config.json\`). Default pattern: \`[A-Z]+-\\d+\`
</main>`,
      order: 1,
    },
  ],
  evals: [
    {
      prompt:
        "I made changes to src/utils/helper.ts and src/components/button.tsx. Commit them.",
      expected:
        "Stages all files with `git add .`, then commits using `bun run commit --message=... --type=... --scope=... --no-push`.",
      criteria: [
        "Uses `bun run commit` instead of `git commit -m`",
        "Uses `git add .` to stage all files",
        "Includes --message, --type, and --scope flags",
      ],
    },
    {
      prompt:
        "Commit the bug fix for the login form validation on branch PROJ-456--fix-login-validation.",
      expected:
        "Commits with type=fix, extracts ticket PROJ-456 from branch name automatically.",
      criteria: [
        "Uses --type=fix for bug fix commits",
        "Relies on automatic ticket extraction from branch name",
        "Follows conventional commit format",
      ],
    },
    {
      prompt: "Commit only the changes in src/auth.ts, not the other files.",
      expected:
        "Explains that partial commits are only for fixing errors; standard workflow stages all files.",
      criteria: [
        "Acknowledges partial commit is non-standard",
        "References the rule that standard workflow uses `git add .`",
        "Offers partial commit only as error-fix exception",
      ],
    },
  ],
};

export const gitCommitSkill = createSkill(gitCommitConfig);
