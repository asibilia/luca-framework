---
'@alecsibilia/luca-mastracode': patch
'@alecsibilia/luca-framework': patch
---

Sync TUI status bar model display with our dynamic mode model resolution.

The mastracode harness persists per-mode model IDs in thread settings and a model pack system. Our custom pipeline modes (luca:discuss, luca:1-triage through luca:6-finalize) are not part of any model pack, so the TUI status bar would show stale model IDs after upgrades — even though API calls were correctly using the dynamic model resolver and sending the right model.

Now we call `harness.switchModel()` on every `mode_changed` event with the result of our resolver function, forcing the harness internal state (and status bar display) to stay in sync with what we send to the API.

Also adds diagnostic logging for `write_file` tool failures. When a write fails, the session ledger captures the input path, working directory, workspace base path, allowed paths, and full error details so we can identify the root cause of the intermittent "File not found" errors that have been reported in custom modes.
