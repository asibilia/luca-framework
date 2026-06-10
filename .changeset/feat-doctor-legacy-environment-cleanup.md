---
"@alecsibilia/luca": minor
---

Mirror the legacy-environment cleanup in `luca doctor` so consumers can remediate too.

Three new doctor checks (all with `--fix` remediation) cover the debris classes found in the 2026-06-09 legacy audit:

- **Legacy global Claude artifacts** (global): detects orphaned pre-v13 files in `~/.claude/` by curated name list — the 9 v12 `luca-*.md` agents and 4 retired rules (`state-machine-bridge`, `complexity-gating`, `gate-enforcement`, `harness-verification`) whose stale instructions leak into every session (the source of invented commands like `luca suspend`). `--fix` moves them to `~/.claude/.luca-legacy-backup/` (reversible), never touching user-authored files.
- **Shared-tmp luca payloads** (global): detects stray pre-v13 `/tmp/luca-*.json` handoff payloads (the cross-repo collision class now blocked by the stage-gate). `--fix` deletes them. Found 49 on the reference machine.
- **Luca gitignore coverage** (project): warns when a luca-managed repo's `.gitignore` is missing managed entries (e.g. the newly added `.playwright-cli/`). `--fix` runs the same idempotent top-up as `luca init`.

Also exports `ensureLucaGitignore` / `LUCA_GITIGNORE_ENTRIES` from the init barrel for reuse.
