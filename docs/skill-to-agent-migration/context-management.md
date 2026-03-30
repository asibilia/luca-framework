# Context Management

MuninnDB operation budget, recall quality analysis, vault routing verification, fallback assessment, session isolation strategy, and context file delineation.

---

## MuninnDB Operation Budget

### Per-Pipeline Estimate (3 phases, Agent()-based)

| Category                       | Per Phase             | 3 Phases                 | Pipeline Total                                          |
| ------------------------------ | --------------------- | ------------------------ | ------------------------------------------------------- |
| Orchestrator init/progress     | --                    | --                       | 10-12 writes                                            |
| lu-cognition startup           | 3 reads               | --                       | 3 reads                                                 |
| Agent recalls (7 agents/phase) | 15-20 reads           | 45-60 reads              | 45-60 reads                                             |
| Agent observations             | 7-14 writes           | 21-42 writes             | 21-42 writes                                            |
| lu-learner extraction          | 4-6 reads + 3-8 links | 12-18 reads + 9-24 links | 12-18 reads + 9-24 links                                |
| lu-learner cleanup             | 1-3 forgets           | 3-9 forgets              | 3-9 forgets                                             |
| **Total**                      |                       |                          | **~60-81 reads, 31-54 writes, 9-24 links, 3-9 forgets** |

**Estimated total: 103-168 MuninnDB operations per 3-phase pipeline.**

For a COMPLEX 10-phase session: **~350-560 operations.**

**Rate limit risk: LOW.** MuninnDB is a local service with no documented rate limits. The bottleneck is MCP tool call latency, not API limits.

---

## Recall Quality Assessment

### Critical Finding: No Concept-Prefix Filtering

MuninnDB recall does **semantic search across ALL memories in the vault**, not prefix-filtered search. The `muninn_recall` API does not accept a `concept_prefix` parameter.

**Implications:**

- A query for "session context for phase 230" returns session:_ entries IF semantically relevant, BUT ALSO pattern:_, metric:_, decision:_ entries that mention phase execution
- With 21 session entries (7 agents x 3 observations), the 8th agent's recall works **if the context query is specific enough**
- Noise risk increases with vault size (180+ permanent memories + 20+ session entries)

### Recall Modes

MuninnDB supports 4 modes:

| Mode     | Threshold | Usage                                             |
| -------- | --------- | ------------------------------------------------- |
| semantic | 0.3       | Most recalls (high-precision)                     |
| recent   | 0.2       | Recency-biased                                    |
| balanced | defaults  | No override                                       |
| deep     | 0.1       | Exhaustive graph traversal (milestone-prune only) |

The codebase consistently uses `mode: "semantic"` — appropriate for targeted queries.

### Recall Depth Gating

From `.planning/config.json` complexity matrix:

| Complexity | recallDepth      | Effect                                       |
| ---------- | ---------------- | -------------------------------------------- |
| TRIVIAL    | 1                | Project identity only                        |
| SIMPLE     | 1                | Project identity + session context (1 entry) |
| MODERATE   | 3                | All three recall operations                  |
| COMPLEX    | null (unlimited) | Full recall                                  |
| CRITICAL   | null (unlimited) | Full recall                                  |

**Note:** The muninndb-context-pattern.md adds behavioral interpretations beyond the numeric limits. The actual behavior depends on lu-cognition's implementation of `recallDepth`.

---

## Vault Routing Verification

Every proposed MuninnDB operation was verified against the vault-routing rule:

| Operation                | Concept                   | Vault                 | Correct? |
| ------------------------ | ------------------------- | --------------------- | -------- |
| Orchestrator init        | session:init              | repo (luca-framework) | YES      |
| Orchestrator progress    | session:progress          | repo                  | YES      |
| Agent observations       | session:code-observations | repo                  | YES      |
| Agent candidate patterns | session:candidate-pattern | repo                  | YES      |
| Agent candidate pitfalls | session:candidate-pitfall | repo                  | YES      |
| Brain tree recall        | brain:project-identity    | repo                  | YES      |
| Pattern recall           | patterns for {domain}     | default               | YES      |
| Promoted patterns        | pattern:\*                | default               | YES      |
| Promoted pitfalls        | pitfall:\*                | default               | YES      |
| Session cleanup          | session:\* forget         | repo                  | YES      |

### Runtime Guard Gap

The vault-guard rule is a **prompt-level enforcement** — no programmatic runtime rejection exists. If an agent writes `pattern:*` to the repo vault, MuninnDB accepts it. The Agent() prompt template must explicitly include vault routing in the `<memory_protocol>` section.

---

## Fallback Adequacy

### File-Based Fallback: THEORETICAL, NOT TESTED

The muninndb-context-pattern.md describes fallback to STATE.md / config.json / context files when MuninnDB is unavailable. Assessment:

