/**
 * repo-cleanup skill — Scan the repository for AI-session debris and optionally clean it up.
 *
 * Ported from fd0b169be^:packages/luca-framework/skills/commands/repo-cleanup.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# /repo-cleanup

Scan the repository for AI-session debris — orphaned scripts, misplaced source files, tool artifacts, dead exports, \`.luca/\` contract violations, repo-root markdown debris — and optionally apply the remediations.

The scan is performed by the **\`luca-shadow-scanner\`** subagent (strictly read-only). This command drives that scan and applies fixes through the **\`luca repo cleanup-apply\`** CLI (the destructive write half).

## Parse arguments

Parse \`$ARGUMENTS\` for flags:

- \`--quick\` — quick scan (categories 1 + 3 only)
- \`--full\` — full scan (all 7 categories, including dead exports)
- \`--dry-run\` — show findings without applying anything
- \`--fix\` — auto-apply every \`auto_fixable\` finding without prompting
- \`--category=N\` — restrict to a single detection category (1–7)

If no scan-mode flag is given, default to **\`standard\`** mode with interactive review.

Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`.

## Step 1 — Scan

Spawn the **\`luca-shadow-scanner\`** subagent via the \`Agent\` tool. The task prompt must include:

- The scan mode (\`quick\` | \`standard\` | \`full\`) resolved from the flags.
- Any \`--category=N\` filter — tell the scanner to report only that category.

The subagent ends its response with a single JSON block conforming to \`ShadowScanReportSchema\` (\`scan_mode\`, \`categories_scanned\`, \`findings[]\`, \`summary\`, \`scanned_at\`).

## Step 2 — Parse the report

Take the **last JSON block** of the subagent's response as the \`ShadowScanReport\`. Each entry in \`findings[]\` has: \`category\`, \`severity\`, \`file_path\`, \`description\`, \`recommendation\`, \`recommended_action\` (\`delete\` | \`move\` | \`gitignore\`), \`target_path?\`, \`auto_fixable\`.

Display the findings banner: total count plus the per-severity breakdown from \`summary\`.

## Step 3 — Handle the findings

- **No findings** (\`summary.total === 0\`) → report a clean scan and stop.

- **\`--dry-run\`** → display all findings grouped by severity (critical first) and stop. Apply nothing.

- **\`--fix\`** → for every finding where \`auto_fixable === true\`, stage that single finding object in a JSON file and run:

  \`\`\`
  # /tmp/luca-cleanup-finding.json holds the single finding object
  luca repo cleanup-apply --file /tmp/luca-cleanup-finding.json --confirm
  \`\`\`

  Findings with \`auto_fixable === false\` (e.g. repo-root markdown, SUMMARY moves) are listed for the user but not auto-applied.

- **Interactive mode** (default) → present each finding sorted by severity (critical first). For each one, offer three choices:

  - **Fix** → stage the single finding object in a JSON file and run \`luca repo cleanup-apply --file <path> --confirm\`. For a \`move\`, the finding must carry \`target_path\`; if it does not, ask the user where it should go and add \`target_path\` to the file before running.
  - **Keep** → record the user's decision so the file is not re-flagged next scan:

    First call \`mcp__muninn__muninn_remember\` with \`vault: "<repo_vault>"\`, \`concept: "shadow-debt:kept:<file_path>"\`, and content noting the user approved keeping \`<file_path>\` with an ISO timestamp. Then promote it: \`mcp__muninn__muninn_trust({ id: <returned id>, trust: "verified", vault: "<repo_vault>" })\` — this is a user-confirmed decision. The \`luca-shadow-scanner\` recalls \`shadow-debt:kept\` entries and excludes them from future scans.
  - **Skip** → take no action; the file will be flagged again on the next scan.

## Step 4 — Store the cleanup metric

After processing every finding, record what the cleanup did (\`metric:*\` routes to the repo vault per the vault-routing rule):

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "metric:shadow-debt-cleanup-<ISO timestamp>",
  content: JSON.stringify({
    scan_mode, total, fixed, kept, skipped, cleaned_at
  })
})
\`\`\`

The \`luca-shadow-scanner\` already stores the raw scan counts under \`metric:shadow-debt-scan-*\`; this metric captures the action outcome (\`fixed\` / \`kept\` / \`skipped\`).

$ARGUMENTS
`

export const repoCleanupSkill = defineSkill({
    name: "repo-cleanup",
    description: "Scan the repository for AI-session debris and optionally clean it up.",
    body: BODY,
})
