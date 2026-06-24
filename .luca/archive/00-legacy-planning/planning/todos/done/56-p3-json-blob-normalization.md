---
title: "P3: Evaluate normalizing JSON blob fields in SpacetimeDB schema"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer)
priority: P3
---

## Context

5+ tables store large JSON blobs as text fields (contextJson, detailsJson, checkpointJson, alternativesJson, etc.). No validation at schema level, no compression, queries can't filter on nested fields.

## Task

1. Audit all JSON blob fields in `packages/luca-spacetime/spacetimedb/src/schema.ts`
2. Evaluate which blobs should be normalized into relational tables
3. Add JSON validation at reducer level for remaining blobs
4. Consider adding `createdAt`/`updatedAt` timestamps to all tables
5. Add schema versioning table for future migrations

## Notes

- Normalization trade-off: more tables vs query flexibility
- Some blobs are genuinely unstructured (contextJson) — keep as JSON
- Others (decision alternatives, checkpoint data) could benefit from normalization
- Medium-term effort — requires careful migration planning
