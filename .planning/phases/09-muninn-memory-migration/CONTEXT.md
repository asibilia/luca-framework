# Phase 09 Context: MuninnDB Memory Migration

## Gray Area 1: Storage Mapping

### BRAIN.md → MuninnDB Hierarchical Tree

**Decision:** Convert BRAIN.md to a MuninnDB tree using `muninn_remember_tree`. Root node `brain:project-identity` with children for stack, conventions, architecture, preferences.

**Rationale:** BRAIN.md is inherently hierarchical (sections → subsections → items). Trees preserve this structure natively. `muninn_recall_tree` retrieves the full identity in one call.

### MEMORY.md → Atomic Engrams

**Decision:** Each MEMORY.md entry becomes an individual engram via `muninn_remember`. Type tags differentiate: `pattern:*`, `decision:*`, `pitfall:*`, `preference:*`.

**Rationale:** Memory entries are independent facts with varying relevance. Atomic storage enables semantic recall by context — MuninnDB scores relevance per-engram rather than loading a monolithic file.

### WORKING.md → Session-Scoped Engrams

**Decision:** Working memory moves entirely to MuninnDB as `session:*` engrams. Session-scoped — auto-forgotten or consolidated on session end.

**Rationale:** No file I/O overhead. MuninnDB's temporal decay handles cleanup. Session context is queryable during the session via `muninn_recall`.

### Procedures → Hierarchical Trees

**Decision:** Each procedure becomes a tree root (`procedure:git-commit-flow`) with steps as children. Execution stats stored as metadata on the root node.

**Rationale:** MuninnDB docs confirm trees are designed for "outlines, plans, and task hierarchies." `muninn_recall_tree` retrieves the full procedure with steps in one call.

## Gray Area 2: Integration Pattern

### Agent/Skill ↔ MuninnDB Interface

**Decision:** Direct MCP calls. No bridge layer, no abstraction. Agents and skills call `mcp__muninn__*` tools directly.

**Rationale:** User preference for simplicity. Avoids maintaining a wrapper layer. MuninnDB's MCP interface is the API — no need to abstract it further.

### Vault Strategy

**Decision:** Single vault ("default"). All project memory in one vault. Entity types and tags handle categorization.

**Rationale:** Simpler recall — one vault to query. MuninnDB's entity system (types, tags, links) provides sufficient organization without vault-level partitioning.

### Entity Naming Convention

**Decision:** Type-prefixed with colon separator: `brain:languages`, `pattern:bun-over-node`, `procedure:git-commit-flow`, `session:current-task`.

**Rationale:** Clear type identification at a glance. Colon separator is conventional for namespacing. Works well with `muninn_find_by_entity` searches.

### Recall Strategy

**Decision:** Semantic recall (`muninn_recall`) for all queries. Let MuninnDB handle relevance scoring.

**Rationale:** Simplest approach. MuninnDB's semantic engine handles relevance for all data types uniformly. No need for different query modes per data type.

## Gray Area 3: Migration Scope

### Scope

**Decision:** Full replace. Delete all 23 memory helper files. BRAIN.md, MEMORY.md, WORKING.md no longer exist as files. Everything lives in MuninnDB.

**Rationale:** Clean break. No dual-maintenance. Aligns with user preference for "situational memory over static files."

### Memory Bridge CLI

**Decision:** Remove entirely. The 11 bridge CLI commands (`handleReadMemory`, `handleReadWorking`, etc.) are deleted. Skills call MuninnDB MCP directly.

**Rationale:** Consistent with "direct MCP calls" integration decision. No dead abstraction layer.

### Token Estimation & Context Monitoring

**Decision:** Remove. `token-estimator.ts` and `context-monitor.ts` are deleted.

**Rationale:** MuninnDB handles memory lifecycle natively (temporal decay, consolidation, enrichment). Context monitoring was needed for file-based memory sizing — no longer relevant.

### Custom Semantic Search

**Decision:** Remove. `semantic-search.ts` (TF-IDF, cosine similarity) is deleted.

**Rationale:** MuninnDB provides native semantic recall via `muninn_recall` and `muninn_similar_entities`. Custom TF-IDF implementation is redundant.

## Gray Area 4: Backward Compatibility

### Consumer Updates

**Decision:** All consuming skills/agents updated in-phase. Phase 9 is a complete cutover — no intermediate broken state.

**Rationale:** Aligns with "full replace" scope. Staged updates would create a period of dual-system complexity with temporary breakage.

### Initial Data Seeding

**Decision:** Migration skill (`/seed-memory`). Reads existing .md files (BRAIN.md, MEMORY.md, WORKING.md, procedures/) and creates MuninnDB entities. Reusable for other projects adopting MuninnDB. Idempotent.

**Rationale:** More useful than a one-time script. Other projects can use the same skill when migrating to MuninnDB.

### src/memory/ Domain

**Decision:** Remove entirely. Delete the domain. Memory is fully external via MuninnDB MCP. No source code manages memory.

**Rationale:** With all helpers, schemas, bridge, token estimation, and semantic search removed, the domain has no remaining purpose. Convention constants (type prefixes) can live in `src/shared/` if needed.

### Root Barrel Exports

**Decision:** Remove all ~60 memory exports from `index.ts`. Compilation errors are intentional — forces all consumers to migrate to MuninnDB MCP calls.

**Rationale:** Clean break. No dead exports. Compilation errors serve as a migration checklist.

## Summary of Deletions

| Item                   | Files                                    | Reason                                     |
| ---------------------- | ---------------------------------------- | ------------------------------------------ |
| Memory schemas         | `src/memory/__schemas/memory.schemas.ts` | Replaced by MuninnDB entity structure      |
| 23 helper files        | `src/memory/__helpers/*.ts`              | All functionality replaced by MuninnDB MCP |
| Memory barrel          | `src/memory/index.ts`                    | Domain removed                             |
| Memory bridge commands | 11 CLI handlers in `bridge.ts`           | Direct MCP calls replace bridge            |
| Token estimation       | `token-estimator.ts`                     | MuninnDB handles lifecycle                 |
| Context monitoring     | `context-monitor.ts`                     | MuninnDB handles lifecycle                 |
| Semantic search        | `semantic-search.ts`                     | MuninnDB native recall                     |
| BRAIN.md               | File                                     | Data lives in MuninnDB tree                |
| MEMORY.md              | File                                     | Data lives as MuninnDB engrams             |
| WORKING.md             | File                                     | Data lives as session-scoped engrams       |
| procedures/            | Directory                                | Data lives as MuninnDB trees               |

## Key MuninnDB MCP Tools Used

| Tool                    | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `muninn_remember`       | Store individual engrams (patterns, decisions, session context) |
| `muninn_remember_tree`  | Store hierarchical data (BRAIN, procedures)                     |
| `muninn_recall`         | Semantic recall for all queries                                 |
| `muninn_recall_tree`    | Retrieve full trees (project identity, procedures)              |
| `muninn_find_by_entity` | Look up specific entities by concept name                       |
| `muninn_forget`         | Clean up session-scoped engrams on session end                  |
| `muninn_evolve`         | Update existing engrams with new information                    |
| `muninn_link`           | Create relationships between engrams                            |
| `muninn_session`        | Track session context                                           |
| `muninn_where_left_off` | Session resume (replaces session-resume reading WORKING.md)     |

## User Preferences Captured

- "Keep AGENTS and CLAUDE files lean — rely more on situational memory for context optimization"
- Strong preference for MuninnDB as primary knowledge store over static files
- Preference for simplicity: direct MCP, single vault, semantic-only recall
- Full replace over gradual migration
