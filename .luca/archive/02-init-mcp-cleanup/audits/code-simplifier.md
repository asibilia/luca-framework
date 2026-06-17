PERSPECTIVE: simplification
VERDICT: APPROVE

FINDINGS:
- [NOTE] `writeApiKeyToEnv` still loops over `envLines`, which is now always a
  single-element array (`[`MUNINN_DB_API_KEY=${apiKey}`]`) after the per-vault
  key aliasing was collapsed. The `for (const envLine of envLines)` scaffolding
  is leftover generality from the multi-key era — the loop body could be inlined
  for a single key.
  File: packages/luca-cli/src/utils/vault-setup.ts:347-372
- [NOTE] `readMuninnToken` uses `existsSync(path)` + `readFile` inside a
  try/catch. The catch already swallows ENOENT, so the `existsSync` guard is
  strictly redundant for correctness. Kept as-is is fine (avoids a throw on the
  common missing-token path and reads clearly), but it is the one spot where the
  guard+read+catch triple could collapse to just read+catch if minimalism is
  preferred.
  File: packages/luca-cli/src/utils/muninn-token.ts:24-31

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0

EVIDENCE (anti-sycophancy gate — 3+ verified locations):
1. Token-read DRY is correct and complete. All three call sites route through
   `readMuninnToken`: init.ts:261, wire-claude-hooks.ts:177, with the helper at
   muninn-token.ts:21. A repo-wide grep for inline token reads
   (`existsSync.*token`, `readFile.*token`, `Bun.file.*token`, `mcp.token`)
   returned ZERO remaining inline duplications — only the helper + doc strings.
2. No dead imports after the rewire. init.ts no longer imports `existsSync` /
   `node:fs` (grep returned no matches) — the inline read was fully excised.
   wire-claude-hooks.ts retains `existsSync`/`readFile` but they are still used
   for settings.json / hooks.json / mcp_config.json reads (lines 105-108,
   130-133, 166-174), not the token. The `.ts` extension on the helper import
   (wire-claude-hooks.ts:5) matches the file's existing local-import convention
   (install-skills.ts:6) — consistent, not a defect.
3. Optional-path param is justified, NOT over-engineering. `path` defaults to
   the real credential path (muninn-token.ts:22); the override exists so
   tests/probes target a temp fixture without touching `~/.muninn/mcp.token`.
   This is a single, documented seam (JSDoc lines 9-11) rather than speculative
   config — minimal and correct.
4. Per-vault env aliasing dead code is genuinely removed. Grep for
   `MUNINN_DB_DEFAULT_API_KEY` / `MUNINN_DB_<VAULT>_API_KEY` shows only doc
   comments (vault-setup.ts:322, CHANGELOG) — the runtime now emits exactly one
   `MUNINN_DB_API_KEY` (vault-setup.ts:347).
5. The wizard's API-key step is correctly gated behind `isMuninnRegistered`
   (vault-setup.ts:207) so the instance-level-key insight removes a whole
   redundant prompt branch rather than adding indirection.

source_agent: code-simplifier
