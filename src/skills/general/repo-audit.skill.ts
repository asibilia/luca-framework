/**
 * repo-audit Skill - Run repo structure audit to detect naming violations, orphaned files, and convention drift.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const repoAuditConfig: SkillConfig = {
  frontmatter: {
    name: "repo-audit",
    description: `Run repo structure audit to detect naming violations, orphaned files, and convention drift. Supports quick and full audit modes.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Repo Audit

Run a repo structure health check to detect naming violations, orphaned files, import boundary violations, and convention drift.

**Arguments:** \`[--quick|--full] [--fix]\`

## Sub-agent Delegation

This skill delegates the analysis to the \`lu-repo-architect\` agent:

\`\`\`
Task(
  agent: "lu-repo-architect",
  prompt: "Run {mode} repo audit on this codebase. Report findings in structured format."
)
\`\`\`

## Instructions

### 1. Determine Audit Mode

\`\`\`bash
luca-bridge write-status --skill=repo-audit --stage=AUDITING 2>/dev/null || true
\`\`\`

- \`--quick\` or TRIVIAL/SIMPLE complexity: Quick audit (naming, boundaries, drift only)
- \`--full\` or COMPLEX/CRITICAL complexity: Full audit (all checks including circular imports, dead exports)
- Default (MODERATE): Standard audit

Read complexity from state:
\`\`\`bash
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
\`\`\`

### 2. Run Automated Checks

Run existing validation scripts first (these provide baseline data):

\`\`\`bash
# Domain boundary check
bun run scripts/check-domain-boundaries.ts 2>&1

# Build drift check
bun run check:drift 2>&1
\`\`\`

### 3. Delegate to lu-repo-architect

Spawn the agent for deeper analysis based on the mode:

\`\`\`
Task(
  agent: "lu-repo-architect",
  prompt: "Run {AUDIT_MODE} repo audit. The automated checks returned: {SCRIPT_RESULTS}. Now perform the additional checks for this mode and produce a structured health report."
)
\`\`\`

### 4. Display Results

Present the health report from the agent. Format:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REPO HEALTH REPORT -- {mode} audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall: {PASS|WARN|FAIL} ({score}/100)

{structured findings table}

{issues list with severity}
\`\`\`

### 5. Auto-Fix Mode (--fix)

If \`--fix\` is passed and issues are auto-fixable (naming, empty dirs):
- Rename files to kebab-case
- Remove empty directories
- Report what was fixed

\`\`\`bash
luca-bridge clear-status 2>/dev/null || true
\`\`\`

## Notes

- This skill is invoked as \`/repo-audit\` or automatically at phase boundaries
- The lu-repo-architect agent performs the actual analysis
- Existing scripts (check-domain-boundaries, check-drift) handle the mechanical checks
</main>`,
      order: 1,
    },
  ],
};

export const repoAuditSkill = createSkill(repoAuditConfig);
