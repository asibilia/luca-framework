---
"@alecsibilia/luca": patch
---

Reconcile where the repo vault name lives in `.luca/config.json`: the canonical location is `muninn.vault`.

`luca init`'s project skeleton wrote a **top-level** `vault: null` key, while `luca vault:init` writes `muninn.vault` — so a fully set-up project ended up with both a dead top-level `vault: null` and the real `muninn.vault`. The top-level key was never primary (`resolveRepoVault` only reads it as a legacy fallback), so it was dead weight that misled anyone reading the config.

- **Writer fix:** the `init` skeleton now writes `muninn: { vault: null }` (the canonical, self-documenting placeholder) instead of a top-level `vault: null`. `luca vault:init` fills it in later by merging into `muninn`.
- **Migration:** a new `luca doctor` project-scope check ("Vault config location") flags an existing top-level `vault` key and, under `luca doctor --fix`, normalizes it — folding a non-empty top-level value into `muninn.vault` when `muninn.vault` is unset, then removing the stale top-level key (all other config keys preserved).

`resolveRepoVault` keeps its legacy top-level `vault` fallback for back-compat, but nothing writes there anymore.
