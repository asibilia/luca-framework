---
title: "Skills + Rules browser pages (reuses Agent patterns)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w6-agents-page, studio-w3-entity-crud-routes]
phase: studio-w7
estimated_size: M
priority: P2
---

## Context

The Skills and Rules pages follow the same browse + configure pattern established by the Agents page. Skills show skill configuration with arguments and trigger conditions. Rules show rule descriptions, glob patterns, and on/off toggles. Both reuse EntityTree, CodeMirrorWrapper, and the detail panel pattern.

## Task

Build two browser pages reusing the Agents page patterns:

**Skills page:**

- EntityTree showing all 58 skills grouped by directory (general/, luca/)
- Configure tab with skill-specific fields (arguments, trigger type)
- Source/Compiled tabs with Shiki syntax highlighting
- Enable/disable toggles

**Rules page:**

- EntityTree showing all 24 rules grouped by directory (general/, profiles/)
- Configure tab with rule-specific fields (description, glob patterns, alwaysApply)
- Source tab with Shiki syntax highlighting
- Toggle rules on/off
- Rule profiles: named collections of enabled/disabled rules

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Agent/Skill/Rule Management features) for specs.

## Key Files

- New: `packages/luca-studio/app/skills/page.tsx`
- New: `packages/luca-studio/app/skills/[name]/page.tsx`
- New: `packages/luca-studio/app/rules/page.tsx`
- New: `packages/luca-studio/app/rules/[name]/page.tsx`
- Reuses: EntityTree, CodeMirrorWrapper, SaveBar, DirtyIndicator patterns from Agents page

## Verification

- Skills page lists all skills from `/api/entities/skills`
- Rules page lists all rules from `/api/entities/rules`
- Both pages support browse, configure, and source viewing
- Toggle on/off persists via PUT API
- Entity tree search/filter works correctly
