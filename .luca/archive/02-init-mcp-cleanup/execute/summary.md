# Execute Summary — 02-init-mcp-cleanup (3 waves)

Low-risk init/MCP cleanup. WS5 + WS6 + WS7.

## Files changed (committed)
- `packages/luca-cli/src/utils/muninn-token.ts` (NEW) — `readMuninnToken(path?: string)` helper; `path` defaults to `~/.muninn/mcp.token`; reads+trims, returns `undefined` on absent/error.
- `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` — `wireAntigravityMcp` rewired to `const token = opts.token ?? (await readMuninnToken())`; dropped orphaned `homedir` import; phase-1 token gate + `chmodSync(0o600)` preserved.
- `packages/luca-cli/src/commands/init.ts` — token read rewired to `readMuninnToken()`; dropped orphaned `existsSync`/`readFile`/`homedir` + dead `autoCreateApiKey` imports; `claude mcp add` shell-out left for phase 4.
- `packages/luca-cli/src/utils/vault-setup.ts` — deleted dead `autoCreateApiKey` (+ its `mk_` regex / JSDoc); kept `writeApiKeyToEnv` + `autoCreateVault`.
- `packages/luca-cli/src/write-surface/helpers/build-muninn-instruction.ts` — added native-MCP-invocation rationale comment (Antigravity flattened-tool failure mode).

## Verification
- `bunx --bun tsc --noEmit` → exit 0.
- ac-01 (zero `autoCreateApiKey` non-test matches — in fact zero total) ✓; ac-03 (autoCreateVault preserved) ✓; ac-04 (one readMuninnToken export) ✓; ac-05.1/05.2 (call sites in both files) ✓; ac-06 (temp-fixture probe → trimmed value; nonexistent → undefined) ✓; ac-07 (chmod 0600 intact) ✓; ac-08 (comment lines ref the failure mode) ✓; ac-09 (no unused init.ts imports) ✓.
- anti-01 (writeApiKeyToEnv + autoCreateVault still defined) ✓; anti-02 (serverUrl const + enabledTools:['*'] + chmod 0600 intact) ✓.

## Commits (not pushed)
- `554475811` refactor(init): extract readMuninnToken helper (also carried the init.ts autoCreateApiKey-import removal)
- `090d92e7c` chore(init): remove dead autoCreateApiKey
- `832cd4abf` docs(write-surface): explain native MCP invocation

## Deviations
1. The init.ts `autoCreateApiKey`-import removal landed in the Wave-1 commit (both init.ts edits preceded the first `git add`); net effect identical, both halves of the dead-code removal committed.
2. Subagent could not write this summary (report-file policy) — persisted by the orchestrator.
