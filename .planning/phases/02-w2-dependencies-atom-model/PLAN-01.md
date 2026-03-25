---
phase: 2
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 2 Plan 1: Install Studio W2 Dependencies

## Objective

Install all new packages required by the Studio rework into `packages/luca-studio`. These packages enable the prompt editor (CodeMirror 6), syntax highlighting (Shiki), undo/redo (jotai-history), file watching (chokidar), and resizable panels (react-resizable-panels). This must complete before the atom model work in Plan 2 can begin.

## Context

@packages/luca-studio/package.json
@docs/brainstorm/observer-studio-rework/0.overview.md (Research-Informed Revisions table)
@docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md (R12)

## Tasks

### 1. Install all required packages

**Type:** auto
**TDD:** false
**Depends on:** none

Run `bun add` in `packages/luca-studio` to install:

- `@codemirror/view` -- core CodeMirror editor view
- `@codemirror/lang-markdown` -- Markdown language support
- `@codemirror/theme-one-dark` -- dark theme for prompt editor
- `shiki` -- read-only syntax highlighting for Source/Compiled tabs
- `jotai-history` -- undo/redo for draft atoms (official jotaijs org)
- `chokidar` -- file watching for SSE (v4+, ESM-only)
- `react-resizable-panels` -- ResizableSplit component

Note on elkjs/dagre: The existing codebase uses a custom `applyGroupedColumnLayout` in `components/workflow-editor/auto-layout.ts` for React Flow layout. Neither elkjs nor dagre is needed at this time.

**Files to create/edit:**

- `packages/luca-studio/package.json` (dependencies added by bun)
- `bun.lock` (updated by bun install)

**Verification:**

- `bun install` succeeds with exit code 0
- Each package resolves in the import graph

### 2. Verify imports resolve

**Type:** auto
**TDD:** false
**Depends on:** 1

Verify each newly installed package is importable by running a quick resolution check for each:

```bash
cd packages/luca-studio && bun -e "import '@codemirror/view'"
cd packages/luca-studio && bun -e "import '@codemirror/lang-markdown'"
cd packages/luca-studio && bun -e "import '@codemirror/theme-one-dark'"
cd packages/luca-studio && bun -e "import 'shiki'"
cd packages/luca-studio && bun -e "import 'jotai-history'"
cd packages/luca-studio && bun -e "import 'chokidar'"
cd packages/luca-studio && bun -e "import 'react-resizable-panels'"
```

**Files to create/edit:**

- None (verification only)

**Verification:**

- All seven import checks exit with code 0
- No unresolved peer dependency warnings

## Verification

1. `bun install` in repo root succeeds
2. All seven packages are importable from `packages/luca-studio`
3. `bunx --bun tsc --noEmit` still passes (no type conflicts introduced)

## Success Criteria

- All seven packages appear in `packages/luca-studio/package.json` dependencies
- The lockfile (`bun.lock`) reflects the new packages
- No existing functionality is broken (typecheck passes)

## Output Specification

- Updated `packages/luca-studio/package.json` with new dependencies
- Updated `bun.lock`
