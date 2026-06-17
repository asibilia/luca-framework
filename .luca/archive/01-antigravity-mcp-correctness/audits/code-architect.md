# Architecture Audit — Phase 1: antigravity-mcp-correctness

Reviewed commit `1678dcbd4`.

## MUST-FIX

- **MEDIUM (correctness) — producer/consumer drift across the Antigravity MCP seam.** `wireAntigravityMcp` now writes the muninn entry to `~/.gemini/antigravity-cli/mcp_config.json` (locked D1), but `isMuninnRegistered` (`packages/luca-cli/src/utils/muninn-mcp-registration.ts:49-52`) still scans `~/.gemini/antigravity-cli/settings.json` (added by the now-reverted uncommitted change). After a successful Antigravity registration the detector reports "not registered" → the vault wizard re-prompts for the API key and `luca doctor`'s muninn check is a false negative.
  - **Fix:** point `isMuninnRegistered`'s Antigravity probe at `mcp_config.json` (the writer's target). Share the filename/path so writer and detector cannot drift again.

## Advisory (LOW)

- `AntigravitySettings.mcpServers` value type still models stdio fields (`command`/`args`/`env`) on the muninn entry; the canonical Antigravity entry is Streamable-HTTP (`serverUrl`+`headers`+`enabledTools`). Minor — merge only ever writes the HTTP triple. Consider narrowing later.
- Stale-`url` migration strips only a top-level `url`; other hypothetical legacy keys (e.g. `transport`) would survive `{...rest}`. Consistent with the locked decision (url is the only observed legacy key); document or broaden if other keys appear.
- Inline token-read I/O duplicates the `~/.muninn/mcp.token` read path — **intentional deferred WS6 seam**; tracked, no action this phase.

## Passed
- Pure/I-O split is correct: `mergeAntigravityMcpRegistration` is a total fn over a guaranteed-present `token` (narrowed by the early `return`); the wrapper owns all I/O + skip+log.
- Idempotency correctly strengthened to require ALL canonical invariants before short-circuit; partial-match entries are rewritten. Consistent with sibling `merge*` functions.
