---
phase: 2
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 02 Plan 1: Strip SpacetimeDB from Observer

## Objective

Remove all SpacetimeDB infrastructure from `packages/luca-observer` so the app compiles cleanly without any SpacetimeDB dependency. This is a pure deletion/cleanup phase -- no new features are introduced. After completion, the observer retains its route structure, clean hooks (use-memory, use-todos, use-media-query), layout/shared components, and MuninnDB-native memory page, with all SpacetimeDB-dependent pages replaced by minimal placeholders.

## Context

Read these files before executing:

- @.planning/phases/02-strip-spacetimedb-observer/02-RESEARCH.md (complete file manifest and dependency graph)
- @.planning/phases/02-strip-spacetimedb-observer/02-CONTEXT.md (locked decisions)
- @packages/luca-observer/app/providers.tsx (modification target)
- @packages/luca-observer/components/layout/header.tsx (modification target)
- @packages/luca-observer/components/shared/status-indicator.tsx (modification target)
- @packages/luca-observer/next.config.ts (modification target)
- @packages/luca-observer/package.json (modification target)

## Tasks

### 1. Delete SpacetimeDB data layer (module_bindings + hooks + lib config)

**Type:** auto
**TDD:** false
**Depends on:** none

Delete the entire SpacetimeDB data layer bottom-up.

**Step 1 -- Delete module_bindings directory (43 files):**

```bash
rm -rf packages/luca-observer/module_bindings
```

This is the root of the SpacetimeDB dependency tree. All 43 auto-generated files (18 table files, 21 reducer files, index.ts, types.ts, types/ directory) are removed.

**Step 2 -- Delete 15 SpacetimeDB hooks:**

```bash
cd packages/luca-observer/hooks
rm use-agent-activity.ts use-context-health.ts use-cost-tracking.ts \
   use-decision-trail.ts use-event-stream.ts use-filtered-table.ts \
   use-harness-result.ts use-iteration-history.ts use-ledger.ts \
   use-metrics.ts use-planning.ts use-token-usage.ts \
   use-tool-calls.ts use-tribunal.ts use-workflow-state.ts
```

Keep these 3 hooks (they have no SpacetimeDB dependency):

- `use-memory.ts` -- fetches from /api/muninn/\*
- `use-todos.ts` -- fetches from /api/todos (filesystem)
- `use-media-query.ts` -- pure DOM API

**Step 3 -- Delete SpacetimeDB config:**

```bash
rm packages/luca-observer/lib/spacetimedb-config.ts
```

**Verification:**

- `ls packages/luca-observer/module_bindings` returns "No such file or directory"
- `ls packages/luca-observer/hooks/` shows only: use-media-query.ts, use-memory.ts, use-todos.ts
- `ls packages/luca-observer/lib/spacetimedb-config.ts` returns "No such file or directory"

### 2. Delete SpacetimeDB-dependent components (31 files across 11 directories)

**Type:** auto
**TDD:** false
**Depends on:** 1

Delete all component directories whose parent pages are being replaced with placeholders, plus the 3 dashboard components that take SpacetimeDB types as props.

**Step 1 -- Delete entire domain component directories (28 files in 8 directories):**

```bash
rm -rf packages/luca-observer/components/agents
rm -rf packages/luca-observer/components/cost
rm -rf packages/luca-observer/components/decisions
rm -rf packages/luca-observer/components/harness
rm -rf packages/luca-observer/components/iteration
rm -rf packages/luca-observer/components/planning
rm -rf packages/luca-observer/components/tribunal
rm -rf packages/luca-observer/components/workflow
```

These directories contain components consumed exclusively by their respective SpacetimeDB-dependent page routes. After page replacement (Task 4), they would be orphaned.

**Step 2 -- Delete 3 SpacetimeDB dashboard components:**

```bash
rm packages/luca-observer/components/dashboard/overview-cards.tsx
rm packages/luca-observer/components/dashboard/recent-events.tsx
rm packages/luca-observer/components/dashboard/recent-transitions.tsx
```

Keep `components/dashboard/todo-tracker.tsx` -- it uses the clean `useTodos` hook.

**Retained component directories (no changes):**

- `components/layout/` -- sidebar, header (header modified in Task 3), page-container, detail-layout, section-header
- `components/shared/` -- empty-state, error-boundary, event-badge, json-viewer, loading-skeleton, page-error, status-indicator (modified in Task 3)
- `components/memory/` -- brain-panel, context-usage-bar, memory-entries, working-sections
- `components/dashboard/` -- todo-tracker.tsx only

**Verification:**

