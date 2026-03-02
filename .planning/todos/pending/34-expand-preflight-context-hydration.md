---
title: Expand pre-flight to include file tree and test discovery
area: context
created: 2026-03-02
source: conversation — Stripe Minions blog review
---

## Context

Stripe "deterministically runs relevant MCP tools over likely-looking links before a minion run even starts," pre-populating context rather than relying on in-loop discovery. Luca's cognitive pre-flight currently loads BRAIN.md, selective MEMORY.md recall, and initializes WORKING.md — but doesn't pre-hydrate with codebase-specific context for the target area.

## Task

Extend cognitive pre-flight to also gather:

1. **File tree snapshot** — directory listing of the target area (domain/package being modified)
2. **Related test files** — discover test files that cover the target area (`__tests__/` mappings)
3. **Recent git history** — last 5-10 commits touching the target area for change context
4. **Import graph** — which modules the target files depend on and are depended on by

This context should be gathered deterministically (not via LLM) and injected into WORKING.md before the agent starts executing.

## Notes

- Source: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- Key insight: pre-hydration saves agentic turns spent on discovery, which saves tokens and reduces context drift
- Implementation should be fast (<5s) — use `bun` scripts, not LLM calls
- Consider making depth configurable by complexity level (TRIVIAL = skip, COMPLEX = full hydration)
- This pairs well with the existing complexity gating matrix
