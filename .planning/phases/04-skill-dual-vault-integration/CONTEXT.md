# Phase 04 Context: Skill Dual-Vault Integration

## Decisions

### 1. Vault Resolution Mechanism [researched]

**Decision:** All MuninnDB operations resolve vault name from `config.json` `muninn.vault` field. The repo vault (e.g., "luca-framework") is used for project-specific memories; the "default" vault is used for cross-cutting memories.

**Implementation:**

- Agent/skill prompt text replaces hardcoded `vault: "default"` with instructions to read vault from config
- lu-cognition already loads config.json — extend to extract `muninn.vault` and pass to all MuninnDB calls
- For agents that don't read config directly: the orchestrating skill passes the vault name as context
- Fallback chain: `config.json muninn.vault` → `LUCA_MUNINN_VAULT` env var → `"default"`

**Key insight:** Agent/skill files are prompt templates compiled to markdown. The vault references are instructions to Claude, not executable code. The fix is updating prompt text to reference config rather than hardcoding "default".

### 2. Dual-Vault Recall Strategy [researched]

**Decision:** Type-based vault routing with merged scoring for lu-cognition recall.

| Memory Type                         | Vault Source                | Rationale                                  |
| ----------------------------------- | --------------------------- | ------------------------------------------ |
| brain:project-identity              | Repo vault only             | Project-specific identity tree             |
| brain:user-identity                 | Default vault only          | Cross-project user preferences             |
| session:\*                          | Repo vault only             | Session context is project-scoped          |
| pattern:_, pitfall:_, preference:\* | Both vaults, merge by score | Cross-cutting knowledge + project-specific |
| procedure:\*                        | Both vaults, merge by score | Reusable across projects                   |
| metric:\*                           | Repo vault only             | Project metrics are scoped                 |

**Merge strategy:** Two sequential `muninn_recall` calls (repo vault first, then default), concatenate results, sort by relevance score, deduplicate by concept prefix (keep highest-scored).

### 3. Write Routing Heuristic [researched]

**Decision:** Concept-prefix-based routing determines write destination.

| Concept Prefix         | Write To                                | Rationale                          |
| ---------------------- | --------------------------------------- | ---------------------------------- |
| session:\*             | Repo vault                              | Session context is project-scoped  |
| version:_, milestone:_ | Repo vault                              | Release history is project-scoped  |
| brain:project-\*       | Repo vault                              | Project identity                   |
| brain:user-\*          | Default vault                           | User identity is cross-cutting     |
| pattern:\*             | Default vault (unless project-specific) | Generalizable patterns             |
| pitfall:\*             | Default vault (unless project-specific) | Generalizable warnings             |
| preference:\*          | Default vault                           | User preferences are cross-cutting |
| procedure:\*           | Default vault                           | Reusable workflows                 |
| metric:signal-rate-\*  | Repo vault                              | Per-project process metrics        |
| process:\*             | Default vault                           | Process tuning is cross-cutting    |

**Heuristic for ambiguous cases:** "Would this memory be useful in a completely different repo?" If yes → default vault. If no → repo vault.

### 4. Scope of Changes

**20 files** need updates, grouped by change type:

**Major changes (dual-vault logic):**

- `lu-cognition.agent.ts` — Dual-vault recall with merged scoring
- `lu-learner.agent.ts` — Write routing heuristic

**Config reference updates (vault: "default" → read from config):**

- `lu-executor.agent.ts`
- `lu-discuss-researcher.agent.ts`
- `lu.skill.ts`
- `seed-memory.skill.ts`
- `outcome.skill.ts`
- `phase-plan.skill.ts`
- `phase-execute.skill.ts`
- `phase-discuss.skill.ts`
- `autopilot.skill.ts`
- `milestone-complete.skill.ts`
- `profile-import.skill.ts`
- `profile-export.skill.ts`
- `session-plan.skill.ts`
- `progress.skill.ts`
- `quick.skill.ts`
- `debug.skill.ts`

**New instructions (global):**

- Add vault resolution instructions to global CLAUDE.md or a new rule

## Deferred Ideas

None — scope is well-defined by roadmap.
