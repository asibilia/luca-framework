---
title: "Remove committed coverage directory and .DS_Store from git"
area: repo-hygiene
priority: high
created: 2026-02-16
source: repo-audit
---

## Context

The `coverage/` directory (886 temp `.lcov.info.*.tmp` files) and `dist/.DS_Store` are tracked by git despite being in `.gitignore`. They were committed before being added to `.gitignore`.

## Task

1. Remove coverage directory from git tracking:

   ```bash
   git rm -r --cached coverage/
   ```

2. Remove .DS_Store from git tracking:

   ```bash
   git rm --cached dist/.DS_Store
   ```

3. Verify `.gitignore` already covers both (it does)
4. Commit the removal

## Notes

- No need for `git filter-branch` — just removing from tracking is sufficient
- The files will remain locally but won't be in future commits
