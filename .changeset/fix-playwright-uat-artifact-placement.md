---
"@alecsibilia/luca": patch
---

Keep browser UAT artifacts out of the worktree.

With `playwright-cli` now classified read-only (runnable at any pipeline step), its screenshot output was landing in the repo root — debris that can't be `rm`'d during read-only steps and risks being swept into commits. Two-part fix:

- **Convention** (shared subagent prefix): all UAT evidence goes under `.playwright-cli/` (`playwright-cli screenshot --filename=.playwright-cli/<name>.png`), never the repo root.
- **Hygiene** (`luca init`): `.playwright-cli/` added to the managed `.gitignore` entries (idempotent top-up on re-init), so mid-pipeline UAT never dirties commits. The shadow scanner already sweeps the directory at milestone close, which remains the evidence lifecycle.
