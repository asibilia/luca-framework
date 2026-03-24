# Concept Prefix Extensions

New MuninnDB concept prefixes introduced by v2 for research-originated engrams, their relationship to existing prefixes, vault routing, and lifecycle rules.

## Existing Concept Prefixes (Unchanged)

v2 preserves all existing concept prefixes. These continue to work exactly as documented in the vault-routing rule (`src/rules/general/vault-routing.rule.ts`):

| Prefix            | Vault   | Purpose                                | Written By                                                                                                    |
| ----------------- | ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `session:*`       | REPO    | Session-scoped working memory          | lu-cognition, lu-executor, all agents                                                                         |
| `brain:project-*` | REPO    | Project identity tree                  | lu-cognition, seed-memory                                                                                     |
| `brain:user-*`    | DEFAULT | User identity and preferences          | lu-cognition, seed-memory                                                                                     |
| `pattern:*`       | DEFAULT | Validated implementation patterns      | lu-learner                                                                                                    |
| `pitfall:*`       | DEFAULT | Validated warnings and anti-patterns   | lu-learner                                                                                                    |
| `decision:*`      | DEFAULT | Architectural and technology decisions | lu-learner (NOTE: not in vault-routing rule yet -- see [Migration Considerations](#migration-considerations)) |
| `preference:*`    | DEFAULT | User and project preferences           | lu-cognition, profile-import                                                                                  |
| `procedure:*`     | DEFAULT | Reusable multi-step workflows          | lu-learner                                                                                                    |
| `metric:*`        | REPO    | Process metrics and signal rates       | lu-process-data                                                                                               |
| `process:*`       | DEFAULT | Process tuning parameters              | lu-process-data                                                                                               |
| `version:*`       | REPO    | Release history                        | milestone-complete                                                                                            |
| `milestone:*`     | REPO    | Milestone summaries                    | milestone-complete                                                                                            |

## New Research-Specific Prefixes

v2 introduces six new concept prefixes under the `research:` namespace. All are REPO-vault-scoped and phase-specific.

| Prefix                  | Vault | Purpose                                            | Example Concept                        |
| ----------------------- | ----- | -------------------------------------------------- | -------------------------------------- |
| `research:approach-*`   | REPO  | Validated implementation approaches                | `research:approach-ws-reconnect`       |
| `research:api-*`        | REPO  | API surfaces and usage patterns                    | `research:api-bun-websocket`           |
| `research:pitfall-*`    | REPO  | Research-identified pitfalls (pre-execution)       | `research:pitfall-ws-memory-leak`      |
| `research:constraint-*` | REPO  | Version, compatibility, or environment constraints | `research:constraint-bun-ws-version`   |
| `research:decision-*`   | REPO  | Research-grounded decisions with evidence          | `research:decision-ws-library-choice`  |
| `research:pattern-*`    | REPO  | Implementation patterns discovered during research | `research:pattern-exponential-backoff` |

### Naming Convention

Concept names follow the pattern `research:{type}-{kebab-case-topic}`:

```
research:approach-ws-reconnect
         ^^^^^^^  ^^^^^^^^^^^^
         type     topic (kebab-case)
```

**Type** is one of: `approach`, `api`, `pitfall`, `constraint`, `decision`, `pattern`.

**Topic** should be:

- Descriptive enough to distinguish from other engrams of the same type
- Short enough to be readable in a PLAN.md research ref list
- Kebab-case (consistent with project file naming convention)

### Content Format

Every `research:*` engram follows a consistent content structure:

```
{Concise finding description in 1-3 sentences.}
{Key implementation detail, constraint, or warning in 1-2 sentences.}
Source: {URL or "research analysis"} | Confidence: {HIGH|MEDIUM}
Phase: {phase number} | Graduated: {date}
```

The `Phase:` and `Graduated:` metadata enables lifecycle management (cleanup after milestone completion).

## Why Separate From Existing Prefixes?

The `research:*` namespace is deliberately separate from the existing `pattern:*`, `pitfall:*`, and `decision:*` namespaces. This separation serves three purposes:

### 1. Lifecycle Distinction

```
research:* engrams                      pattern:*/pitfall:* engrams
+---------------------------+           +---------------------------+
| Phase-scoped              |           | Permanent                 |
| Created during graduation |           | Created by lu-learner     |
| May be cleaned up after   |           | Persist across sessions   |
|   milestone completion    |           | Never auto-cleaned        |
| Pre-execution context     |           | Post-execution knowledge  |
+---------------------------+           +---------------------------+
           |                                       ^
           | promotion (by lu-learner              |
           |  after verification passes)           |
           +---------------------------------------+
```

`research:*` engrams are **pre-execution hypotheses** -- they represent what the research phase believes is true, but execution has not yet validated. `pattern:*` and `pitfall:*` engrams are **post-execution knowledge** -- they represent what lu-learner extracted after verification confirmed the approach worked (or failed).

### 2. Recall Precision

When an executor recalls `research:approach-ws-reconnect`, it gets findings from the current phase's research. If these findings were mixed into the general `pattern:*` namespace, recall would also return patterns from previous phases and projects, diluting precision.

```
Recall query: "WebSocket reconnection approach"

research:* namespace (REPO vault only):
  -> research:approach-ws-reconnect (THIS phase's research)

pattern:* namespace (BOTH vaults):
  -> pattern:websocket-connection-pooling (from a different project)
  -> pattern:exponential-backoff-general (from a previous phase)
  -> pattern:bun-serve-websocket (from project identity)
```

By scoping to `research:*`, the executor gets the precise finding it needs without noise from cross-cutting patterns.

### 3. Promotion Signal

When lu-learner runs after verification (Step 10), it can identify `research:*` engrams that were validated by execution and promote them:

```
research:approach-ws-reconnect  -->  pattern:ws-reconnect-exponential-backoff
  (phase-scoped, REPO vault)          (permanent, DEFAULT vault)

research:pitfall-ws-memory-leak -->  pitfall:ws-unbounded-queue-oom
  (phase-scoped, REPO vault)          (permanent, DEFAULT vault)
```

The promotion is explicit and auditable. lu-learner creates a new engram in the permanent namespace and links it back to the research origin.

## Vault Routing

All `research:*` engrams are written to the REPO vault. The rationale:

1. **Project-scoped**: Research findings are specific to the current project's technology stack and architecture. A finding about "Bun WebSocket API" is not useful in a Python project.

2. **Phase-scoped**: Research findings reference specific phase goals and constraints. They lose context outside the project.

3. **Temporary**: Research engrams may be cleaned up after milestone completion. Only the DEFAULT vault holds permanent cross-cutting knowledge.

### Updated Routing Tables

**Write Routing (additions in bold):**

| Concept Prefix             | Target Vault | Rationale                                  |
| -------------------------- | ------------ | ------------------------------------------ |
| session:\*                 | REPO         | Session context is project-scoped          |
| version:_, milestone:_     | REPO         | Release history is project-scoped          |
| brain:project-\*           | REPO         | Project identity                           |
| metric:signal-rate-\*      | REPO         | Per-project process metrics                |
| **research:approach-\***   | **REPO**     | **Phase-scoped implementation approaches** |
| **research:api-\***        | **REPO**     | **Phase-scoped API patterns**              |
| **research:pitfall-\***    | **REPO**     | **Phase-scoped pitfall warnings**          |
| **research:constraint-\*** | **REPO**     | **Phase-scoped constraints**               |
| **research:decision-\***   | **REPO**     | **Phase-scoped grounded decisions**        |
| **research:pattern-\***    | **REPO**     | **Phase-scoped implementation patterns**   |
| pattern:\*                 | DEFAULT      | Generalizable patterns                     |
| pitfall:\*                 | DEFAULT      | Generalizable warnings                     |
| preference:\*              | DEFAULT      | User preferences are cross-cutting         |
| brain:user-\*              | DEFAULT      | User identity is cross-cutting             |
| procedure:\*               | DEFAULT      | Reusable workflows                         |
| process:\*                 | DEFAULT      | Process tuning is cross-cutting            |

**Recall Routing (additions in bold):**

| Memory Type                         | Vault Source                | Rationale                          |
| ----------------------------------- | --------------------------- | ---------------------------------- |
| brain:project-identity              | REPO only                   | Project-specific identity tree     |
| brain:user-identity                 | DEFAULT only                | Cross-project user preferences     |
| session:\*                          | REPO only                   | Session context is project-scoped  |
| **research:\***                     | **REPO only**               | **Phase-scoped research findings** |
| pattern:_, pitfall:_, preference:\* | Both vaults, merge by score | Cross-cutting + project-specific   |
| procedure:\*                        | Both vaults, merge by score | Reusable across projects           |
| metric:\*                           | REPO only                   | Project metrics are scoped         |

## Relationship to Existing Prefixes: Visual Map

```
+------------------------------------------------------------------+
|  DEFAULT VAULT (permanent, cross-cutting)                        |
|                                                                  |
|  pattern:*    pitfall:*    decision:*    preference:*             |
|  procedure:*  process:*    brain:user-*                          |
|                                                                  |
|       ^              ^              ^                             |
|       |              |              |                             |
|   promotion      promotion      promotion                        |
|   (lu-learner)   (lu-learner)   (lu-learner)                     |
|       |              |              |                             |
+-------+--------------+--------------+----------------------------+
        |              |              |
+-------+--------------+--------------+----------------------------+
|  REPO VAULT (project-scoped)                                     |
|                                                                  |
|  research:pattern-*  research:pitfall-*  research:decision-*     |
|  research:approach-* research:api-*      research:constraint-*   |
|                                                                  |
|  session:*  brain:project-*  metric:*  version:*  milestone:*    |
|                                                                  |
+------------------------------------------------------------------+
```

The REPO vault holds both the temporary `research:*` engrams and the permanent project identity. The DEFAULT vault holds only permanent, cross-cutting knowledge. Promotion moves knowledge from REPO to DEFAULT.

## Lifecycle Rules

### Creation

`research:*` engrams are created exclusively by the lu-research-graduator agent during Step 6 of the workflow. No other agent writes to the `research:*` namespace.

### Recall

`research:*` engrams are recalled during:

- **Step 7 (Plan)**: Planner uses them to write research refs into PLAN.md tasks
- **Step 9 (Execute)**: Executors recall specific engrams via research refs
- **Step 10 (Verify + UAT)**: lu-learner reads them for promotion candidates

### Promotion

After execution and verification, lu-learner evaluates each `research:*` engram:

- If the approach was validated by execution: promote to `pattern:*` or `decision:*` in DEFAULT vault
- If a pitfall was confirmed: promote to `pitfall:*` in DEFAULT vault
- If the finding was not used or was invalidated: do not promote

### Cleanup

After milestone completion (configurable):

- `research:*` engrams that were NOT promoted are candidates for cleanup
- `research:*` engrams that WERE promoted are safe to clean up (the promoted version persists in DEFAULT vault)
- Cleanup uses `muninn_forget` scoped to the `research:*` namespace in the REPO vault

See [lifecycle.md](lifecycle.md) for the full lifecycle diagram.

## Migration Considerations

### Existing Projects

Projects already using MuninnDB will not have `research:*` engrams. The v2 pipeline creates them only when the graduation step runs. Existing `pattern:*`, `pitfall:*`, and `decision:*` engrams are unaffected.

### vault-guard Rule Update

The global vault-guard rule (`~/.claude/rules/vault-guard.md`) and the project vault-routing rule (`src/rules/general/vault-routing.rule.ts`) will need to be updated to include:

1. **`research:*`** -- new prefix, route to REPO vault
2. **`decision:*`** -- existing prefix used by lu-learner but not yet in the vault-routing rule's write routing table. Route to DEFAULT vault (generalizable decisions are cross-cutting, consistent with `pattern:*` and `pitfall:*`). Project-scoped decisions live as `research:decision-*` in REPO vault until promoted.

Both rules must be updated before v2 graduation code is deployed, or the vault-guard pre-tool-use hook will flag these writes as misrouted.

### Config Schema Extension

The `.planning/config.json` schema should be extended with the graduation configuration block under `research.graduation`. See [graduation-model.md](graduation-model.md) for the proposed config structure. All config keys use camelCase per Decision 9 in CANONICAL-DECISIONS.md.

## Related Documentation

- [graduation-model.md](graduation-model.md) -- How findings are scored and distilled
- [per-task-recall.md](per-task-recall.md) -- How executors recall research engrams
- [lifecycle.md](lifecycle.md) -- Full lifecycle from creation to cleanup
- [Vault Routing Rule](../../../../.claude/rules/vault-routing.md) -- Current vault routing tables
