/**
 * code-typecheck Skill - Run TypeScript type checking on the codebase or a specific workspace.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the code-typecheck skill configuration
const codeTypecheckConfig: SkillConfig = {
  frontmatter: {
    name: "code-typecheck",
    description: `Run TypeScript type checking on the codebase or a specific workspace.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Code Typecheck

Run TypeScript type checking on the codebase.

## Instructions

1. **Determine scope**:
   - Specific workspace: \`bun run --cwd [workspace] tsc --noEmit\`
   - Full codebase: \`bun turbo typecheck\`
2. **Parse errors**: Categorize by severity and group by file
3. **Suggest fixes** for common patterns

## Notes

- Turborepo parallelizes type checking across all workspaces
- Use specific workspace path to check only that package
</main>`,
      order: 1,
    },
  ],
};

export const codeTypecheckSkill = createSkill(codeTypecheckConfig);
