---
phase: 133
plan: 133-02
status: complete
result: research
---

# Summary: Evaluate normalizing JSON blob fields

## Overall Recommendation

**Keep as-is.** Normalizing JSON blob fields would harm this architecture more than it helps. SpacetimeDB has no JOIN support, the system is single-user, and every JSON field is either opaque-blob-read-whole or has a dynamic/variable schema. The cost of normalization (multiple table lookups, manual fan-out, schema rigidity) outweighs the marginal integrity gains.

## Field Catalog

| Field              | Table              | Stores                                                                                                   | Size                                         | Frequency                                    | Queried?                                                  | Recommendation |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | -------------- |
| `contextJson`      | WorkflowState      | Full XState context (phase, complexity, session_id, ticket_id, oversight, etc.)                          | ~500B-2KB                                    | Low (state transitions only)                 | No -- read as whole blob, client-side parsed              | **Keep as-is** |
| `detailsJson`      | LedgerEntries      | Serialized full LedgerEntry (state transitions, event_data, context)                                     | ~200B-1KB                                    | Medium (per state transition)                | No -- parsed client-side in useLedger hook                | **Keep as-is** |
| `checksJson`       | HarnessResults     | Array of CheckResult objects (name, status, exitCode, errors[], warnings[], rawOutput, duration)         | ~2KB-20KB (depends on error output)          | Low (per harness run, singleton upsert)      | No -- parsed client-side in useHarnessResult hook         | **Keep as-is** |
| `checkpointJson`   | IterationRecords   | Serialized iteration checkpoint (convergence signals, error fingerprints)                                | ~200B-1KB                                    | Low (per iteration record append)            | No -- not consumed by observer hooks                      | **Keep as-is** |
| `checkpointJson`   | SuspendCheckpoints | Full SuspendCheckpoint (phase_id, wave_index, completed_task_ids, working_memory_snapshot, suspended_at) | ~500B-5KB (includes working memory snapshot) | Very low (only on phase suspension)          | No -- loaded as whole blob by loadSuspendCheckpoint       | **Keep as-is** |
| `planJson`         | SessionPlans       | Full SessionPlan (generated_at, items[] with WSJF scores, rationale)                                     | ~1KB-10KB (depends on item count)            | Low (singleton upsert per planning phase)    | No -- parsed whole in usePlanning hook                    | **Keep as-is** |
| `resultJson`       | TribunalResults    | Full TribunalResult (phase, totals, disagreements, rebuttals, findings counts, debate token cost)        | ~200B-500B                                   | Very low (singleton upsert per tribunal run) | No -- parsed whole in useTribunal hook                    | **Keep as-is** |
| `brainJson`        | MemoryFiles        | Serialized BRAIN.md content (project identity markdown)                                                  | ~1KB-5KB                                     | Low (singleton upsert on memory sync)        | No -- read whole in useMemory hook, displayed as markdown | **Keep as-is** |
| `memoryJson`       | MemoryFiles        | Serialized MEMORY.md content (long-term learning entries markdown)                                       | ~2KB-20KB                                    | Low (singleton upsert on memory sync)        | No -- read whole in useMemory hook                        | **Keep as-is** |
| `workingJson`      | MemoryFiles        | Serialized WORKING.md content (session working memory markdown)                                          | ~500B-5KB                                    | Medium (updated during active session)       | No -- read whole in useMemory hook                        | **Keep as-is** |
| `proceduresJson`   | MemoryFiles        | Serialized PROCEDURES.md content (procedure entries markdown)                                            | ~1KB-10KB                                    | Low (singleton upsert on memory sync)        | No -- read whole in useMemory hook                        | **Keep as-is** |
| `metricsJson`      | Metrics            | Aggregated metrics snapshot (arbitrary key-value structure)                                              | ~200B-2KB                                    | Low (singleton upsert)                       | No -- parsed as Record<string, unknown> in useMetrics     | **Keep as-is** |
| `configJson`       | WorkflowConfig     | Full .planning/config.json (harness, hooks, workflow settings)                                           | ~1KB-5KB                                     | Very low (singleton, set once per session)   | No -- read whole by createFreshActor                      | **Keep as-is** |
| `alternativesJson` | DecisionLogs       | Array of alternative approach strings considered during a decision                                       | ~100B-500B                                   | Low (per logged decision)                    | No -- parsed as string[] in useDecisionTrail              | **Keep as-is** |

