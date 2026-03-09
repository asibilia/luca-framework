---
title: "Automatic session memory cleanup on session end"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (pipeline-auditor)
priority: P1
complexity: SIMPLE
---

## Context

The Muninn memory audit found that session:\* engrams created during workflow are NEVER cleaned up unless lu-learner explicitly runs and gets to its cleanup step. If a workflow is abandoned, halted, or crashes, stale session context persists in MuninnDB forever and pollutes future sessions.

Pipeline auditor findings:

- session-persist.sh has ZERO MuninnDB operations
- No final context snapshot written on session end
- No session engagement summary
- Old session:\* engrams from previous workflows aren't graduated to permanent memory

## Task

1. Add session cleanup to `src/hooks/scripts/session-persist.sh`:
   - Check if lu-learner has already run this session (check for learning extraction marker)
   - If NOT: call `mcp__muninn__muninn_forget(vault: "default", id: "session:*")` for engrams older than 24h
   - If YES: no action needed (lu-learner already cleaned up)
2. Add a "session summary" engram before cleanup:
   - Write `session:summary-{date}` with workflow type, phases completed, findings count
   - This prevents total data loss from abandoned sessions
3. Consider adding a startup check in session-start.sh:
   - On session start, check for stale session:\* engrams
   - If found from previous session, log warning and offer cleanup

Files to modify:

- `src/hooks/scripts/session-persist.sh` — add cleanup logic
- `src/hooks/scripts/session-start.sh` — add stale session check

## Notes

- Quick win: 2-3 hours effort
- Part of Muninn Memory Audit Tier 2 recommendations
- Prevents unbounded session context growth in MuninnDB vault
- Related: #90 (session digest helps with what to preserve)
