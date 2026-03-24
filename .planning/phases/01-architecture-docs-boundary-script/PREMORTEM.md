# Pre-Mortem Risk Brief — Phase 1

**Complexity:** TRIVIAL | **Risks:** 3 (all LOW)

1. **Tier Map Desync** — domain-architecture.md and module-boundary.md could drift. Mitigation: verify both files have identical tier assignments after editing.
2. **Missing Archetype Classification** — DOMAIN_TIER added but Archetype B table not updated. Mitigation: ensure both docs AND tables are updated together.
3. **Index Invariant Not Enforced** — boundary script doesn't validate barrel-only index.ts files. Mitigation: note in downstream todos that index.ts must be pure re-exports.

**Plan Constraints:** Cross-check both rule files after edits. Run `bun run scripts/check-domain-boundaries.ts` to confirm entries are recognized.
