# Learnings — Phase 4: claude-parity-and-gating

**Outcome:** PASS after one security-fix loop. WS4 (global Claude MCP file-merge into `~/.claude.json`) + WS8 (per-harness skip flags + isInstalled gating).

## High-value durable learnings (persisted to default vault)
1. **JSON.parse `catch → {}` fallback can CLOBBER a config you then write back.** If a writer reads an existing config, falls back to `{}` on parse error, merges, and writes — a *present-but-malformed* file (hand-edited trailing comma/comment) is silently replaced. With an atomic temp+rename the loss is total. Fix: distinguish absent/whitespace-only (safe → `{}`) from present-nonempty-but-unparseable (ABORT + log, never write). → `pitfall:json-parse-fallback-clobbers-config`.
2. **Token-bearing temp/file must be created restrictive FROM INCEPTION.** `writeFile(path, dataWithToken)` then `chmodSync(0o600)` leaves a window where the file is 0644 (umask) while holding the credential. Use `writeFile(path, data, { mode })`. Applies to atomic temp files too. (The repo's `vault-setup.ts writeApiKeyToEnv` has the same write-then-chmod anti-pattern — worth a follow-up.) → `pitfall:credential-file-perms-window`.

## Process learning (persisted)
- The plan-reviewer and verifier both tested only VALID-JSON fixtures and missed the malformed-input clobber; the security reviewer caught it. For any destructive file write (especially to a user's primary config), explicitly exercise the malformed/corrupt-input path. → folded into `pitfall:json-parse-fallback-clobbers-config`.

## Decisions (this phase)
- Claude global MCP entry uses `{ type:'sse', url, headers }` in top-level `~/.claude.json` mcpServers (confirmed from the live config) — distinct from Antigravity's `serverUrl`+`enabledTools`. The per-harness `Harness.mcp` abstraction (phase 3) made this divergence clean.
- `~/.claude.json` writes are atomic (temp+rename, same-fs); Antigravity's `mcp_config.json` write stays direct (luca-owned, lower stakes) but now also `{ mode: 0o600 }`.
- WS8 gates wiring on `isInstalled()` → init no longer pre-seeds a harness whose home is absent (intended).

## Carry-forward (deferred)
- Phase-3 carry-forward still open: drive `installSkills` off `h.installArtifacts`/`h.home()` and model `installStatusline` as an optional per-harness capability (NOT in this milestone).
- Stale human-facing remediation text still recommends `claude mcp add` in `init.ts` readout + `muninn-mcp.ts` doctor (cross-phase LOW) — update in a follow-up now that Claude MCP auto-registers.
- `vault-setup.ts writeApiKeyToEnv` write-then-chmod window (same class as pitfall #2) — follow-up hardening.
