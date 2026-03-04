---
id: "101-05"
title: "Documentation for observer deployment"
phase: 101
wave: 3
complexity: SIMPLE
depends_on: ["101-01", "101-03"]
tasks:
  - id: "101-05-1"
    title: "Create observer deployment guide"
    goal: "Write a comprehensive deployment guide for luca-observer covering local development, production build, environment configuration, and project directory targeting"
    verify: "Deployment guide exists in docs/; covers all deployment modes; includes troubleshooting section; all commands use bun"
  - id: "101-05-2"
    title: "Add inline JSDoc documentation to all observer API routes"
    goal: "Ensure every API route handler in packages/luca-observer/src/app/api/ has comprehensive JSDoc documenting the endpoint URL, request parameters, response shape, and error handling"
    verify: "All API route files have JSDoc on the exported GET/POST functions; JSDoc includes @example with curl command; bunx --bun tsc --noEmit passes"
  - id: "101-05-3"
    title: "Create observer architecture overview in docs/"
    goal: "Write an architecture document explaining the observer's data flow, component hierarchy, API routes, hooks, and relationship to luca-framework state"
    verify: "Architecture overview exists in docs/; includes data flow diagram (ASCII); covers all pages, hooks, and API routes; references relevant source files"
---

# 101-05: Documentation for Observer Deployment

## Goal

Create comprehensive documentation for deploying and understanding the luca-observer dashboard. Currently, the observer has no deployment documentation -- users must read source code to understand how to start it, configure it, and point it at different project directories. This plan creates a deployment guide, adds inline documentation to all API routes, and writes an architecture overview.

## Context

@packages/luca-observer/bin/luca-observer.js -- CLI entry point with --port, --open, --dir flags
@packages/luca-observer/package.json -- Scripts: dev, build, start, css:build, lint
@packages/luca-observer/src/app/api/ -- All API route handlers (events, events-query, state, ledger, harness, iterations, planning, tribunal, agents, memory, notes, stream, metrics, sessions)
@packages/luca-observer/src/hooks/ -- React polling hooks (use-event-stream, use-workflow-state, use-metrics, etc.)
@packages/luca-observer/src/lib/ -- Core libraries (db, sse, constants, types, file-watcher)
@packages/luca-observer/src/components/ -- UI components organized by page
@packages/luca-observer/src/stores/ -- Jotai atoms (sidebar, session, filters)
@packages/luca-observer/src/app/layout.tsx -- Root layout with sidebar + header
@packages/luca-observer/next.config.ts -- Next.js configuration
@docs/ -- Existing docs directory

**Architecture constraints:**

- Documentation files go in `docs/` directory (not in package directory)
- All commands reference bun (not npm/node)
- Documentation should be markdown
- JSDoc follows project conventions (mandatory-documentation rule)
- No emojis in documentation unless explicitly requested

**Observer deployment modes:**

1. **Development**: `bun run dev` in packages/luca-observer/ (or `luca-observer` CLI)
2. **Production build**: `bun run build && bun run start`
3. **CLI binary**: `luca-observer --port 3456 --dir /path/to/project`
4. **Environment vars**: LUCA_PROJECT_DIR, LUCA_OBSERVER_PORT

## Tasks

### Task 101-05-1: Create observer deployment guide

Create `docs/observer-deployment.md`.

A comprehensive guide covering all aspects of deploying the luca-observer dashboard.

**Sections:**

1. **Overview**: What luca-observer is, what it shows, why it matters
2. **Prerequisites**: Bun runtime, luca-framework installed, .planning/ directory exists
3. **Quick Start**: 3-command setup from zero to running dashboard

````markdown
## Quick Start

```bash
# From the luca-framework monorepo
cd packages/luca-observer
bun install
bun run dev
```
````

Open http://localhost:3456

For a different project directory:

```bash
luca-observer --dir /path/to/your-project --open
```

````

4. **Development Mode**: `bun run dev` with hot reload, Tailwind CSS watch mode
5. **Production Build**: `bun run build` then `bun run start`, CSS build step
6. **CLI Reference**: All `luca-observer` flags (--port, --dir, --open, --help)
7. **Environment Variables**: LUCA_PROJECT_DIR, LUCA_OBSERVER_PORT
8. **Project Directory Requirements**: What .planning/ files the observer expects:
   - `.planning/state.json` -- Workflow state (required for dashboard)
   - `.planning/STATE.md` -- State snapshot (fallback)
   - `.planning/session-ledger.jsonl` -- Event ledger (for transitions)
   - `.planning/checkpoints/*.json` -- Iteration checkpoints (for iterations page)
   - `.planning/session-plan.json` -- Session plan (for planning page)
   - `.planning/tribunal-result.json` -- Tribunal result (for tribunal page)
   - `.planning/BRAIN.md`, `MEMORY.md`, `WORKING.md` -- Memory files (for memory page)
9. **Troubleshooting**:
   - Port already in use
   - No data showing in dashboard
   - SSE connection disconnected
   - CSS not loading
10. **Integration with Luca Workflow**: How the observer fits into the development loop

**Verify:**

- [ ] File exists at `docs/observer-deployment.md`
- [ ] All deployment modes documented (dev, build, CLI)
- [ ] All CLI flags documented
- [ ] Environment variables documented
- [ ] Project directory requirements listed
- [ ] Troubleshooting section with 4+ common issues
- [ ] All commands use bun (not npm/node)