## Rationale

### 1. SpacetimeDB Has No JOIN Support

This is the decisive constraint. Normalizing a JSON blob into child rows requires retrieving the parent, then separately querying each child table. Without JOINs, this means N+1 query patterns with manual fan-out on the client. SpacetimeDB's query model is optimized for single-table reads with index lookups and subscriptions -- not relational joins.

### 2. No Sub-field Querying Happens

Every JSON field in the schema follows the same access pattern: **write whole, read whole, parse client-side**. The observer hooks (`usePlanning`, `useTribunal`, `useHarnessResult`, `useLedger`, `useMemory`, `useMetrics`, `useDecisionTrail`) all use `safeJsonParse()` to deserialize the entire blob and render it. No field is ever filtered or queried at the sub-field level within SpacetimeDB.

### 3. Singleton Tables Dominate

8 of the 14 JSON fields live in singleton tables (WorkflowState, HarnessResults, SessionPlans, TribunalResults, MemoryFiles, Metrics, WorkflowConfig). These are upserted in-place with id=1. Normalizing a singleton into parent + children adds table proliferation with zero queryability benefit.

### 4. Schemas Are Dynamic/Variable

Several fields store data with variable shapes:

- `metricsJson` is typed as `Record<string, unknown>` -- fully dynamic
- `contextJson` is the full XState context, which evolves with machine changes
- `configJson` mirrors the user's `.planning/config.json`, which has optional/extensible sections
- `checksJson` stores an array of CheckResult objects where `errors[]` and `warnings[]` have variable lengths
- Memory files (`brainJson`, `memoryJson`, etc.) store serialized markdown -- not structured data

Normalizing these would require either rigid schemas that break on evolution or generic key-value tables that lose all type safety.

### 5. Write Frequency Is Low

The hottest JSON write paths are:

- `detailsJson` on LedgerEntries: one per state transition (~10-50 per session)
- `workingJson` on MemoryFiles: updated during active work
- `checkpointJson` on IterationRecords: one per convergence iteration

None of these represent high-throughput paths where blob size impacts write performance.

### 6. Data Integrity Is Maintained at the Application Layer

All JSON blobs are validated before write:

- Producer side: Zod schemas validate before `callReducer()` (e.g., `suspendCheckpointSchema.parse()`, `ledgerEntrySchema.parse()`)
- Consumer side: `safeJsonParse()` with typed fallbacks, plus Zod `safeParse()` in hooks like `useHarnessResult`

SpacetimeDB column-level constraints (e.g., foreign keys, check constraints on JSON sub-fields) do not exist, so normalization would not add database-level integrity checks.

### 7. Payload Sizes Are Small

The largest blobs are `checksJson` (~20KB worst case with verbose error output) and memory files (~20KB). These are well within SpacetimeDB's string column limits and do not cause performance issues for the single-user workload.

## When to Reconsider

Normalization should be revisited if:

1. **SpacetimeDB adds JOIN support** -- relational queries across normalized tables become practical
2. **Multi-user scaling** -- concurrent access patterns may benefit from finer-grained rows
3. **Sub-field querying is needed** -- e.g., "find all harness results where typecheck failed" at the DB level
4. **Blob sizes grow significantly** -- e.g., if checksJson regularly exceeds 100KB
5. **Real-time sub-field subscriptions** -- e.g., observer wants to subscribe to just one check result within checksJson rather than the whole blob

None of these conditions currently apply.