- **No code implements MuninnDB unavailability detection.** All specs simply call `muninn_recall()` with no try/catch.
- lu-cognition handles EMPTY results ("No brain data") but not MuninnDB UNAVAILABILITY.
- MuninnDB unavailability causes MCP tool errors. Without explicit fallback instructions in the prompt, sub-agent behavior is unpredictable.

### Agent() Filesystem Access

Sub-agents CAN access `/tmp/` files — confirmed. Agent() provides full tool suite (Read, Write, Edit, Bash, Grep, Glob, MCP tools). The `/tmp/lu-context.json` fallback is technically viable.

### Recommendation

Add explicit fallback instructions to every Agent() prompt:

```
If MuninnDB is unavailable (MCP tool error), fall back to:
- .planning/STATE.md for workflow state
- .planning/config.json for configuration
- /tmp/lu-context.json for accumulated results
Proceed with available context rather than failing.
```

---

## Context Files vs. MuninnDB: Clear Delineation

| Data Type                     | Storage                  | Why                                                            |
| ----------------------------- | ------------------------ | -------------------------------------------------------------- |
| State machine transitions     | Context files            | Deterministic, schema-validated, consumed by enforcement hooks |
| Sub-skill completion tracking | Context files            | Structured, used for gap detection                             |
| Session findings              | MuninnDB                 | Semantic, cross-agent, needs recall by relevance               |
| Candidate patterns/pitfalls   | MuninnDB                 | Semantic, promoted by lu-learner                               |
| Project identity              | MuninnDB                 | Long-lived, hierarchical tree                                  |
| Cross-cutting patterns        | MuninnDB (default vault) | Cross-project semantic recall                                  |

### Keep Both

Context files and MuninnDB serve complementary purposes:

- **Context files** = WHAT HAS BEEN DONE (structural completeness). Read synchronously by enforcement hooks.
- **MuninnDB** = WHAT WAS LEARNED (semantic findings). Read via semantic recall.

Both store "phase 230 complete" but in different forms:

- Context file: `{ "phase_execute_waves": { "waves_executed": 3, "status": "complete" } }` — structural
- MuninnDB: `"Phase 230 complete, discovered factory function pattern"` — semantic

**Do not eliminate context files.** Enforcement hooks need synchronous file reads, not async semantic search.

---

## Session Isolation Strategy

### The Problem

Two `/lu` sessions write to the same MuninnDB vault with `session:*` prefix. No session ID in concept = cross-session contamination.

### Recommended: Timestamp-Based Isolation

MuninnDB supports `since` (ISO 8601 timestamp) on `muninn_recall`. This is the most practical isolation mechanism:

1. **Session init:** Record start time

   ```
   SESSION_START=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

2. **Seed session:** Include timestamp in content

   ```
   muninn_remember(vault: "luca-framework", concept: "session:init",
     content: "Session started: {SESSION_START}. Task: ...")
   ```

3. **Agent() prompts:** Include timestamp for filtered recall

   ```xml
   <memory_protocol>
   When recalling session context, use since: "{SESSION_START}" to filter:
   mcp__muninn__muninn_recall(vault: 'luca-framework',
     context: ['session context for current phase'],
     since: '{SESSION_START}')
   </memory_protocol>
   ```

4. **Cleanup:** Recall session entries created since start, forget each by ID

### Why Not Concept-Prefix Session ID?

Embedding session ID in concept (`session:{ID}:init`) would make cleanup easier, but MuninnDB recall does NOT support concept-prefix filtering — it only does semantic search. This approach would NOT help with recall isolation.

### Context File Concurrency

Use session-scoped paths: `/tmp/lu-context-{SESSION_ID}.json`, or use the existing `.claude/.session-lock` pattern.

---

## MuninnDB API Corrections

The grounding review identified systematic API signature errors in the existing muninndb-context-pattern.md. These must be corrected:

| Issue                          | Current (incorrect)            | Correct                                                            |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------ |
| `muninn_recall_tree` parameter | `id: "brain:project-identity"` | `root_id: "{ULID}"` — must first recall the ULID for the concept   |
| `muninn_recall` context type   | `context: "string"`            | `context: ["string1", "string2"]` — array of strings               |
| `muninn_forget` wildcard       | `id: "session:*"`              | Individual ULID-based forget calls — recall entries first, iterate |

These corrections affect every Agent() prompt template that includes the `<memory_protocol>` section.

---

## Sources

- `src/skills/__schemas/context-cli.ts` — Context file CLI
- `src/skills/__schemas/lu-context.schemas.ts` — lu context schema
- `src/agents/general/lu-cognition.agent.ts` — Recall depth implementation
- `src/agents/general/lu-learner.agent.ts` — Session cleanup patterns
- `src/agents/__helpers/embedding-recall.ts` — Composite scoring (7 weighted signals)
- `.planning/config.json` — Complexity matrix with recallDepth
- `.claude/rules/vault-routing.md` — Write routing table
- `.claude/rules/complexity-gating.md` — Recall depth per complexity
