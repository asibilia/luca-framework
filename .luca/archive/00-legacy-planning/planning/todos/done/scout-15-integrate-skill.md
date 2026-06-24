---
title: "Scout: Create scout-integrate sub-skill"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-3]
---

## Context

Sub-skill wrapper for the cross-cutting integration analysis step. Handles routing articles to deferred/ and manual-review/ based on the integrator's verdicts.

## Task

Create `src/skills/general/scout-integrate.skill.ts`:

1. **Arguments**: List of READY slugs, impact document paths
2. **Process**:
   - Spawn `lu-scout-integrator` agent with all impact document paths
   - Wait for completion
   - Read the integration analysis document for per-scout verdicts
   - For each scout:
     - `integrate` → advance state to INTEGRATION_ANALYZED
     - `defer` → create deferred document in `docs/scouting/deferred/`, advance state to DEFERRED
     - `conflict` → create manual-review document with conflict annotation, advance state to CONFLICTING
3. **Deferred document creation**: Populate from integration analysis reasoning + impact doc's Value If Implemented
4. **Conflict document creation**: Include both the new recommendation and the conflicting existing todo with full context

## Notes

- This skill handles the fan-out of verdicts — one integration analysis produces multiple state transitions
- Deferred and conflict documents must be self-contained (include enough context to understand without reading the full pipeline)
- The orchestrator only proceeds to todo generation for scouts with `integrate` verdict
