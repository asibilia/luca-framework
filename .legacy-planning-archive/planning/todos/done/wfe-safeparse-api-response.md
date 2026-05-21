---
title: Add safeParse validation on API response in workflow hook
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: MEDIUM
effort: Small
---

## Context

At `use-workflow-graph.ts:69`, the API response is cast directly without Zod `safeParse` validation. The project's schema-first-parsing rule requires all external data to be validated through Zod schemas.

## Task

- Replace the direct cast with `TopologyResponseSchema.safeParse(data)`
- Handle parse failures gracefully (show error state, log validation errors in dev)
- The Zod schema already exists in `workflow-types.ts` — just needs to be used at the API boundary

## Files Affected

- `packages/luca-observer/hooks/use-workflow-graph.ts`

## Notes

- Audit source: code-architect + dx-advocate (MEDIUM severity)
- Also flagged by security-auditor as LOW (API response cast without schema validation)
