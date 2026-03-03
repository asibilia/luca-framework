---
title: Build luca-observer real-time web dashboard
area: packages
created: 2026-03-03
source: conversation
---

## Context

Researched [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) for inspiration. A team of 3 review agents (architecture, domain coverage, tech feasibility) validated the plan. A second team of 3 agents reviewed [joes-book--next](https://github.com/asibilia/joes-book--next) to extract coding patterns and DX preferences. Full implementation plan at `.claude/plans/eager-conjuring-anchor.md`.

## Task

Build `packages/luca-observer/` — a Next.js web dashboard that visualizes Luca workflow executions in real-time. Users install it alongside luca-framework and run `luca-observer` to watch their workflows.

**Stack**: Next.js (App Router) + TypeScript + Bun + Tailwind CSS 4 + shadcn/ui + SpacetimeDB + SSE

**Data flow**: Hooks emit HTTP POST -> SpacetimeDB -> SSE broadcast -> Browser. State/memory/metrics read from `.planning/` filesystem on demand.

**8 dashboard pages**: Dashboard overview, Workflow state machine, Iterations & convergence, Harness results, Planning (WSJF), Memory system, Tribunal & debate, Agent activity.

**6 implementation phases**: Foundation MVP -> Workflow & State -> Harness & Iteration -> Memory & Planning -> Tribunal & Agents -> Polish.

## Patterns from joes-book--next (to adopt)

Findings from a 3-agent review of the user's personal Next.js repo:

### Project Structure

- **Next.js 16 + React 19 + App Router** — latest versions, same as luca-observer target
- **Bun runtime** throughout (bun install, bun run dev) — consistent with luca-framework monorepo
- **Route groups** for logical separation (e.g., `(auth)/`, `(dashboard)/`)
- **`~/` path alias** via tsconfig `paths` — adopt for luca-observer (standalone tsconfig, not extending root)
- **Strict TypeScript** (`strict: true`, `noUncheckedIndexedAccess: true`)

### UI & Components

- **Domain-organized components** — `components/workflow/`, `components/memory/` etc. (NOT type-organized like `components/buttons/`, `components/cards/`)
- **shadcn/ui new-york style** with heavy customization — adopt new-york variant
- **Tailwind v4 CSS-first config** — `@theme` directives in CSS, no `tailwind.config.ts`
- **Dynamic color system** via `@zyphox/tailwind-dynamic-colors` — context-based color theming
- **Layout component library** — reusable layout primitives: PageContainer, CollectionLayout, DetailLayout, SectionHeader
- **Dark mode as default** — fits developer tool aesthetic; use `class` strategy for toggling
- **Brutalist/modern aesthetic** — bold borders, high contrast, monospace accents

### State Management

- **Jotai for simple UI state** — sidebar open/closed, active filters, selected session
- **XState for complex workflows** — state machine visualization (workflow page is literally a state machine viewer)
- **No Redux/Zustand** — lightweight atoms + machines pattern

### Data Layer

- **SpacetimeDB as backend database** (NOT Convex, which joes-book uses; NOT SQLite from original plan)
- **Real-time subscriptions** — SpacetimeDB provides built-in real-time updates, potentially replacing or complementing SSE
- **Zod schemas for API validation** — safeParse at API boundaries, snake_case payloads
- **Server Components for initial data** — client components only where interactivity needed

### DX Conventions

- **kebab-case file naming** — consistent with luca-framework rules
- **Functional patterns only** — no classes, factory functions + closures
- **Individual lodash imports** — `import get from 'lodash/get'` for tree-shaking
- **Comprehensive accessibility** — ARIA labels, keyboard navigation, focus management

## Notes

- Plan reviewed by 3 agents: arch-reviewer, data-reviewer, tech-researcher
- Patterns reviewed by 3 agents: structure-reviewer, ui-reviewer, dx-reviewer (joes-book--next)
- Key tech decisions: no Turbopack for Phase 1, standalone tsconfig (no root extend), observer-emitter.ts extracted from bridge.ts
- 12 existing schema files to reuse across iteration/harness/planner/memory/tribunal/observability/context/complexity domains
- Observer is live-only (fire-and-forget events, no guaranteed delivery)
- SpacetimeDB replaces SQLite (bun:sqlite) as the backend database
- Full plan: `.claude/plans/eager-conjuring-anchor.md`
