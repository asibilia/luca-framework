---
title: "Add muninn_list_all or paginated full-vault enumeration MCP tool"
area: muninn
created: 2026-05-08
priority: low
source: research
---

## Task

Add muninn_list_all or paginated full-vault enumeration MCP tool

## Context

memory-audit skill research surfaced gap: no MCP tool exposes exhaustive vault enumeration. `muninn_get_enrichment_candidates` only returns under-enriched memories. `muninn_recall` is semantic-bound, no cursor. `muninn_entities` returns sparse entity index.

Audit-style use cases (memory-audit, future maintenance skills) need a paginated `muninn_list_all(vault, cursor, limit)` over the full engram store, ULID-ordered.

## MuninnDB Recall

Search MuninnDB for 'muninn-list-does-not-exist' or 'pagination muninn vault'.
