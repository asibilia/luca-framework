# Workflow Canvas: SpacetimeDB v2 QA Strategy

> **Author:** QA Lead (AI agent)
> **Date:** 2026-03-26
> **Status:** Approved — SpacetimeDB v2 confirmed by founder as non-negotiable

---

## 1. SpacetimeDB Durability Testing (5 test cases)

### TC-DUR-1: Process Kill During Reducer Write

Kill SpacetimeDB mid-batch-save (5 nodes). Restart. Verify either all 5 committed or only completed reducers committed. No corrupted rows. No orphaned edges.

### TC-DUR-2: Process Kill During Run Step Updates

Kill SpacetimeDB during execution wave 2 (nodes 4-6 running). Restart. Verify completed steps (1-3) have valid output. In-flight steps are `running` or `pending`, never `completed` with empty output.

### TC-DUR-3: Network Disconnection During Subscription

Disconnect network while editing. Add 2 nodes while offline. Reconnect. Verify queued reducer calls replay and SpacetimeDB state matches local state (all 5 nodes present).

### TC-DUR-4: Concurrent Editing (Two Tabs)

Two tabs move same node to different positions within 500ms. Both tabs converge to same final position (last-write-wins). No flickering.

### TC-DUR-5: Concurrent Node Deletion Race

Tab 1 deletes Node-Y. Tab 2 edits Node-Y within 500ms. Node-Y is deleted. Tab 2 sees deletion via subscription. All connected edges cascade-deleted. Toast: "Node was deleted in another session."

## 2. Subscription Reliability Testing (4 test cases)

### TC-SUB-1: High-Frequency Position Updates

50-node workflow. Drag node for 10 seconds. Jotai updates at 60fps. SpacetimeDB receives ~50 updates (200ms debounce). No event queue backup. Final position matches.

### TC-SUB-2: Rapid Execution Status Updates

25-node workflow completes in 10 seconds (~75 status changes). All arrive in correct order per node. UI transitions match. Total cost matches SUM(cost_micros).

### TC-SUB-3: Browser Sleep/Wake

Close laptop 5 minutes. Open. SDK reconnects. Full state re-sync within 3 seconds. No stale data. Changes made during sleep by other sessions appear.

### TC-SUB-4: Subscription Scoping

10 workflows open in 10 tabs. Edits to workflow 1 do NOT trigger subscription events in tabs 2-10. Each tab only sees its own updates.

## 3. Data Integrity Testing (5 test cases)

### TC-INT-1: Serialization Round-Trip

15-node workflow with mixed types, nested metadata, Unicode names. Save → close → reopen. Every field identical including float positions and null values.

### TC-INT-2: JSON Export → Delete → Import Round-Trip

Export workflow → validate against WorkflowExportSchema → delete from SpacetimeDB → import → verify identical graph structure with new UUIDs. **LAUNCH BLOCKER.**

### TC-INT-3: Cost Aggregation (Integer Arithmetic)

20 completed RunSteps. `SUM(cost_micros) === RunMetrics.total_cost_micros` — exact equality. Also verify token and step count aggregation.

### TC-INT-4: Edge Cascade on Node Deletion

Delete Node-Z with 5 connected edges. All 5 edges deleted. No orphaned edge references.

### TC-INT-5: Version Immutability

Attempt to add/modify nodes in a published version. Reducer rejects both operations.

## 4. Security Testing (5 test cases)

### TC-SEC-1: Private Table Access Control

User B attempts to read User A's `provider_config`. All queries return empty. Subscription delivers zero rows.

### TC-SEC-2: Identity-Based Workflow Isolation

User B queries User A's workflows. Subscription to User A's nodes returns zero rows. Delete reducer with User A's node ID is rejected or no-op.

### TC-SEC-3: API Key Not in Subscription Data

Export workflow. Inspect all subscription payloads. Grep for `sk-`, `key-`, `gsk_`. Zero matches in export and subscription data.

### TC-SEC-4: Encrypted Key Verification

