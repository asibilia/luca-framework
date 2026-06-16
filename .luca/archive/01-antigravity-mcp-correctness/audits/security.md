# Security Audit — Phase 1: antigravity-mcp-correctness

Reviewed commit `1678dcbd4` (`wire-claude-hooks.ts`).

## MUST-FIX

- **HIGH — token-bearing `mcp_config.json` written world-readable** (`wire-claude-hooks.ts`, post-`writeFile`). The file embeds a plaintext `Bearer <token>` Authorization header but is written with `writeFile` defaults (≈0644). The directly analogous token write in `vault-setup.ts` (`writeApiKeyToEnv`) is explicitly `chmodSync(envPath, 0o600)` per SEC-002. A world-readable token lets any local user read the MuninnDB credential.
  - **Fix:** after the write, `chmodSync(mcpConfigPath, 0o600)` (import `chmodSync` from `node:fs`), mirroring `writeApiKeyToEnv`.

## Advisory (LOW)

- Existing-config `JSON.parse` (mcp_config/settings/hooks reads) has no try/catch — a corrupt/hand-edited config throws and aborts `luca init` mid-write. Recommend try/catch → `{}` fallback (consistent with the missing-file `?? {}`). **Folding into this phase's fix loop** (the Antigravity read path).
- Token-read catch swallows ALL errors silently — a real IO/permission failure on `~/.muninn/mcp.token` is indistinguishable from "absent". Optional debug log of the error message (never the token). Defer.

## Passed
- No token leakage: skip-path guidance log and write log print only static text + the file path — no token interpolation anywhere.
- No injection from the merge: keys assigned by exact literal name; the `{ url: _drop, ...rest }` destructure is benign; no `__proto__`/constructor sink.
