---
title: "Audit Findings Persistence & Retrieval System"
area: observability
created: 2026-03-04T23:15:00Z
source: conversation
priority: p1
---

## Context

When code review swarms (dx-advocate, code-simplifier, code-architect, security-auditor, etc.) or milestone audits produce detailed findings, the reports consume most of the remaining context window. Before the findings can be acted on, conversation compaction occurs, losing critical detail — file paths, line numbers, specific issues, suggested fixes. This wastes the ROI of the review swarm and degrades execution quality.

## Task

Build a structured audit findings persistence layer using SpacetimeDB so that review findings survive context compaction and can be retrieved as full-fidelity, actionable work items.

**Solution**: Persist structured audit findings to SpacetimeDB as review agents produce them (write at source). After compaction or at any later point, retrieve findings from SpacetimeDB to create grouped tasks and pull per-file details during execution. The DB becomes the source of truth for findings, making compaction invisible.

### Architecture Flow

```
Review Agent produces finding
  → callReducer("append_audit_finding", { structured row })
  → continues building prose summary for human readability

Post-review retrieval
  → SELECT * FROM audit_findings WHERE session_id = ? AND status = 'pending'
  → Group by file_path or category
  → TaskCreate per group with summary + DB query hint

Executor works on task
  → SELECT * FROM audit_findings WHERE file_path = ? AND status = 'pending'
  → Gets full-fidelity details (line range, description, suggested fix)
  → Addresses findings, marks each 'resolved' via update_finding_status reducer
```

### Deliverables

#### 1. SpacetimeDB Schema — `audit_findings` table

New table in `packages/luca-spacetime/spacetimedb/src/schema.ts`:

| Column           | Type              | Description                                                               |
| ---------------- | ----------------- | ------------------------------------------------------------------------- |
| id               | u64 (PK, autoInc) | Row ID                                                                    |
| session_id       | string            | Session that produced the finding                                         |
| phase            | string            | Phase/milestone context (e.g., "phase-113")                               |
| source_agent     | string            | Which reviewer (dx-advocate, security-auditor, code-architect, etc.)      |
| severity         | string            | critical / high / medium / low / info                                     |
| category         | string            | security, performance, dx, architecture, style, correctness, etc.         |
| file_path        | string            | File where the issue was found                                            |
| line_start       | u64               | Start line (0 if not applicable)                                          |
| line_end         | u64               | End line (0 if not applicable)                                            |
| finding          | string            | Detailed description of the issue (the part that gets lost in compaction) |
| suggested_fix    | string            | What the reviewer recommends changing                                     |
| context_snippet  | string            | Relevant code snippet or surrounding context                              |
| status           | string            | pending / in_progress / resolved / dismissed / wont_fix                   |
| resolution_notes | string            | How/why the finding was resolved or dismissed                             |
| created_at       | u64               | Timestamp when finding was persisted                                      |
| resolved_at      | u64               | Timestamp when finding was resolved (0 if pending)                        |

Indexes:

- `audit_findings_session_id` on `session_id` (btree) — query all findings for a session
- `audit_findings_file_path` on `file_path` (btree) — query findings for a specific file during execution
- `audit_findings_status` on `status` (btree) — query pending/resolved counts

#### 2. SpacetimeDB Reducers

Add to `packages/luca-spacetime/spacetimedb/src/index.ts`:

- **`append_audit_finding`** — Insert a new finding row. Takes all columns except `id` (auto-inc), `status` (defaults to "pending"), `resolution_notes` (defaults to ""), `resolved_at` (defaults to 0).
- **`update_finding_status`** — Update status of a single finding by ID. Takes `findingId: u64`, `status: string`, `resolutionNotes: string`, `resolvedAt: u64`. Used by executor to mark findings resolved.
- **`bulk_dismiss_findings`** — Dismiss all findings matching a session + optional category filter. For when a review's findings are superseded or no longer relevant.

After adding table and reducers, regenerate client bindings: `spacetime generate --lang typescript --out-dir <bindings-dir> --module-path <module-path>`

#### 3. Client-Side Helpers — `packages/luca-framework/src/state/__helpers/audit-findings.ts`

New helper module following existing patterns in `observer-emitter.ts`:

- **`persistFinding(params)`** — Wraps `callReducer("append_audit_finding", {...})`. Fire-and-forget with retry. Parameters match the table schema. This is what review agents call.
- **`queryPendingFindings(sessionId, filters?)`** — Queries SpacetimeDB: `SELECT * FROM audit_findings WHERE session_id = ? AND status = 'pending'`. Optional filters for severity, category, source_agent. Falls back to empty array if SpacetimeDB unavailable.
- **`queryFindingsForFile(filePath, sessionId?)`** — Queries findings scoped to a specific file. Used by executors during task work. Returns findings ordered by severity DESC, line_start ASC.
- **`markFindingResolved(findingId, resolutionNotes?)`** — Calls `update_finding_status` reducer with status='resolved' and current timestamp.
- **`markFindingDismissed(findingId, reason)`** — Calls `update_finding_status` reducer with status='dismissed'.
- **`getFindingsSummary(sessionId)`** — Returns aggregate counts: `{ total, pending, resolved, dismissed, bySeverity: { critical: N, high: N, ... }, byCategory: { ... } }`. Used for progress tracking and reporting.

Export these from the state barrel (`packages/luca-framework/src/state/index.ts`).

#### 4. Review Agent Integration

Update review agent definitions in `src/agents/` to instruct them to persist findings. Each review agent's prompt/system instructions should include:

- After identifying each finding, call `persistFinding()` with structured data
- Continue building the prose report as before (for human readability in conversation)
- The prose report becomes a summary/digest; the DB holds the full detail
- Include `source_agent` matching the agent's name (e.g., "dx-advocate", "security-auditor")

Agents affected: dx-advocate, code-simplifier, code-architect, security-auditor, tailwind-auditor, and any future review agents.

#### 5. Post-Review Retrieval Helper — `packages/luca-framework/src/state/__helpers/findings-to-tasks.ts`

New module that bridges DB findings to the Luca workflow:

- **`createTasksFromFindings(sessionId, options?)`** — Queries all pending findings, groups them (by file_path by default, optionally by category or severity), and returns structured task descriptors.
- Grouping strategies: `by-file` (default), `by-severity`, `by-category`, `by-agent`
- Each task description includes a note: "Full finding details available via `queryFindingsForFile('path')`"
- This function is called by the orchestrator after review completes, or after compaction when resuming work

#### 6. Executor Integration

When an executor agent picks up a task that references audit findings:

- Before starting work on a file, call `queryFindingsForFile(filePath)` to get full-fidelity details
- Work through each finding: apply fix, verify, then call `markFindingResolved(findingId, notes)`
- If a finding is invalid or not applicable, call `markFindingDismissed(findingId, reason)`

#### 7. Progress Tracking & Reporting

- **During execution**: `getFindingsSummary(sessionId)` provides real-time progress
- **Cross-session**: Findings persist across sessions — if work is suspended and resumed, pending findings are still queryable
- **Dashboard**: The `audit_findings` table is queryable from the SpacetimeDB dashboard

#### 8. Pre-Compaction Safety Net (Optional Enhancement)

The existing `context-monitor` hook (Stop event) could be enhanced to check for unstructured review results in conversation and trigger a persistence sweep before compaction.

### Implementation Order

1. SpacetimeDB schema + reducers (table definition, 3 reducers)
2. Generate client bindings
3. Client-side helpers (audit-findings.ts)
4. Post-review retrieval helper (findings-to-tasks.ts)
5. Review agent prompt updates (all 5+ agents)
6. Executor integration (query + resolve workflow)
7. Testing: end-to-end flow with a mock review → compaction → retrieval → execution
8. Optional: context-monitor safety net enhancement

### Success Criteria

- Review findings survive compaction with zero detail loss
- Post-compaction executors can retrieve full finding details (file, line, description, suggested fix)
- Findings are tracked through resolution with status updates in SpacetimeDB
- Progress is visible: pending/resolved/dismissed counts available at any time
- No changes to the review agents' output quality — they still produce prose reports for human readability
- Graceful degradation: if SpacetimeDB is unavailable, review agents still work (findings just aren't persisted)

## Notes

- Follows the same dual-write pattern as existing state/memory persistence (SpacetimeDB + local fallback)
- Uses existing `callReducer()` and `queryTable()` infrastructure from `observer-emitter.ts` and `spacetimedb-client.ts`
- The `audit_findings` table follows the same auto-increment + append pattern as `ledger_entries`, `observer_events`, etc.
- Related: existing `notes` table could potentially be extended, but a dedicated `audit_findings` table is preferred for schema clarity and query specificity