Store key "sk-test-1234567890". Read provider_config row. Stored value is AES-256-GCM ciphertext (base64). Raw key NOT present.

### TC-SEC-5: Subscription Query Injection

Attempt `SELECT * FROM node WHERE version_id = '' OR 1=1 --`. SpacetimeDB rejects. No data leakage.

## 5. Updated Acceptance Criteria

### Modified from Original

| #     | Criterion          | Updated for SpacetimeDB                                                                        |
| ----- | ------------------ | ---------------------------------------------------------------------------------------------- |
| AC-4  | Persistence        | Subscription re-sync delivers complete state within 2 seconds of page load                     |
| AC-8  | No data loss       | All completed reducer calls are durable. Queued but unsent reducers replay on reconnect        |
| AC-11 | JSON export        | Works even if SpacetimeDB is temporarily unreachable (from local cache). No API keys in export |
| AC-12 | JSON import        | Creates new SpacetimeDB rows via reducers. UUID remapping preserves edge relationships         |
| AC-16 | Execution viz      | SpacetimeDB subscription delivers RunStep changes within 100ms of reducer commit               |
| AC-20 | Tab close survival | Results stored in SpacetimeDB. Subscription on return delivers final state without polling     |

### New SpacetimeDB-Specific Criteria

| #     | Criterion                  | Pass Condition                                                                           |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------- |
| AC-S1 | Subscription reconnection  | After >5s disconnect, auto-reconnect and deliver complete state within 3 seconds         |
| AC-S2 | Concurrent tab consistency | Two tabs converge to identical state within 2 seconds of last edit                       |
| AC-S3 | Reducer failure handling   | UI shows error toast and queues for retry. No silent data loss                           |
| AC-S4 | Private table enforcement  | provider_config rows NEVER visible to non-owning identities                              |
| AC-S5 | Offline fallback           | If SpacetimeDB unreachable on load, show "Connecting..." not crash. Cached data viewable |
| AC-S6 | Backup export fidelity     | Full round-trip: SpacetimeDB → export → delete → import → identical graph                |

## 6. Backup/Export Escape Hatch

### TC-BACKUP-1: Full Round-Trip Recovery (LAUNCH BLOCKER)

1. Create workflow with 12 nodes, 18 edges, 2 agent teams, 4 assignments
2. Export to JSON → validate against WorkflowExportSchema
3. Verify NO API keys in export
4. Delete EVERYTHING from SpacetimeDB for this workflow
5. Import from JSON → creates new records with new UUIDs
6. Verify: node count, edge count, team count, assignment count all match
7. Open in canvas editor → nodes render, edges connect, positions match
8. Re-export → deep-compare with original (ignoring UUIDs/timestamps)
9. All steps must pass. This is a LAUNCH BLOCKER.

### TC-BACKUP-2: Export During Active Execution

Export while workflow is running. Export succeeds. Contains graph structure only, NOT in-progress run data.

### TC-BACKUP-3: Import to Fresh SpacetimeDB Instance

Export from Instance A → import to fresh Instance B → workflow is fully functional (can open, edit, execute).

## Performance Targets (SpacetimeDB-Adjusted)

| Metric                          | 10 nodes    | 50 nodes    | 100 nodes   |
| ------------------------------- | ----------- | ----------- | ----------- |
| Save (reducer round-trip)       | < 300ms     | < 700ms     | < 1.5s      |
| Initial subscription delivery   | < 500ms     | < 1s        | < 2s        |
| Auto-reconnect after disconnect | < 3 seconds | < 3 seconds | < 3 seconds |

## Test Case Summary

**Total new test cases: 20**

- 5 durability (TC-DUR-1 through TC-DUR-5)
- 4 subscription reliability (TC-SUB-1 through TC-SUB-4)
- 5 data integrity (TC-INT-1 through TC-INT-5)
- 5 security (TC-SEC-1 through TC-SEC-5)
- 3 backup (TC-BACKUP-1 through TC-BACKUP-3, TC-BACKUP-1 is launch blocker)

These supplement the original AC-1 through AC-20 acceptance criteria.
