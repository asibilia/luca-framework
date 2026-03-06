---
phase: 127
phase_name: SpacetimeDB Data Integrity
total_plans: 3
waves: 2
status: planned
---

# Phase 127: SpacetimeDB Data Integrity

## Overview

This phase fixes data integrity issues in SpacetimeDB tables to ensure data consistency and prevent unbounded growth.

## Wave Organization

### Wave 1: TTL Cleanup
- **Plan:** 127-01
- **Todo:** #42
- **Goal:** Implement TTL cleanup for high-volume tables (observer_events, token_usage)

### Wave 2: Data Integrity Fixes (Parallel)
Two independent plans that can be executed in parallel:

1. **127-02 (#43)**: Fix sequence number race condition in LedgerEntries
2. **127-03 (#48)**: Add unique constraints to singleton tables

## Plans Summary

| Plan | Wave | Todo | Tasks | Type |
|------|------|------|-------|------|
| 127-01 | 1 | #42 | 3 | TTL Cleanup |
| 127-02 | 2 | #43 | 2 | Race Condition Fix |
| 127-03 | 2 | #48 | 2 | Schema Constraints |

## Dependencies

```
127-01 (Wave 1) ← Independent
    ↓
┌────────────────────┐
│ 127-02 (Wave 2)    │ ← Parallel execution
│ 127-03 (Wave 2)    │
└────────────────────┘
```

## Execution Order

1. Execute 127-01 (Wave 1) - TTL cleanup implementation
2. Execute 127-02 and 127-03 in parallel (Wave 2) - Data integrity fixes

## Expected Outcomes

- Automatic cleanup prevents unbounded table growth
- Sequence numbers remain unique under concurrent writes
- Singleton tables enforce single-row invariant
- Improved SpacetimeDB data integrity and performance

## Complexity

**Phase Complexity:** TRIVIAL
- No research required
- No plan verification required
- Well-defined fixes with clear acceptance criteria
