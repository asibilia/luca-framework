/**
 * verify-extract Sub-Skill — Find summaries, extract deliverables, create UAT template.
 *
 * Extracts Steps 1-4 from the monolithic verify skill.
 *
 * **Responsibility:** Find phase SUMMARY.md files, extract testable deliverables
 * (user-observable outcomes), create {phase}-UAT.md template with verification
 * items, and write results to the shared context file.
 *
 * **Input:** Phase number (from orchestrator args)
 * **Output:** Populated `verify_extract` section in `/tmp/verify-context.json`
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 3
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const verifyExtractConfig: SkillConfig = {
  frontmatter: {
    name: "verify-extract",
    description:
      "Find phase summaries, extract testable deliverables, and create UAT template for the verify sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# verify-extract — Summary Extraction and UAT Template Creation

Find phase summaries, extract testable deliverables, and create the UAT.md template.

## Context File Protocol

This sub-skill is part of the verify chain. It reads/writes the shared context file at \`/tmp/verify-context.json\`.

**Read:** Call \`readVerifyContext()\` from \`src/skills/__schemas/verify-context.schemas.ts\`. If \`success: false\`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call \`writeVerifyContext({ verify_extract: { ... } })\` to populate the \`verify_extract\` section.

## Process

### Step 1: Check for Active UAT Session

Check if a UAT.md file already exists for this phase:

\`\`\`bash
PHASE_DIR=$(ls -d .planning/phases/{phase_number}-* 2>/dev/null | head -1)
UAT_PATH="\${PHASE_DIR}/{phase_number}-UAT.md"
\`\`\`

If UAT.md exists and has in-progress results, offer to resume rather than overwrite.

### Step 2: Find SUMMARY.md Files

Find all SUMMARY.md files for the phase:

\`\`\`bash
SUMMARIES=$(ls \${PHASE_DIR}/*-SUMMARY.md 2>/dev/null)
\`\`\`

If no summaries found, check the phase directory structure. If still none, ABORT — cannot verify without execution summaries.

### Step 3: Extract Testable Deliverables

For each SUMMARY.md:
- Extract user-observable outcomes (features, fixes, changes)
- Extract verification criteria from the corresponding PLAN.md
- Create test items that describe expected behavior in plain language
- Skip internal/technical items that are not user-testable

Focus on outcomes the user can verify:
- "Feature X should do Y when Z"
- "Running command A should produce output B"
- "File C should contain D"

### Step 4: Create UAT.md Template

Create \`{phase_number}-UAT.md\` with the extracted test items:

\`\`\`markdown
# Phase {N} — UAT Test Results

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 1 | {test_description} | {expected_behavior} | PENDING | |
| 2 | ... | ... | PENDING | |

## Summary
- Total: {N}
- Passed: 0
- Failed: 0
- Pending: {N}
\`\`\`

### Step 5: Write to Context File

\`\`\`typescript
import { writeVerifyContext } from "src/skills/__schemas/verify-context.schemas";

await writeVerifyContext({
  verify_extract: {
    summaries_found: summariesCount,
    deliverables_extracted: deliverablesCount,
    uat_template_path: uatPath,
  },
});
\`\`\`

## Output

On success, the context file will contain:

\`\`\`json
{
  "context_version": 1,
  "verify_extract": {
    "summaries_found": 3,
    "deliverables_extracted": 12,
    "uat_template_path": ".planning/phases/99-feature/99-UAT.md"
  }
}
\`\`\`

## Error Handling

- **No summaries found:** ABORT with clear message indicating phase has no execution summaries.
- **Phase directory not found:** ABORT with message suggesting the phase number may be incorrect.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via \`writeVerifyContext()\`
- Do NOT present tests to the user — that is verify-test's responsibility
- Do NOT run any tests — only extract and template
</main>`,
      order: 1,
    },
  ],
};

export const verifyExtractSkill = createSkill(verifyExtractConfig);
