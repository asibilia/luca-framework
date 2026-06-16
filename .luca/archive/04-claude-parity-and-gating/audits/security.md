# Security Audit — Phase 4: claude-parity-and-gating

Reviewed commits `b03504727`, `a26885f40`, `e4eef6306` (`wireClaudeMcp` writes a Bearer token into `~/.claude.json`). **Verdict: REQUEST_CHANGES — 2 MUST-FIX + 1 SHOULD-FIX.**

## MUST-FIX

1. **CRITICAL — parse-guard clobbers the user's PRIMARY config.** `wireClaudeMcp` falls back to `existing = {}` whenever `JSON.parse` throws. JSON.parse throws on ANY invalid content, including a populated, readable, hand-edited `~/.claude.json` (trailing comma, comment). On that throw → `{}` → merge yields `{mcpServers:{muninn}}` → the atomic `rename` durably and COMPLETELY replaces the user's config (projects, history, theme, all other mcpServers). Atomicity makes the loss total. The inline comment ("never on a populated, readable file") is factually wrong.
   - **Fix:** distinguish absent/whitespace-only file (safe → `{}`) from present-nonempty-but-unparseable (ABORT the write, log actionable guidance: "~/.claude.json is present but not valid JSON; skipping MCP registration to avoid overwriting it — fix and re-run"), `return` before the rename. Apply the SAME guard to `wireAntigravityMcp` (mcp_config.json has the same {}-fallback-then-write pattern, lower stakes but same bug class).

2. **HIGH — token-bearing temp file world-readable window.** `writeFile(tmpPath, data)` with no `mode` creates the file 0o666&~umask (typically 0644). The Bearer token is written into it BEFORE `chmodSync(tmpPath, mode)` tightens it. Any local process can read `~/.claude.json.luca-<pid>-<ts>.tmp` during that window. (chmod-before-rename order is correct — the final file is never loose — but the temp itself leaks.)
   - **Fix:** `await writeFile(tmpPath, data, { mode })` so the temp is restrictive from inception. Apply `{ mode: 0o600 }` to the Antigravity `writeFile` too (its token has the same write-then-chmod window).

## SHOULD-FIX

3. **No temp cleanup on write failure.** If `chmodSync`/`rename` throws after `writeFile` succeeds, the token-bearing `.tmp` is left orphaned in `$HOME` (and, per #2, world-readable). Wrap writeFile/chmod/rename in try/catch (or try/finally) that `unlink`s tmpPath on error before rethrowing.

## Cleared (verified, no issue)
- Token never logged: all `log()` calls emit fixed strings or paths only — no token interpolation in any log/error path.
- chmod-before-rename ordering correct → final `~/.claude.json` never world-readable.
- Mode never-loosen `min(0o600, existingMode)` correct.
- Atomic rename: temp in `homedir()` = same fs as target → atomic.
- D3 token gate returns before any write; no placeholder.
- No prototype-pollution vector (own-enumerable keys via spread; source is user's local config).
