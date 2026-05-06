---
title: "Refactor manageRoadmap to stop bypassing writePlanningFile (use shared path helper)"
area: pipeline
created: 2026-05-05
priority: low
source: research
---

## Task

Refactor manageRoadmap to stop bypassing writePlanningFile (use shared path helper)

## Context

`packages/luca-mastracode/src/tools/manage-roadmap.ts:94-97` writes `.planning/ROADMAP.md` via direct `node:fs` calls, bypassing the centralized `writePlanningFile` containment & resolution layer. Even though ROADMAP.md stays at root, the bypass is architectural debt and the only direct-fs writer in the tool layer that won't automatically benefit from a new shared `phase-paths.ts` helper.

If addressed alongside the main #220 refactor it's free; if deferred, document as known debt.

## MuninnDB Recall

Search MuninnDB for 'research:luca-manageRoadmap-fs-bypass'.
