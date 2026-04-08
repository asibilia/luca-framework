---
name: repo-cleanup
description: Scan and clean up AI-session debris
---
Scan the repository for AI-session debris and optionally clean it up.

## Parse Arguments

Parse `$ARGUMENTS` for flags:
- `--quick` — quick scan (Categories 1+3 only)
- `--full` — full scan (all 7 categories including dead exports)
- `--dry-run` — show findings without offering fixes
- `--fix` — auto-apply all auto-fixable findings without prompting
- `--category=N` — restrict to a specific category (1-7)

If no flags, default to standard mode with interactive review.

## Steps

1. **Prepare scan**: Call `repoCleanup(action: "scan", scan_mode: <mode from flags or omit for auto>)`.
   If the tool returns `status: "disabled"`, inform the user and stop.

2. **Spawn scanner**: Spawn the **shadow-scanner** subagent with a task prompt that includes:
   - The scan mode and categories from step 1
   - Any `--category=N` filter from the arguments
   - The config summary from step 1

3. **Parse results**: Call `repoCleanup(action: "parse-report", raw_output: <full subagent response text>)`.
   Display the findings banner to the user.

4. **Handle results**:

   - **No findings** → Report clean scan and stop.
   - **`--dry-run`** → Display all findings grouped by severity and stop.
   - **`--fix`** → For each finding where `auto_fixable: true`, call `repoCleanup(action: "apply-fix", file_path: ..., recommended_action: ..., target_path: ...)`. Report results.
   - **Interactive mode** (default) → Present each finding sorted by severity (critical first), and for each one offer three choices:

     - **Fix**: Call `repoCleanup(action: "apply-fix", file_path: ..., recommended_action: ..., target_path: ...)`.
     - **Keep**: Call `mcp__muninn__muninn_remember(vault: <repo_vault>, concept: "shadow-debt:kept:<file_path>", content: "User approved keeping <file_path>. Recorded: <ISO timestamp>")`. This prevents the file from being re-flagged in future scans.
     - **Skip**: No action — the file will be flagged again next scan.

5. **Store metrics**: After processing all findings, store a scan summary in MuninnDB:
   ```
   mcp__muninn__muninn_remember(
     vault: <repo_vault>,
     concept: "metric:shadow-debt-scan-<ISO timestamp>",
     content: JSON.stringify({
       scan_mode: "...",
       total: N, critical: N, high: N, medium: N, low: N,
       fixed: N, kept: N, skipped: N,
       scanned_at: "..."
     })
   )
   ```

Determine the repo vault name from `.planning/config.json` → `muninn.vault` field, or fall back to `"default"`.

$ARGUMENTS
