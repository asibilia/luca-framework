---
title: "Navigation restructure (11 flat items to 9 grouped in OBSERVE/BUILD/CONFIGURE)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w4-layout-components]
phase: studio-w4
estimated_size: M
priority: P1
---

## Context

Observer's current navigation is a flat 11-item sidebar with significant overlap (8 pages show MuninnDB data from different angles). The brainstorm decided on a 3-group, 9-item structure that provides coherent information architecture: OBSERVE (Home, Sessions, Memory), BUILD (Pipeline, Agents, Skills, Rules), CONFIGURE (Config, Settings).

## Task

Restructure navigation from 11 flat items to 9 grouped items:

```
OBSERVE: Home, Sessions, Memory
BUILD: Pipeline, Agents, Skills, Rules
CONFIGURE: Config, Settings
```

Specific changes:

- **Remove:** Contradictions (never populated), Entities (replaced by Agents/Skills/Rules)
- **Merge:** Learning + Vault + Knowledge Graph + Semantic Search -> tabs within Memory
- **Rename:** Dashboard -> Home, Workflow Editor -> Pipeline
- **Group headers:** Non-clickable uppercase labels (OBSERVE, BUILD, CONFIGURE)
- **Active page:** Left border accent + background highlight
- **Badges:** Red dot on Eval when last run failed, count badge on Sessions when active

BUILD pages prioritized for v1 because they read from the filesystem and work on fresh installs without MuninnDB.

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Navigation Structure section) and `docs/brainstorm/observer-studio-rework/8.research-ux-product.md` (R8) for the research-informed navigation design.

## Key Files

- Modified: `packages/luca-studio/components/layout/nav-rail.tsx` (or equivalent sidebar component)
- Modified: `packages/luca-studio/app/` directory (page routes may need renaming)
- New/Modified: Navigation configuration/constants file

## Verification

- Navigation renders 3 groups with correct items under each
- Contradictions and Entities pages are removed from navigation
- Dashboard route redirects to Home
- Workflow Editor route redirects to Pipeline
- Active page indicator works correctly
- BUILD group pages load without MuninnDB
