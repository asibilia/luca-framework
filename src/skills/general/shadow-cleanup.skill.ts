/**
 * shadow-cleanup Skill - Detect and interactively clean up AI-session debris from the repository.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the shadow-cleanup skill configuration
const shadowCleanupConfig: SkillConfig = {
  frontmatter: {
    name: "shadow-cleanup",
    description: `Detect and interactively clean up AI-session debris: orphaned scripts, misplaced files, tool artifacts, dead exports, stale planning artifacts, and orphaned/misplaced markdown.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Shadow Cleanup

Scan the repository for AI-session debris and interactively review findings.

**Arguments:**

\`\`\`
/shadow-cleanup [--quick|--full] [--fix] [--dry-run] [--category=<1-6>]
\`\`\`

**Flags:**

| Flag | Description |
|------|-------------|
| (default) | Standard mode — Categories 1+2+3+5+6 |
| \`--quick\` | Quick mode — Categories 1+3 only |
| \`--full\` | Full mode — All 6 categories |
| \`--dry-run\` | Report only, no deletions or moves |
| \`--fix\` | Auto-apply all auto-fixable findings without interactive prompt |
| \`--category=N\` | Run only the specified category (1-6) |

## Vault Resolution

Read \`.planning/config.json\` and extract \`muninn.vault\` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (metric, session, brain:project) and DEFAULT_VAULT for
cross-cutting operations (shadow-debt:kept, pattern, preference).

## Execution Flow


### Step 1: Load and Validate Config

Read \`.planning/config.json\` and extract the \`shadow_debt\` section.
Validate with \`ShadowDebtConfigSchema\` defaults.

\`\`\`bash
CONFIG=$(cat .planning/config.json 2>/dev/null || echo '{}')
SHADOW_ENABLED=$(echo "$CONFIG" | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
\`\`\`

If \`SHADOW_ENABLED\` is false, display:
\`\`\`
Shadow cleanup is disabled in config (shadow_debt.enabled = false).
To enable, set shadow_debt.enabled = true in .planning/config.json.
\`\`\`
and exit.

### Step 2: Determine Scan Mode

Apply flags in priority order:

\`\`\`
--quick      → mode = "quick"    (Categories 1+3)
--full       → mode = "full"     (Categories 1+2+3+4+5+6)
--category=N → mode = "quick"    (single category, override scanner categories)
(default)    → mode = "standard" (Categories 1+2+3+5+6)
\`\`\`

### Step 3: Spawn lu-shadow-scanner

Spawn the scanner agent via Task with the determined mode and config context:

\`\`\`
Task(
  prompt: """
<shadow_scan_context>
**Scan mode:** {scan_mode}
**Complexity:** {COMPLEXITY from bridge or STATE.md}
**Config:** {shadow_debt config JSON}
**Category filter:** {N or "all"}
</shadow_scan_context>

Scan the repository for AI-session debris. Use the provided scan mode and config.
Return a valid ShadowScanReport JSON block as your final output.
""",
  subagent_type: "lu-shadow-scanner",
  description: "Shadow scan ({scan_mode} mode)"
)
\`\`\`

### Step 4: Parse ShadowScanReport

Extract the JSON block from the scanner agent's response. Parse and validate against \`ShadowScanReportSchema\`.

If parsing fails, display an error and exit with a suggestion to run again.

### Step 5: Display Findings Banner

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SHADOW DEBT SCAN RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: {scan_mode} | Categories: {list} | Found: {total}

CRITICAL ({n}) | HIGH ({n}) | MEDIUM ({n}) | LOW ({n})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{For each finding, display:}
[{severity}] {category} — {file_path}
  {description}
  Recommendation: {recommendation}
  Auto-fixable: {yes|no}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

### Step 6: Dry-Run or No-Findings Exit

If \`--dry-run\` flag is present OR \`total\` findings = 0:
- Display the banner
- Print: "No changes made (dry-run mode)." or "No findings — repository is clean."
- Store scan metric (Step 9)
- Exit

### Step 7: Auto-Fix Mode (\`--fix\` flag)

If \`--fix\` flag is present:
1. Collect all findings where \`auto_fixable: true\`.
2. Apply each fix based on \`recommended_action\`:

   **For \`"delete"\` actions:**
   - \`rm {file_path}\` (or \`rm -rf {file_path}\` for directories)

   **For \`"move"\` actions:**
   - Ensure target directory exists: \`mkdir -p $(dirname {target_path})\`
   - Move the file: \`git mv {file_path} {target_path}\` (use plain \`mv\` if untracked)
   - Grep for references to the old path: \`grep -r "{old_basename}" .planning/ --include="*.md" -l\`
   - If references found, log warning: "Found {n} files referencing old path — review manually: {list}"

   **For \`"gitignore"\` actions:**
   - Append pattern to \`.gitignore\`

   **Backward compatibility:** If a finding has no \`recommended_action\` field, fall back to \`"delete"\`.

3. Report actions taken:
   \`\`\`
   Auto-fixed {n} findings:
   - Deleted: {file_path}
   - Moved: {file_path} -> {target_path}
   - Added to .gitignore: {pattern}
   ⚠ {n} files may have references to moved paths — review manually
   \`\`\`
4. Findings where \`auto_fixable: false\` are reported but not acted on.
5. Proceed to Step 9 (store metric).

### Step 8: Interactive Mode (default)

Present findings in severity order (CRITICAL first, then HIGH, MEDIUM, LOW).

For each finding, display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[{severity}] {category}
File: {file_path}
Issue: {description}
Action: {recommended_action}{target_path ? " -> " + target_path : ""}: {recommendation}
Auto-fixable: {yes|no}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[F] Fix  [K] Keep (add to allowlist)  [S] Skip  [A] Fix all remaining
\`\`\`

Handle user response:

**F — Fix:**
- Apply the fix using the same action-type-aware logic from Step 7:
  - \`"delete"\`: remove file/directory
  - \`"move"\`: \`mkdir -p\` + \`git mv\` + grep for reference warnings
  - \`"gitignore"\`: append to \`.gitignore\`
- Log action and continue to next finding.

**K — Keep:**
- Store the file path in MuninnDB so it is never flagged again:
  \`\`\`
  mcp__muninn__muninn_remember(
    vault: DEFAULT_VAULT,
    concept: "shadow-debt:kept:{file_path}",
    content: "User approved keeping {file_path}. Not a shadow debt item. Recorded: {timestamp}"
  )
  \`\`\`
- Log: "Added {file_path} to shadow-debt kept-list."
- Continue to next finding.

**S — Skip:**
- No action, no MuninnDB entry.
- Continue to next finding.

**A — Fix all remaining:**
- Apply fixes for all remaining findings where \`auto_fixable: true\`.
- For findings where \`auto_fixable: false\`, report them as skipped.
- Display a summary of actions taken.
- Exit interactive loop and proceed to Step 9.

### Step 9: Store Scan Metric

Store scan result as a metric in MuninnDB:

\`\`\`
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "metric:shadow-debt-scan-{timestamp}",
  content: JSON.stringify({
    scan_mode: "{scan_mode}",
    total_found: {total},
    critical: {critical},
    high: {high},
    medium: {medium},
    low: {low},
    fixed: {n_fixed},
    kept: {n_kept},
    skipped: {n_skipped},
    scanned_at: "{ISO timestamp}"
  })
)
\`\`\`

Display completion:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SHADOW CLEANUP COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found: {total} | Fixed: {n_fixed} | Kept: {n_kept} | Skipped: {n_skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`


## Success Criteria

- [ ] Config loaded and validated (shadow_debt section or defaults)
- [ ] Scanner spawned with correct mode and config
- [ ] Valid ShadowScanReport returned and parsed
- [ ] Findings displayed in severity order
- [ ] User actions processed (Fix/Keep/Skip) or auto-fix applied
- [ ] MuninnDB kept entries stored for [K] responses
- [ ] Scan metric stored in MuninnDB
</main>`,
      order: 1,
    },
  ],
};

export const shadowCleanupSkill = createSkill(shadowCleanupConfig);
