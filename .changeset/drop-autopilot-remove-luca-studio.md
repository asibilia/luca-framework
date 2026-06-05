---
"@alecsibilia/luca": patch
---

Remove the resurrected `autopilot` skill; `lu` is the single pipeline entry point again.

The v13 restructure re-introduced a standalone 1,302-line `autopilot` skill, reverting the v5.1.0 (Phase 182) decision that had deleted it and folded its capability into the unified `lu` entry point. This drops `autopilot` again: the skill body, its three skills-registry references, the `lu` → `autopilot` routing indirection, and the stale `/autopilot` mention in `phase-discuss`. The shipped skill set goes from 42 to 41.

Also deletes the unused internal `luca-studio` package (and its `tsconfig` exclude entry, root `css:studio`/`dev:studio` scripts, and a comment reference in `luca-cli`). `luca-studio` was never part of the release set, so no published surface changes from its removal.
