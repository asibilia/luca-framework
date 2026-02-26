/**
 * code-lint Skill - Run ESLint with auto-fix on the codebase or a specific path.
 */
import { createSkill } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.schemas";

// Define the code-lint skill configuration
const codeLintConfig: SkillConfig = {
  frontmatter: {
    name: "code-lint",
    description: `Run ESLint with auto-fix on the codebase or a specific path.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Code Lint

Run ESLint with auto-fix on the codebase.

## Instructions

1. **Determine target**: Use user-specified path or entire codebase
2. **Run lint command**:
   - Full codebase: \`bun run lint\`
   - Specific path: \`bun run --cwd [path] lint\`
3. **Report results**: List fixed issues and remaining errors
4. **Suggest fixes** for remaining issues

## Workspace-specific examples

\`\`\`bash
bun run --cwd apps/admin-ui lint
bun run --cwd packages-ui/components lint
\`\`\`
</main>`,
      order: 1,
    },
  ],
};

export const codeLintSkill = createSkill(codeLintConfig);
