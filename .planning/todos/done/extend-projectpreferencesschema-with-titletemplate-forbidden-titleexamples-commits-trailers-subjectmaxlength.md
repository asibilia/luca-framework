---
title: "Extend ProjectPreferencesSchema with titleTemplate / forbidden / titleExamples / commits.trailers / subjectMaxLength"
area: architecture
created: 2026-05-07
priority: high
source: research
---

## Task

Extend ProjectPreferencesSchema with titleTemplate / forbidden / titleExamples / commits.trailers / subjectMaxLength

## Context

Phase C research surfaced that the seeded luca-framework preferences memory has fields the Zod schema does not expose:
- `pr.titleTemplate` (memory uses this; schema uses `titleFormat` — incompatible names)
- `pr.titleExamples: string[]` and `pr.forbidden: {pattern,reason}[]` (memory has; schema lacks)
- `release.bumpMapping` (memory uses; schema uses `versionBump` — incompatible names)
- `commits.trailers: {coAuthor, issueRef}` and `commits.subjectMaxLength: 72` (memory has; schema lacks)
- `commits.convention: "conventional-commits"` rejected by schema enum `'conventional'|'none'`
- `tracker.kind: "github-issues"` rejected by schema enum `'github'`

The result: `consult-section` silently strips memory data through Zod parse, and Phase C prose that references `titleTemplate`/`bumpMapping` returns undefined.

## MuninnDB Recall

Search MuninnDB for `research:luca-phase-c-schema-memory-drift` and `pattern:consult-section-null-vs-fallback-contract`.

## Action

Either rename schema fields to match memory (clean), or extend schema additively (non-breaking). Decide as part of Phase C architect step — this is a Phase C blocker, but if Phase C wants to ship without schema changes, it must use the schema's field names and the memory must be re-seeded.
