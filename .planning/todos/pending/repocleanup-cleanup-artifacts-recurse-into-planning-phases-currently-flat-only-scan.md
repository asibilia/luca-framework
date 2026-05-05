---
title: "repoCleanup cleanup-artifacts: recurse into .planning/phases/* (currently flat-only scan)"
area: pipeline
created: 2026-05-05
priority: medium
source: research
---

## Task

repoCleanup cleanup-artifacts: recurse into .planning/phases/* (currently flat-only scan)

## Context

`packages/luca-mastracode/src/tools/repo-cleanup.ts:165-166` scans only the **flat** `.planning/` directory for capture-file pattern `/-capture-/.test(file)`. After issue #220 lands and capture files live under `.planning/phases/<slug>/`, the cleanup will silently miss them.

Should be folded into the #220 PR; tracked here so it isn't lost.

## MuninnDB Recall

Search MuninnDB for 'research:luca-planning-paths-no-helper repoCleanup'.
