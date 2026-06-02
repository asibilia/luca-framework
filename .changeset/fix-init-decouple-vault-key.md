---
"@alecsibilia/luca": patch
---

Stop prompting for a MuninnDB API key per vault during vault setup.

The MuninnDB API key is **instance-level**, not per-vault: one MuninnDB
instance issues one key that reaches every vault, because the vault is a
per-tool-call parameter (`muninn_recall(vault, …)`), not an auth boundary. A
single registered `muninn` MCP server therefore covers all current and future
vaults. The wizard previously prompted for a key on every `luca vault:init`
(and `luca init`, which delegates to it), implying each vault needs its own —
and `writeApiKeyToEnv` wrote the same key value under three names
(`MUNINN_DB_<VAULT>_API_KEY`, `MUNINN_DB_DEFAULT_API_KEY`, `MUNINN_DB_API_KEY`),
none of which anything reads.

Changes:

- **Decouple the vault name from the API key.** `runVaultWizard` always
  records the vault name; it only asks for an API key when **no `muninn` MCP
  server is registered yet** (detected via the shared `isMuninnRegistered`
  helper, extracted from the `muninn-mcp` doctor check). When one is already
  registered, it records the vault name and skips the key entirely. When the
  key is left blank it still records the vault name (previously aborted).
- **Reword the prompt** to say the key is a one-time, instance-level credential
  for registering the MCP server — not a per-vault secret.
- **Simplify `writeApiKeyToEnv`** to write a single `MUNINN_DB_API_KEY` (the
  per-vault aliasing was dead — same value under multiple names, never read).
  `VaultConfig.apiKey` is now optional, and `vault:init` only writes `.env`
  when a key was actually captured.
