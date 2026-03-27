---
title: "Address Phase 208 code review HIGH findings"
area: api
created: 2026-03-27
source: conversation
priority: P3
estimated_size: M
---

## Context

Phase 208 code review identified 5 HIGH findings introduced by the phase (3 pre-existing were logged separately). These are quality items, not blockers.

## Task

1. **Import grouping in compile/route.ts** — Merge zod and next/server into same external group [dx-advocate]
2. **ShikiCodeBlock barrel export** — Add to `~/components/shared/index.ts`, update direct imports in diff-preview.tsx and entity-tab-container.tsx [code-architect, dx-advocate]
3. **entityType-to-domainPlural duplication** — Extract to single const at top of entity-tab-container.tsx [code-architect, code-simplifier]
4. **new Date().toISOString() repeated 5x** — Hoist to single const in compile/route.ts [code-simplifier]
5. **node:fs usage in entity-route-helpers.ts** — Migrate to Bun.file() API (pre-existing but noted) [dx-advocate]

## Notes

- Full review at `.planning/phases/208-api-layer-foundation/208-REVIEW.md`
- MEDIUM findings also documented (singleton helper, fat component, etc.)
- No CRITICAL issues found
