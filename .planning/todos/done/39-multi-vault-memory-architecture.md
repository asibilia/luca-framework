---
title: "Multi-vault MuninnDB architecture: default vault for cross-cutting, repo vaults for project-specific"
area: framework/memory
created: 2026-03-12
source: discussion
priority: P1
complexity: COMPLEX
milestone: v5.0.0
---

## Context

We've started using multiple MuninnDB vaults for different repositories, but the vault boundaries and recall/write strategies aren't formalized. Currently most memories for luca-framework live in the "default" vault alongside cross-cutting learnings. This blurs the line between project-specific and universal knowledge.

**MuninnDB engram:** `decision:multi-vault-memory-architecture` (ID: 01KKHA5QSH6P1EWNB794FDSGKK)

## Design

### Vault Roles

| Vault         | Contains                                   | Examples                                                                                                       |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `default`     | Cross-cutting learnings useful in any repo | User preferences, general tool pitfalls (zod-v4-nested-default), workflow process decisions, user profile/role |
| `{repo-name}` | Repo-specific memories                     | Project identity, architecture decisions, session history, phase results, codebase conventions                 |

### Brain Tree Split

- **Project brain** (repo vault): project identity, architecture, stack, codebase conventions
- **User brain** (default vault): user preferences, workflow preferences, tool preferences, role/profile

### Recall Strategy (Option C + merged scoring)

Scoped by memory type, with merged deduped results when querying both:

| Memory Type                       | Vault(s) Queried                                          |
| --------------------------------- | --------------------------------------------------------- |
| Project identity, session history | Repo vault only                                           |
| Patterns, pitfalls, preferences   | Both vaults (merged by score, deduped, top-N)             |
| Decisions                         | Repo vault primarily, default for cross-cutting decisions |
| Procedures                        | Both vaults                                               |

### Write Routing Heuristic

**"Would this memory be useful in a different repository?"**

- Yes → default vault
- No → repo vault

## Task

### 1. Migration (luca-framework memories out of default vault)

- Recall all luca-framework-specific memories from default vault (project identity, session history, phase results, milestone completions, architecture decisions, repo-specific patterns)
- Recreate in luca-framework vault via `muninn_remember_batch` (up to 50 per call)
- Re-establish entity relationships and links in new vault
- Soft-delete originals from default vault (`muninn_forget` — recoverable via `muninn_restore`)
- Rebuild brain tree fresh in luca-framework vault (project brain only)
- Create user brain tree in default vault (user preferences, workflow preferences)

### 2. Skill/Agent Updates

- Update recall instructions in skills to implement scoped dual-vault recall strategy
- Update write instructions to use the routing heuristic
- Update `lu-cognition` pre-flight to recall from both vaults with type-scoped strategy
- Update `lu-learner` to route new learnings to correct vault

### 3. CLI: `luca-bridge init-vault`

Add a new `luca-bridge` subcommand for initializing a MuninnDB vault for the current repo:

```
cd ~/Github/some-project
luca-bridge init-vault
```

**Behavior:**

- Detect repo name from git remote or directory name
- Research MuninnDB admin API for programmatic vault creation and API key generation (currently done manually via web UI — admin API surface is unknown)
- Create a new vault in the local MuninnDB instance
- Generate an API key scoped to that vault
- Write vault name to `.planning/config.json` (`muninn.vault` field)
- Display the API key in console with instructions for adding it to `.env` files
- **Idempotent:** If vault already exists, detect it and display "vault already configured" message with current config

**Depends on:** Researching MuninnDB admin REST API (vault CRUD, key generation endpoints)

### 4. Infrastructure

- Update global CLAUDE.md vault selection instructions to reflect multi-vault strategy
- Update `.planning/config.json` schema if needed for vault configuration
- Consider a shared helper/pattern for dual-vault recall that skills can reuse

## Notes

- MuninnDB has no cross-vault move operation; migration is read → recreate → soft-delete
- `muninn_remember_batch` supports up to 50 engrams per call for efficient bulk migration
- Soft-deletes are recoverable — low risk migration
- Entity relationships and tree structures (`is_part_of`) don't transfer automatically and must be rebuilt
- Existing vault infrastructure (`LUCA_MUNINN_VAULT` env var, config.json `muninn.vault`, `.env` override) already supports per-repo vaults — this task formalizes the strategy
