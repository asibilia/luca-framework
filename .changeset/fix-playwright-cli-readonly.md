---
"@alecsibilia/luca": patch
---

Classify `playwright-cli` as read-only in the stage-gate bash classifier.

`playwright-cli` (the browser UAT driver) was missing from `READONLY_COMMANDS`, so it fell through to the unknown-command → `bash-mutate` default and was blocked during PLANNING/REVIEWING — exactly the pipeline steps where visual verification belongs. It observes a running app and never mutates repo files (screenshot output is UAT evidence, same tier as stdout), so it now classifies as `bash-readonly`. Shell redirects on a `playwright-cli` invocation still escalate to mutate, and the always-denied path rules are unaffected.
