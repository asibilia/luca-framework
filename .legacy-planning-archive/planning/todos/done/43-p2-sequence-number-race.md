---
title: "P2: Fix sequence number race condition in ledger"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer)
priority: P2
---

## Context

Ledger sequence numbers use an in-memory cache (`_nextSeq` variable). In concurrent scenarios, two simultaneous `appendLedgerEntry()` calls could both read the same sequence number, creating duplicates.

## Task

1. Review `packages/luca-framework/src/state/ledger.ts:61-123`
2. Either:
   a. Move sequence number management to SpacetimeDB (server-side auto-increment)
   b. Add a lock mechanism (Bun.Semaphore or similar)
   c. Use atomic compare-and-swap pattern
3. Add concurrent append test

## Notes

- Current pattern: `if (_nextSeq !== null) { const seq = _nextSeq; _nextSeq = seq + 1; return seq; }`
- Concurrent calls can both read same value before increment
- Low probability in practice (Bun is single-threaded) but still a correctness issue
