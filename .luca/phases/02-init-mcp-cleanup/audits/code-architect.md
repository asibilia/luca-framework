# Architecture Audit — Phase 2: init-mcp-cleanup

Reviewed commits `554475811`, `090d92e7c`, `832cd4abf`. **Verdict: APPROVED — no must-fix.**

## Findings: `issues: []`

- **Helper placement** — `muninn-token.ts` is well-justified: the credential-file read is a distinct concern from `muninndb-*.ts` (service/port/health) and `muninn-mcp-registration.ts` (config-surface scanning). Two cross-module callers + the deletion test → earns its own module. `muninn-` prefix consistent.
- **`path` param** — single optional positional with a default-in-signature is appropriate; JSDoc documents the test-fixture rationale.
- **Behavior preservation** — `opts.token ?? await readMuninnToken()` preserves "explicit override beats file read" and short-circuits the read; the downstream token gate + `chmodSync 0600` are untouched (anti-02 holds). init.ts truthiness gate preserved. Empty-after-trim treated as absent at both sites (consistent). No semantic drift.
- **Import hygiene** — init.ts has zero orphaned `existsSync`/`readFile`/`homedir`/`autoCreateApiKey`; wire-claude-hooks.ts retains `existsSync`/`readFile` for its settings/hooks/mcp_config reads.
- **Missed consumers** — `autoCreateApiKey` has zero live references repo-wide; `writeApiKeyToEnv` + `autoCreateVault` preserved and still used.

## Non-blocking notes (from simplification, deferred)
1. `writeApiKeyToEnv` still loops over a now-single-element `envLines` array — leftover multi-key scaffolding (vault-setup.ts). Cosmetic.
2. `readMuninnToken`'s `existsSync` guard is strictly redundant given the catch swallows ENOENT — kept for readability. Fine as-is.
