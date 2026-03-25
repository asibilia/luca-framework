---
title: "Install new dependencies (CodeMirror 6, Shiki, jotai-history, chokidar, react-resizable-panels)"
area: infrastructure
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w1-package-rename]
phase: studio-w2
estimated_size: XS
priority: P1
---

## Context

The Studio rework introduces several new UI and infrastructure capabilities that require packages not currently in luca-observer. These must be installed before dependent features can be built.

## Task

Install the following packages into `packages/luca-studio`:

- `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/theme-one-dark` (~300KB) -- prompt editor
- `shiki` (~200KB) -- read-only syntax highlighting for Source/Compiled tabs
- `jotai-history` (official jotaijs org, 0.x) -- undo/redo for draft atoms
- `chokidar` v5 (ESM-only, FSEvents backend on macOS) -- file watching for SSE
- `react-resizable-panels` -- ResizableSplit component
- Verify `elkjs` or `dagre` for React Flow auto-layout (may already be present)

See `docs/brainstorm/observer-studio-rework/0.overview.md` (Research-Informed Revisions table) and `docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md` (R12) for rationale.

## Key Files

- `packages/luca-studio/package.json`
- `bun.lock`

## Verification

- `bun install` succeeds
- Each package is importable: `bun -e "import '@codemirror/view'"` etc.
- Bundle size delta is within expected range (~500KB for CodeMirror + Shiki)
