---
title: "Agents page — browse + configure (read-only prompts in v1)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on:
  [
    studio-w3-entity-crud-routes,
    studio-w4-layout-components,
    studio-w4-navigation-restructure,
    studio-w5-editor-components,
    studio-w5-feedback-components,
  ]
phase: studio-w6
estimated_size: L
priority: P1
---

## Context

The Agents page lets users browse all 47 agents, view their configuration, and customize model routing and enable/disable toggles. In v1, prompt editing is read-only (Tier 1 scope). The page establishes patterns reused by Skills and Rules pages in Wave 7.

## Task

Build the Agents page with three-column layout:

- **Column 1 (280px, collapsible):** EntityTree component showing all agents grouped by directory (general/, luca/). Search/filter at top. Dirty indicator dots on unsaved entries.
- **Column 2 (flexible):** Tab bar with: Configure (structured form), Prompt (read-only in v1, CodeMirror with disabled editing), Source (read-only TypeScript via Shiki), Compiled (read-only compiled markdown via Shiki).
- **Column 3 (400px, togglable):** Live compiled preview. Updates on configuration changes.

Configure tab shows: name, description, model_routing (ModelRoutingGrid), enabled toggle, model_tier, and other agent config fields as structured form inputs.

Card grid view as alternative to tree view for browsing by category.

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Agent Editor UI section) and `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Agent Management feature) for specs.

## Key Files

- New: `packages/luca-studio/app/agents/page.tsx`
- New: `packages/luca-studio/app/agents/[name]/page.tsx`
- New: `packages/luca-studio/components/agents/agent-config-form.tsx`
- New: `packages/luca-studio/components/agents/agent-preview.tsx`
- Uses: EntityTree, CodeMirrorWrapper, ModelRoutingGrid, SaveBar, DirtyIndicator

## Verification

- Agent list loads from `/api/entities/agents` endpoint
- Clicking an agent shows its full configuration
- Configure tab renders all agent config fields as editable form
- Prompt/Source/Compiled tabs render content with syntax highlighting
- Model routing grid edits persist via PUT API
- Enable/disable toggle updates agent config
- Dirty indicator and SaveBar work correctly
