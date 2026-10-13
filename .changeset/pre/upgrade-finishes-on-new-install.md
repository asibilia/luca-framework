---
"@luca/engine": patch
---

`luca upgrade` now finishes on the version it just installed: after `bun add -g`, the new install reloads the board, copies Luca's skills, and runs the checks with its own code, so a skill that's new in the release (like `/luca-retro` was) gets installed. The skill list now comes from the install's `skills/` folder, not a list in the code. An older version without this (such as `luca upgrade --to` an earlier one) still finishes, the old way (#529).
