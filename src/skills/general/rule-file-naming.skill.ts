/**
 * rule-file-naming Skill - File and directory naming conventions: kebab-case enforcement with examples and migration guidelines.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the rule-file-naming skill configuration
const ruleFileNamingConfig: SkillConfig = {
  frontmatter: {
    name: "rule-file-naming",
    description: `File and directory naming conventions: kebab-case enforcement with examples and migration guidelines.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `- **File Names**: ALWAYS use kebab-case (lowercase with dashes) for all file names
  - ✅ **Correct Examples:**
    \`\`\`
    user-profile.tsx
    auth-utils.ts
    mock-fs.test.ts
    api-helpers.js
    task-archive.ts
    package-utils.ts
    \`\`\`
  - ❌ **Avoid These:**
    \`\`\`
    userProfile.tsx      (camelCase)
    AuthUtils.ts        (PascalCase)
    mockFs.test.ts      (mixed case)
    APIHelpers.js       (acronyms + PascalCase)
    taskArchive.ts      (camelCase)
    packageUtils.ts     (camelCase)
    \`\`\`

- **Directory Names**: Use kebab-case for all directory names
  - ✅ **Correct Examples:**
    \`\`\`
    components/auth-wizard/
    utils/file-helpers/
    tests/unit/
    packages-dev/task-archive/
    \`\`\`
  - ❌ **Avoid These:**
    \`\`\`
    components/AuthWizard/     (PascalCase)
    utils/fileHelpers/        (camelCase)
    tests/unitTests/          (camelCase)
    \`\`\`

- **Special Cases**:
  - **Test Files**: Use \`.test.ts\` or \`.spec.ts\` suffix with kebab-case base name
    - ✅ \`user-service.test.ts\`, \`auth-utils.spec.ts\`
    - ❌ \`UserService.test.ts\`, \`authUtils.test.ts\`
  - **Type Definition Files**: Use \`.d.ts\` suffix with kebab-case base name
    - ✅ \`global-types.d.ts\`, \`api-response.d.ts\`
    - ❌ \`GlobalTypes.d.ts\`, \`apiResponse.d.ts\`
  - **Configuration Files**: Follow the tool's convention if required, otherwise use kebab-case
    - ✅ \`next.config.js\` (tool convention), \`custom-config.js\` (kebab-case)

- **Why kebab-case?**
  - **Cross-platform compatibility**: Works consistently across all operating systems
  - **URL-friendly**: Can be used directly in URLs without encoding
  - **Git-friendly**: Avoids issues with case-sensitive/insensitive file systems
  - **Readable**: Easy to read and distinguish words
  - **Consistent**: Matches our directory naming convention

- **Migration Guidelines**:
  - When refactoring existing files, rename them to kebab-case
  - Update all import statements that reference the old file names
  - Use git \`mv\` command to preserve file history: \`git mv oldFile.ts new-file.ts\`
  - Run tests after renaming to ensure all imports are updated correctly

- **Exceptions**:
  - Files that must follow external tool conventions (e.g., \`next.config.js\`, \`package.json\`)
  - Legacy files being gradually migrated (document in PR when updating)`,
      order: 1,
    },
  ],
};

export class RuleFileNamingSkill extends BaseSkillImpl {
  constructor() {
    super(ruleFileNamingConfig);
  }
}