### Task 101-05-2: Add inline JSDoc documentation to all observer API routes

Audit and update every API route file in `packages/luca-observer/src/app/api/` to have comprehensive JSDoc.

**API routes to document:**

| Route | File | Purpose |
|-------|------|---------|
| GET /api/events | events/route.ts | Insert events into in-memory DB |
| GET /api/events-query | events-query/route.ts | Query events with filters |
| GET /api/state | state/route.ts | Read workflow state |
| GET /api/ledger | ledger/route.ts | Read session ledger entries |
| GET /api/harness | harness/route.ts | Read latest harness result |
| GET /api/iterations | iterations/route.ts | Read iteration checkpoints |
| GET /api/planning | planning/route.ts | Read session plan |
| GET /api/tribunal | tribunal/route.ts | Read tribunal result |
| GET /api/agents | agents/route.ts | Read agent activity |
| GET /api/memory | memory/route.ts | Read memory files |
| GET /api/metrics | metrics/route.ts | Read metrics |
| GET /api/sessions | sessions/route.ts | Read session data |
| GET /api/stream | stream/route.ts | SSE event stream |
| GET /api/notes | notes/route.ts | Read developer notes |

**JSDoc format per route:**

```typescript
/**
 * GET /api/{route} -- {Brief description}.
 *
 * {Detailed description of what data this route serves,
 * where it reads from, and what the response shape looks like.}
 *
 * Query parameters:
 *   - dir (optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *   - {other params if any}
 *
 * Response (200):
 *   {description of JSON response shape with snake_case field names}
 *
 * Response (500):
 *   { error: "error_code_string" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/{route}
 * ```
 */
````

**Steps:**

1. Read each route file
2. Add or update JSDoc on the exported GET/POST function
3. Ensure response shape is documented
4. Include curl example

**Verify:**

- [ ] All 14 API route files have comprehensive JSDoc
- [ ] Each JSDoc includes endpoint URL, description, query params, response shape
- [ ] Each JSDoc includes curl example
- [ ] Response shapes documented with snake_case field names
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-05-3: Create observer architecture overview in docs/

Create `docs/observer-architecture.md`.

An architecture document explaining how the observer dashboard works internally.

**Sections:**

1. **System Overview**: Observer as a read-only dashboard for Luca framework state

2. **Data Flow Diagram** (ASCII art):

```markdown
## Data Flow
```

Hook Scripts (src/hooks/scripts/)
|
| emit events via stdout / ledger append
v
.planning/ Directory
|--- state.json (workflow state)
|--- session-ledger.jsonl (event log)
|--- checkpoints/_.json (iteration records)
|--- session-plan.json (WSJF plan)
|--- tribunal-result.json (debate results)
|--- BRAIN.md / MEMORY.md / WORKING.md
|
v
Observer API Routes (packages/luca-observer/src/app/api/)
|
| file-watcher.ts reads files
| db.ts stores events in-memory
| sse.ts pushes real-time updates
v
React Hooks (packages/luca-observer/src/hooks/)
|
| polling (useXxx hooks) + SSE (useEventStream)
v
UI Components (packages/luca-observer/src/components/)
|
v
Pages (packages/luca-observer/src/app/_/page.tsx)

```

```

3. **Page Hierarchy**: List of all pages with their components and data hooks

| Page       | Components                                                            | Hooks                     | API Routes               |
| ---------- | --------------------------------------------------------------------- | ------------------------- | ------------------------ |
| Dashboard  | OverviewCards, RecentEvents, RecentTransitions                        | useEventStream, useLedger | /api/stream, /api/ledger |
| Workflow   | StateDiagram, TransitionLog, WorkflowContextPanel                     | useWorkflowState          | /api/state               |
| Iterations | ConvergenceChart, BudgetGauge, ErrorClassification, IterationTimeline | useIterationHistory       | /api/iterations          |
| ...        | ...                                                                   | ...                       | ...                      |

4. **API Route Architecture**: How routes read from .planning/, validation with Zod, snake_case convention

5. **State Management**: Jotai atoms for client-side state (sidebar, theme, session, filters)

6. **Real-Time Updates**: SSE stream architecture, event flow from file-watcher to browser

7. **Component Design Patterns**: font-mono design language, CSS custom properties, card-based layout

8. **Relationship to luca-framework**: Observer is read-only, no imports from luca-framework, types mirrored locally

**Verify:**

- [ ] File exists at `docs/observer-architecture.md`
- [ ] Data flow diagram included (ASCII art)
- [ ] All pages listed with components, hooks, and API routes
- [ ] API route architecture explained
- [ ] State management explained
- [ ] SSE stream architecture explained
- [ ] Relationship to luca-framework documented
- [ ] References source files with relative paths

## Success Criteria

- [ ] Deployment guide at `docs/observer-deployment.md` with complete setup and troubleshooting
- [ ] All 14 API routes have comprehensive JSDoc with curl examples
- [ ] Architecture overview at `docs/observer-architecture.md` with data flow diagram
- [ ] All documentation uses bun commands (not npm/node)
- [ ] All documentation follows project markdown conventions
- [ ] `bunx --bun tsc --noEmit` passes
