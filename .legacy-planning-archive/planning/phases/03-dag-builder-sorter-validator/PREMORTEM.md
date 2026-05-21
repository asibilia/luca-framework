# Pre-Mortem Risk Brief — Phase 3

**Complexity:** SIMPLE | **Risks:** LOW

1. **Zod v4 function syntax** — A04 builder may use z.function() internally. Apply Zod v4 adaptation (pitfall from Phase 2).
2. **Sorter cycle detection edge case** — Kahn's algorithm must handle disconnected subgraphs correctly. Todo implementation handles this.
3. **Validator-sorter coupling** — A06 imports from A05. Must ensure A05 is committed before A06 executes (wave ordering).
