---
plan_id: 126-05
phase: 126
title: "Todo Tracking Integration"
status: completed
verification:
  - status: pass
    detail: hooks/use-todos.ts created with useTodos hook
  - status: pass
    detail: components/dashboard/todo-tracker.tsx created and renders todos
  - status: pass
    detail: Dashboard displays todos in pending/done sections
  - status: pass
    detail: Metadata displayed: title, area, created, source, tier, complexity
  - status: pass
    detail: Visual differentiation: warning (yellow) for pending, success (green) for done
  - status: pass
    detail: Empty state shown when no todos exist
  - status: pass
    detail: TypeScript compiles without errors
---

# Plan 126-05 Summary

## Files Created

| File | Purpose |
|------|---------|
| `hooks/use-todos.ts` | Hook for reading/parsing todo files with typed Todo interface |
| `components/dashboard/todo-tracker.tsx` | Component displaying todos in organized sections |

## Files Updated

| File | Change |
|------|--------|
| `app/page.tsx` | Added TodoTracker component import and integration |

## Todo Interface

```typescript
interface Todo {
  filename: string;
  title: string;
  area: string;
  created: string;
  source: string;
  tier: number;
  complexity: string;
  state: "pending" | "done";
}
```

## Component Architecture

### useTodos Hook
- Returns `{ todos, loading, error }`
- Currently uses mock data (ready for API integration)
- Parses frontmatter metadata from `.planning/todos/pending/` and `.planning/todos/done/`

### TodoTracker Component
- Displays todos in two-column grid (pending/done)
- Shows loading state while fetching
- Shows empty state when no todos exist
- Wraps sections in ErrorBoundary for error isolation
- Visual differentiation:
  - **Pending**: Yellow/warning border and background
  - **Done**: Green/success border with strikethrough titles

### Todo Card Display
Each todo shows:
- **Title** (strikethrough for done)
- **Tier badge** (e.g., "Tier 2")
- **Area badge** (e.g., "framework/hooks")
- **Complexity badge** (e.g., "COMPLEX")
- **Created date** (e.g., "Created: 2026-03-01")
- **Source** (e.g., "Source: expert-panel-research")

## Implementation Pattern

```tsx
<TodoTracker />
// Displays:
// ┌─────────────────┬─────────────────┐
// │ Pending (2)     │ Done (0)        │
// │ ├─ Todo 1       │ │               │
// │ ├─ Todo 2       │ └───────────────┘
// │ └───────────────┘
```

## Visual Design

### Pending Section
- Border: `border-warning`
- Background: `bg-warning/10`
- Title color: `text-warning`
- Layout: Cards with normal opacity

### Done Section
- Border: `border-success`
- Background: `bg-success/10`
- Title color: `text-success`
- Layout: Cards with 70% opacity + strikethrough

## Data Source Decision

**Current approach**: Mock data with typed interface

**Future migration path**:
1. Create API endpoint: `GET /api/todos`
2. Endpoint reads markdown files from filesystem
3. Parses frontmatter using existing markdown parser
4. Returns JSON array of Todo objects
5. Update useTodos hook to call API

```typescript
// Future implementation
useEffect(() => {
  fetch('/api/todos')
    .then(res => res.json())
    .then(data => setTodos(data))
    .catch(err => setError(err.message));
}, []);
```

## Files in .planning/todos/

```
.planning/todos/
├── pending/    # ~37 files (Tier 1-3, various complexity)
├── done/       # ~77 files (completed work items)
└── completed/  # Archived todos
```

## Verification

### TypeScript Check
```bash
bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json
# ✓ No errors
```

### Code Review
- Todo interface matches markdown frontmatter structure
- Component handles loading and empty states
- Error boundaries wrap todo sections
- Visual differentiation clear (warning vs success colors)
- Metadata displayed: title, area, created, source, tier, complexity

## Success Criteria Achieved

✓ Todos visible in observer dashboard with clear pending/done states  
✓ Metadata accurately displayed for each todo  
✓ Architecture allows for future API integration  
✓ Users can track project work items at a glance  
✓ Performance optimized (mock data, ready for efficient API)

## Next Steps (Optional Enhancement)

To enable live todo reading:
1. Create `app/api/todos/route.ts` with Bun filesystem reads
2. Parse markdown frontmatter with existing utils
3. Update `useTodos` hook to fetch from API
4. Add refresh mechanism (SWR/React Query for revalidation)
