# Phase 146: Foundation & React Flow Setup — Context

## Decisions

### 1. React Flow Version & React 19 Compatibility [researched]

**Decision:** Use `@xyflow/react` v12 (latest). React Flow v12 supports React 17+ and is confirmed compatible with React 19. Pin to exact version after install to avoid regressions.

**Implementation:** Dynamic import with `ssr: false` (same pattern as `react-force-graph-2d` in `components/knowledge-graph/graph-canvas.tsx:29`). React Flow uses DOM measurement APIs that require browser environment.

### 2. Page Route Path [resolved-from-patterns]

**Decision:** `/workflow-editor` — distinguishes from generic "workflow" concept, explicitly names the feature. Follows kebab-case convention.

**Implementation:** `app/workflow-editor/page.tsx` with standard PageContainer pattern.

### 3. Sidebar Placement & Icon [resolved-from-patterns]

**Decision:** Place after "Knowledge Graph" in NAV_ITEMS (both are graph visualizations). Use Lucide `Workflow` icon.

**Implementation:** Add to `lib/constants.ts` NAV_ITEMS array at index 6 (after Knowledge Graph, before Semantic Search).

### 4. Component Directory Structure [resolved-from-patterns]

**Decision:** `components/workflow-editor/` following existing per-page component directories (knowledge-graph/, memory/, sessions/, etc.).

### 5. Hardcoded Test Nodes [auto-resolved]

**Decision:** Render 3-4 nodes representing core workflow steps (Router, Planner, Executor, Verifier) with basic edges. Proves React Flow integration works. Data model comes in Phase 147.

## Constraints

- No test files (per `.claude/rules/no-tests.md`)
- Never run `bun run build:all` during session
- Verification: `bunx --bun tsc --noEmit` only
- Follow existing Observer patterns exactly (PageContainer, ErrorBoundary, LoadingSkeleton)
