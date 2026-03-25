/**
 * Canonical .planning/ directory structure and file placement rules.
 *
 * Defines the expected layout of the .planning/ directory so that agents,
 * skills, and the shadow scanner have a single spec to follow and validate
 * against. Files or directories that don't match this structure are
 * candidates for cleanup (move or delete).
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const planningStructureConfig: RuleConfig = {
  frontmatter: {
    description:
      "Canonical .planning/ directory structure and file placement rules",
    globs: [".planning/**/*"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# .planning/ Directory Structure

## Root-Level Files (Canonical Allowlist)

Only these files belong directly in \`.planning/\` root:

| File | Purpose |
|------|---------|
| \`config.json\` | Luca framework configuration |
| \`state.json\` | Workflow state machine (source of truth) |
| \`STATE.md\` | Human-readable state snapshot |
| \`session-ledger.jsonl\` | Append-only session event log |
| \`ROADMAP.md\` | Active milestone roadmap |
| \`PROJECT.md\` | Project identity and history |
| \`CANONICAL-DECISIONS.md\` | Architecture decision log |
| \`MILESTONE-AUDIT.md\` | Current milestone audit |
| \`BRAIN.md\` / \`brain.json\` | Project brain tree |
| \`MEMORY.md\` / \`memory.json\` | Session memory |
| \`WORKING.md\` / \`working.json\` | Ephemeral working memory |
| \`.context-metrics.json\` | Ephemeral context metrics |
| \`harness-result.json\` | Ephemeral harness output |

**Versioned files** matching \`v*-MILESTONE-AUDIT*.md\` are tolerated at root for historical reasons but should migrate to \`milestones/\` over time.

Any other file at \`.planning/\` root is a violation. Remediation:
- **Empty or temp files** (\`temp_*\`, \`tmp_*\`, \`scratch_*\`, 0-2 byte files): delete
- **SUMMARY files** (\`SUMMARY-*.md\`, \`*-SUMMARY.md\`): move to the relevant phase directory or \`summaries/\`
- **Research/analysis files**: move to \`research/\` or \`notes/\`
- **Proposal/draft files**: move to \`notes/\`

## Root-Level Directories (Canonical Allowlist)

| Directory | Purpose |
|-----------|---------|
| \`phases/\` | Phase execution directories |
| \`milestones/\` | Versioned milestone snapshots (\`v{SEMVER}-{type}.md\` files) |
| \`todos/\` | Work items: \`pending/\`, \`done/\`, \`completed/\`, \`archived/\` |
| \`summaries/\` | Phase summary archive |
| \`research/\` | Research artifacts |
| \`notes/\` | Freeform notes and proposals |
| \`codebase/\` | Codebase maps and snapshots |
| \`checkpoints/\` | Suspend/resume checkpoints |
| \`harness-runs/\` | Historical harness outputs |
| \`migration/\` | Schema migration scripts |
| \`done/\` | Completed items archive |
| \`plans/\` | Plan artifacts |

Any other directory at \`.planning/\` root is a violation. Common case: bare numbered directories (e.g., \`108/\`) that should be under \`phases/\`.

## Phase Directory Structure

### Naming Convention

Phase directories live under \`phases/\` with the pattern:

\`\`\`
phases/{N}-{kebab-case-description}/
\`\`\`

Examples: \`01-bootstrap-quick-wins/\`, \`99-observer-foundation-mvp/\`, \`161-shadow-tech-debt-cleanup/\`

Bare numbered directories (e.g., \`phases/108/\`) are violations — they must have a kebab-case description suffix.

### Internal File Patterns

Each phase directory may contain:

| Pattern | Purpose | Created By |
|---------|---------|-----------|
| \`{wave}-PLAN.md\` | Wave execution plan | lu-planner |
| \`{wave}-CONTEXT.md\` | User decisions from discussion | phase-discuss |
| \`{wave}-PREMORTEM.md\` | Risk analysis | lu-premortem |
| \`{wave}-SUMMARY.md\` | Execution summary | lu-executor |
| \`{wave}-VERIFICATION.md\` | Verification results | lu-verifier |
| \`PLAN.md\` | Single-wave plan (shorthand) | lu-planner |
| \`SUMMARY.md\` | Single-wave summary (shorthand) | lu-executor |
| \`.wave-progress.jsonl\` | Wave progress ledger | phase-execute |
| \`GRADUATION-REPORT.md\` | Graduated research findings | lu-research-graduator |
| \`REVIEW-LOG.md\` | Research review log | phase-research-review |
| \`research/\` | Numbered research artifacts | lu-phase-researcher |

Wave numbers are zero-padded two digits: \`01-\`, \`02-\`, \`03-\`, etc.

No other files should exist directly in a phase directory. Loose \`.md\` files that don't match these patterns are violations.

### No Loose Files in phases/ Root

The \`phases/\` directory itself should contain ONLY subdirectories. Files like \`SUMMARY-97-B.md\` or \`130-132-RESEARCH.md\` loose in \`phases/\` are violations — they belong inside their respective phase subdirectory.

## Milestones

Milestones are **files, not directories**, stored at \`milestones/\` root:

\`\`\`
milestones/v{SEMVER}-ROADMAP.md
milestones/v{SEMVER}-REQUIREMENTS.md
milestones/v{SEMVER}-MEMORY-SNAPSHOT.md
milestones/v{SEMVER}-AUDIT.md
milestones/v{SEMVER}-MILESTONE-AUDIT.md
\`\`\`

## Remediation Classification

When the shadow scanner detects a violation, it classifies the remediation:

| Type | When | Action |
|------|------|--------|
| **Delete** | Empty files, temp/scratch files, stale ephemeral output | Remove the file |
| **Move** | Real content in wrong location | Move to canonical path, warn about broken references |
| **Investigate** | Substantial content with no clear canonical home | Suggest \`notes/\` or \`research/\`, require user decision |

"Clean up" does NOT always mean delete. Most misplaced files contain real content that should be moved to the correct location.

## Phase Summary Placement

Phase summaries should ONLY exist in these locations:

1. Inside the phase directory: \`phases/{N}-{desc}/{wave}-SUMMARY.md\`
2. In the summaries archive: \`summaries/{identifier}-SUMMARY.md\`

Phase summaries found elsewhere (repo root, package directories, \`.planning/\` root, \`phases/\` root) are violations and should be moved to the appropriate location.`,
      order: 1,
    },
  ],
};

export const planningStructureRule = createRule(planningStructureConfig);
