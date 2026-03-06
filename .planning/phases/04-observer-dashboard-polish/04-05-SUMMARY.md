# Plan 04-05 Summary: Add Todo Tracking to Observer Dashboard

## Status: COMPLETE

## Objective

Replace mock data in the observer dashboard's todo tracker with a real API route that reads `.planning/todos/pending/` and `.planning/todos/done/` directories.

## Tasks Completed

### Task 1: Create API route for reading todos

- Created `packages/luca-observer/app/api/todos/route.ts`
- Reads from `.planning/todos/pending/` and `.planning/todos/done/` directories
- Parses YAML frontmatter from markdown files
- Returns structured JSON array of `TodoResponse` objects
- Handles missing directories gracefully (returns empty array)
- Uses `node:fs/promises` and `node:path` (Next.js server-side route)

### Task 2: Update useTodos hook to fetch from API

- Rewrote `packages/luca-observer/hooks/use-todos.ts`
- Replaced mock data with real `fetch("/api/todos")` call
- Added `useCallback` for `fetchTodos` function
- Added `useEffect` for mount-time fetch
- Returns `{ todos, loading, error, refetch }` interface

### Task 3: Update TodoTracker component for error handling

- Updated `packages/luca-observer/components/dashboard/todo-tracker.tsx`
- Destructures `{ todos, loading, error, refetch }` from useTodos
- Shows `LoadingSkeleton variant="card"` when loading
- Shows error message with retry button when error occurs
- Preserved existing rendering logic for success case

## Deviations

- [Rule 1 - Bug] Fixed TypeScript error TS2532 in `parseFrontmatter`: `match[1]` was possibly undefined. Changed `if (!match)` to `if (!match?.[1])` for strict null safety.

## Verification

- `bunx --bun tsc --noEmit` passes clean (0 errors)

## Commits

| Task        | Commit                                  | Hash       |
| ----------- | --------------------------------------- | ---------- |
| All 3 tasks | feat(04-05): add real todo tracking API | `a2f2daae` |

## Files Changed

- `packages/luca-observer/app/api/todos/route.ts` (created)
- `packages/luca-observer/hooks/use-todos.ts` (modified)
- `packages/luca-observer/components/dashboard/todo-tracker.tsx` (modified)
