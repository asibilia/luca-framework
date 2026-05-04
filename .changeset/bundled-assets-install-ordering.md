---
"@alecsibilia/luca-mastracode": patch
"@alecsibilia/luca-framework": patch
---

Fix: Move `installSlashCommands()`, `installSkills()`, and `installRules()` to before `createMastraCode()` in launch.ts so harness workspace scanners see bundled assets on the very first `luca run` in a fresh cwd. Closes #212.
