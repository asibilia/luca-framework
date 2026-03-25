---
title: "Consolidate Memory page (absorb Learning, Vault, KnowledgeGraph, SemanticSearch, Entities)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w4-navigation-restructure]
phase: studio-w7
estimated_size: L
priority: P2
---

## Context

Observer currently has 8 pages showing MuninnDB data from different angles (Memory, Learning, Vault, Knowledge Graph, Semantic Search, Decisions, Contradictions, Entities). This is a navigation tax for a single data source. The brainstorm decided to consolidate these into a single Memory page with tabs.

## Task

Consolidate five existing pages into the Memory page as tabs:

- **Browse tab:** General MuninnDB memory browser (existing Memory page functionality)
- **Graph tab:** Force-directed entity visualization (existing Knowledge Graph page)
- **Search tab:** On-demand semantic search (existing Semantic Search page)
- **Health tab:** Vault health metrics (existing Vault page)
- **Learning tab:** Pattern/decision/pitfall tracking (existing Learning page)

Decisions page content becomes accessible under Sessions (workflow-scoped decision log). Contradictions page is removed entirely (never populated). Entities page is removed (replaced by Agents/Skills/Rules pages).

This is primarily a refactoring task -- moving existing page components into tab views within a single page, not building new features.

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Page Consolidation section and "Why Memory Pages Must Merge" rationale).

## Key Files

- New: `packages/luca-studio/app/memory/page.tsx` (tabbed container)
- Modified: Existing memory-related components refactored into tab views
- Removed from navigation: Learning, Vault, Knowledge Graph, Semantic Search, Contradictions, Entities pages

## Verification

- Memory page renders with 5 tabs
- Each tab displays the content from its original standalone page
- Removed pages are no longer accessible via navigation
- Deep links to old page URLs redirect to appropriate Memory tab
- MuninnDB integration works correctly within tab context
