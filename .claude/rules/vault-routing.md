---
description: "Vault routing: dual-vault recall strategy and write heuristic for MuninnDB"
globs:
  - src/agents/**/*.ts
  - src/skills/**/*.ts
alwaysApply: true
---

# Vault routing: dual-vault recall strategy and write heuristic for MuninnDB

## rule

# Vault Routing

## Vault Resolution

Determine the repo vault name in this priority order:

1. `.planning/config.json` `muninn.vault` field (the "repo vault")
2. `LUCA_MUNINN_VAULT` environment variable
3. `"default"` (final fallback)

The `"default"` vault is always used for cross-cutting memories regardless of repo vault configuration.

```json
{
  "muninn": {
    "vault": "luca-framework"
  }
}
```

## Two-Vault Model

Luca uses two MuninnDB vaults simultaneously:

- **Repo vault** (from config): Project-specific memories -- session context, project identity, metrics, milestones.
- **Default vault** (`"default"`): Cross-cutting memories -- patterns, pitfalls, preferences, user identity, procedures.

The question to ask: "Would this memory be useful in a completely different repo?" Yes -> default vault. No -> repo vault.

## Dual-Vault Recall Strategy

When recalling memories, use type-based routing to decide which vault(s) to query:

| Memory Type | Vault Source | Rationale |
|---|---|---|
| brain:project-identity | Repo vault only | Project-specific identity tree |
| brain:user-identity | Default vault only | Cross-project user preferences |
| session:* | Repo vault only | Session context is project-scoped |
| pattern:*, pitfall:*, preference:* | Both vaults, merge by score | Cross-cutting + project-specific |
| procedure:* | Both vaults, merge by score | Reusable across projects |
| metric:* | Repo vault only | Project metrics are scoped |

### Merge Strategy

When querying both vaults:

1. Call `muninn_recall` on repo vault first
2. Call `muninn_recall` on default vault second
3. Concatenate results
4. Sort by relevance score (descending)
5. Dedup by concept prefix (keep highest-scored entry per prefix)

## Write Routing Heuristic

When storing memories, use concept-prefix-based routing:

| Concept Prefix | Write To | Rationale |
|---|---|---|
| session:* | Repo vault | Session context is project-scoped |
| version:*, milestone:* | Repo vault | Release history is project-scoped |
| brain:project-* | Repo vault | Project identity |
| brain:user-* | Default vault | User identity is cross-cutting |
| pattern:* | Default vault | Generalizable patterns |
| pitfall:* | Default vault | Generalizable warnings |
| preference:* | Default vault | User preferences are cross-cutting |
| procedure:* | Default vault | Reusable workflows |
| metric:signal-rate-* | Repo vault | Per-project process metrics |
| process:* | Default vault | Process tuning is cross-cutting |

### Ambiguity Heuristic

When the concept prefix does not match any row above, ask: "Would this memory be useful in a completely different repo?"

- **Yes** -> write to default vault
- **No** -> write to repo vault

## Dependent Artifacts

The global rule `~/.claude/rules/vault-guard.md` mirrors the Write Routing Heuristic table above and adds a PreToolUse prompt hook for runtime enforcement. If the write routing table changes here, update the global rule manually to keep them in sync.