- `ls packages/luca-observer/components/` shows only: dashboard, layout, memory, shared
- `ls packages/luca-observer/components/dashboard/` shows only: todo-tracker.tsx

### 3. Modify shared infrastructure files (providers, header, status-indicator, next.config, package.json)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Surgically edit 5 files to remove SpacetimeDB references. These are layout-level and config files that affect every page.

**3a. Rewrite app/providers.tsx**

Remove all SpacetimeDB imports (SpacetimeDBProvider, DbConnection, ErrorContext, SPACETIMEDB_URI, MODULE_NAME), the connectionBuilder useMemo block, and the SpacetimeDBProvider JSX wrapper. The resulting file should contain only:

```tsx
"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { Provider as JotaiProvider, useAtomValue } from "jotai";

import { themeAtom } from "~/stores/theme";

function ThemeSync() {
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider>
      <ThemeSync />
      {children}
    </JotaiProvider>
  );
}
```

**3b. Rewrite components/layout/header.tsx**

Remove `import { useSpacetimeDB } from "spacetimedb/react"`, the `useSpacetimeDB()` hook call, the connection status label/dot logic, and the StatusIndicator component import/usage. The resulting header should contain only sidebar toggle and theme toggle buttons. Use the exact code from the research (02-RESEARCH.md, "Simplified header.tsx" section).

**3c. Modify components/shared/status-indicator.tsx**

This component imports `useWorkflowState` from the deleted hooks. Replace the entire implementation with a static "Idle" display that requires no data fetching:

```tsx
"use client";

export function StatusIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      Idle
    </span>
  );
}
```

Note: StatusIndicator may or may not still be referenced after header.tsx cleanup. If the header no longer imports it, this file becomes unused but harmless. It will be rebuilt with MuninnDB data in Phase 04+.

**3d. Modify next.config.ts**

Remove the `spacetimedbUri` derivation block (environment variable parsing for NEXT_PUBLIC_SPACETIMEDB_URI), the WebSocket `wsUri`/`wssUri` CSP variables, and simplify the `connect-src` CSP directive to just `'self'`. Keep all other security headers and the standalone output config.

**3e. Modify package.json**

Remove `"spacetimedb": "^2.0.2"` from the `dependencies` object. Remove the `"generate:bindings"` script from the `scripts` object.

**Verification:**

- `grep -r "spacetimedb" packages/luca-observer/app/providers.tsx` returns nothing
- `grep -r "spacetimedb" packages/luca-observer/components/layout/header.tsx` returns nothing
- `grep -r "useWorkflowState" packages/luca-observer/components/shared/status-indicator.tsx` returns nothing
- `grep -r "spacetimedb" packages/luca-observer/next.config.ts` returns nothing
- `grep -r "spacetimedb" packages/luca-observer/package.json` returns nothing

### 4. Replace SpacetimeDB-dependent pages with placeholders (9 page files)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Replace all 9 page files that import SpacetimeDB hooks with minimal placeholder implementations. Each placeholder preserves the route and uses PageContainer for consistent layout.

**Standard placeholder template** (use for 7 pages: agents, cost, decisions, harness, iterations, planning, tribunal, workflow):

```tsx
import { PageContainer } from "~/components/layout/page-container";

export default function PlaceholderPage() {
  return (
    <PageContainer
      title="[Page Name]"
      subtitle="Coming soon — rebuilding with MuninnDB"
    >
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          This page is being rebuilt with MuninnDB data sources.
        </p>
      </div>
    </PageContainer>
  );
}
```

Customize the `title` for each page:

- `app/agents/page.tsx` -- title: "Agents"
- `app/cost/page.tsx` -- title: "Cost Tracking"
- `app/decisions/page.tsx` -- title: "Decision Trail"
- `app/harness/page.tsx` -- title: "Harness Results"
- `app/iterations/page.tsx` -- title: "Iterations"
- `app/planning/page.tsx` -- title: "Planning"
- `app/tribunal/page.tsx` -- title: "Tribunal"
- `app/workflow/page.tsx` -- title: "Workflow"

**Special case -- app/notes/page.tsx:**

CRITICAL: Despite what CONTEXT.md says, notes/page.tsx uses `useTable` and `useReducer` from `spacetimedb/react` plus `tables, reducers` from `~/module_bindings`. It does NOT use `useTodos`. Replace with a placeholder. Use title: "Notes".

**Special case -- app/page.tsx (dashboard):**

Do NOT use the standard placeholder. Gut the dashboard but keep TodoTracker and add a link to the Memory page. Use the code from the research (02-RESEARCH.md, "Dashboard page" section):

