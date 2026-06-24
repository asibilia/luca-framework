---
title: "Bundled skills not visible until second `luca run` in a fresh cwd"
priority: high
area: harness
source: gh-issue-#212
---

> GitHub Issue: #212 — https://github.com/asibilia/luca-framework/issues/212

Race condition in `launch.ts`: `installSkills()` (and `installSlashCommands()`, `installRules()`) runs **after** `createMastraCode()`, but the harness scans `skillPaths` during construction. In a fresh cwd without `.mastracode/skills/`, the 6 bundled skills are invisible on first run.

**Fix:** Move the three `install*()` calls before `createMastraCode()` so the workspace skill scanner sees them on first launch.

Closes #212
