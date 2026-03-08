/**
 * Temporarily prohibit adding test files until the dedicated reintroduction effort
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const noTestsConfig: RuleConfig = {
  frontmatter: {
    description: `Temporarily prohibit adding test files`,

    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `- **DO NOT create test files** (*.test.ts, *.spec.ts, __tests__/ directories)
  - Tests were removed wholesale because the pre-commit gate spawning \`bun test\` on every commit was orphaning hundreds of processes and freezing the machine
  - Tests will be selectively reintroduced in a single dedicated effort
  - See: \`.planning/notes/0-reintroduce-tests.md\` for the plan
  - If you need to verify code correctness, use \`bunx --bun tsc --noEmit\` (type-checking is still active in the pre-commit gate)
  - This rule will be removed once the test reintroduction effort is complete`,
    },
  ],
};

export const noTestsRule = createRule(noTestsConfig);