```tsx
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { TodoTracker } from "~/components/dashboard/todo-tracker";

export default function DashboardPage() {
  return (
    <PageContainer title="Dashboard" subtitle="Luca workflow observability">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Dashboard views are being rebuilt with MuninnDB data sources.
        </p>
        <a
          href="/memory"
          className="mt-2 inline-block font-mono text-sm text-accent underline hover:text-accent/80"
        >
          View Memory Dashboard
        </a>
      </div>
      <ErrorBoundary name="TodoTracker">
        <TodoTracker />
      </ErrorBoundary>
    </PageContainer>
  );
}
```

Note: The dashboard uses "use client" because TodoTracker uses client-side hooks. The standard placeholder pages do NOT need "use client" since they are static.

**Verification:**

- `grep -r "spacetimedb" packages/luca-observer/app/` returns nothing
- `grep -r "module_bindings" packages/luca-observer/app/` returns nothing
- `grep -r "useTable\|useReducer" packages/luca-observer/app/notes/page.tsx` returns nothing
- All 10 page routes render without errors (memory page unchanged, dashboard has TodoTracker, 8 others show placeholders)

### 5. Final verification and cleanup

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Run comprehensive verification that no SpacetimeDB references remain anywhere in the observer codebase.

**Step 1 -- Full grep for residual SpacetimeDB references:**

```bash
grep -r "spacetimedb\|module_bindings\|SpacetimeDB\|SPACETIMEDB" packages/luca-observer/ \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs" \
  | grep -v node_modules | grep -v .next | grep -v coverage
```

This must return zero results. If any file still references SpacetimeDB, fix it before proceeding.

**Step 2 -- Type check:**

```bash
cd packages/luca-observer && bunx --bun tsc --noEmit
```

Must pass with zero errors. Common failure modes:

- Missing import in a file that still references a deleted hook or component
- StatusIndicator reference in header.tsx if not properly cleaned
- notes/page.tsx still importing from module_bindings

**Step 3 -- Verify retained functionality is intact:**

```bash
# These files should exist and be unchanged:
ls packages/luca-observer/hooks/use-memory.ts
ls packages/luca-observer/hooks/use-todos.ts
ls packages/luca-observer/hooks/use-media-query.ts
ls packages/luca-observer/components/dashboard/todo-tracker.tsx
ls packages/luca-observer/components/memory/brain-panel.tsx
ls packages/luca-observer/app/memory/page.tsx
```

**Step 4 -- Verify clean page structure:**

```bash
# All route directories should still exist with page.tsx files
for dir in agents cost decisions harness iterations memory notes planning tribunal workflow; do
  ls packages/luca-observer/app/$dir/page.tsx
done
ls packages/luca-observer/app/page.tsx  # dashboard
```

**Verification:**

- Zero grep hits for SpacetimeDB references (excluding node_modules/.next/coverage)
- `bunx --bun tsc --noEmit` passes with zero errors
- All 11 route page.tsx files exist
- 3 clean hooks exist in hooks/
- Memory, layout, shared, and dashboard (todo-tracker only) component directories intact

## Verification

After all tasks complete, the following must be true:

1. **No SpacetimeDB dependency**: `grep -r "spacetimedb" packages/luca-observer/ --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules` returns nothing
2. **No module_bindings references**: `grep -r "module_bindings" packages/luca-observer/ --include="*.ts" --include="*.tsx" | grep -v node_modules` returns nothing
3. **Type check passes**: `cd packages/luca-observer && bunx --bun tsc --noEmit` exits 0
4. **Route structure preserved**: All 11 page.tsx files exist (10 routes + dashboard)
5. **Clean hooks retained**: use-memory.ts, use-todos.ts, use-media-query.ts exist
6. **MuninnDB page untouched**: app/memory/page.tsx has no changes
7. **Package.json clean**: No spacetimedb in dependencies, no generate:bindings in scripts

## Success Criteria

- The `spacetimedb` package is fully removed from the observer's dependency tree
- The observer compiles (`tsc --noEmit`) with zero errors
- All 11 routes render (placeholders or functional pages)
- The dashboard retains TodoTracker and links to the Memory page
- The memory page continues to function with MuninnDB data
- No orphaned files reference deleted modules

## Output Specification

- 90 files deleted (43 module_bindings + 15 hooks + 1 lib config + 28 domain components + 3 dashboard components)
- 9 page files replaced with placeholders (8 route pages + dashboard gutted)
- 5 files modified (providers.tsx, header.tsx, status-indicator.tsx, next.config.ts, package.json)
- Net reduction: ~90 files removed, ~5 files simplified, ~9 files rewritten as minimal stubs
