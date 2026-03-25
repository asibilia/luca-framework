---
title: "Editor components (CodeMirrorWrapper, ModelRoutingGrid, EntityTree)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-new-dependencies]
phase: studio-w5
estimated_size: L
priority: P1
---

## Context

The Studio needs several specialized editor components for the agent editor, pipeline configuration, and entity browsing. These are shared across multiple pages and must be built before the core page work (Pipeline, Agents).

## Task

Build six editor components (P1 items first, P2 items second):

**P1 (required for core pages):**

- **CodeMirrorWrapper:** Configured CodeMirror 6 editor with custom Luca theme matching app CSS variables, markdown language mode, word wrap, JetBrains Mono font. Toolbar: Format (bold/italic/code), Insert Template Variable, character/token count.
- **ModelRoutingGrid:** Compact editable 5-column grid (TRIVIAL through CRITICAL) used in both workflow steps and agent editors. Cell dropdowns color-coded by model tier (fast/balanced/capable). Shows preset name if matching a known preset.
- **EntityTree:** Tree view for browsing agents/skills/rules. Grouped by directory (default), with search/filter at top. Right-click context menu (New, Duplicate, Delete). Dirty indicator dots on unsaved entries.

**P2 (secondary):**

- **ConfigSection:** Collapsible form section for detail panels
- **DiffPreview:** Side-by-side diff for change preview (ETag conflict resolution)
- **FieldEditor:** Generic key-value editor

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Agent Editor UI and Editor Components sections) for detailed specs. Shiki is used for read-only syntax highlighting in Source/Compiled tabs.

## Key Files

- New: `packages/luca-studio/components/editor/code-mirror-wrapper.tsx`
- New: `packages/luca-studio/components/editor/model-routing-grid.tsx`
- New: `packages/luca-studio/components/editor/entity-tree.tsx`
- New: `packages/luca-studio/components/editor/config-section.tsx`
- New: `packages/luca-studio/components/editor/diff-preview.tsx`
- New: `packages/luca-studio/components/editor/field-editor.tsx`

## Verification

- CodeMirrorWrapper renders with markdown syntax highlighting and custom theme
- ModelRoutingGrid renders 5 columns with editable tier dropdowns
- EntityTree groups entities by directory and supports search/filter
- Dirty indicator dots appear on unsaved entities in the tree
- Components integrate with Jotai draft atoms for state management
