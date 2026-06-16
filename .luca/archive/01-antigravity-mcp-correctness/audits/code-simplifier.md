# Simplification Audit — Phase 1: antigravity-mcp-correctness

Reviewed commit `1678dcbd4`. No correctness/simplification blockers.

## Fold into this phase (LOW, drift guard)

- **Hoist the repeated `serverUrl` literal `'http://127.0.0.1:8750/mcp'`** — it appears in both the idempotency check and the write. Two literals must stay in lockstep or the short-circuit silently stops matching the value it writes. Hoist to a module const (e.g. `MUNINN_MCP_SERVER_URL`) referenced in both places. (Drift guard → worth doing now.)

## Advisory (LOW)

- Four-part idempotency conjunction is correct but dense (mixes a `Record<string,unknown>` cast into the boolean wall). Optionally lift into a named `isCanonical` predicate for readability. Cosmetic.
- Destructure-omit `{ url: _drop, ...rest }` + `void _drop` is the correct idiom given the locked type decision (url absent from the type). Keep as-is.
- Token-read duplication — informational only; deferred to WS6.

## Passed
- No DRY violations beyond the literal-hoist note; merge logic is minimal and correct.
