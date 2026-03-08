---
title: Strip SpacetimeDB from observer app
area: ui
created: 2026-03-08
source: conversation
---

## Context

The observer app is being rewritten with MuninnDB-native views. All SpacetimeDB infrastructure must be removed first.

## Task

- Remove `spacetimedb` dependency from `packages/luca-observer/package.json`
- Delete `packages/luca-observer/module_bindings/` directory (30+ auto-generated files)
- Delete `lib/spacetimedb-config.ts`
- Remove SpacetimeDB provider from `app/providers.tsx` (keep Jotai + theme)
- Delete all 17 SpacetimeDB hooks in `hooks/use-*.ts` (use-event-stream, use-workflow-state, use-ledger, etc.)
- Remove `generate:bindings` script from package.json
- Delete all existing page components that depend on SpacetimeDB data

## Notes

- Keep: Next.js 15, React 19, Tailwind CSS 4, Tremor, Jotai, Lucide icons, Zod, react-error-boundary
- Keep: existing MuninnDB API routes (`/api/muninn/*`) and `lib/muninn-config.ts`
- Keep: shared UI components (ErrorBoundary, LoadingSkeleton, EmptyState, JsonViewer, StatusIndicator)
