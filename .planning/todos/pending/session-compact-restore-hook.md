---
title: Implement SessionStart restore hook for post-compaction context recovery
area: hooks
created: 2026-03-13
source: conversation
priority: high
complexity: MODERATE
---

## Context

After compaction completes, Claude Code fires a `SessionStart` event with matcher `compact`. This is the deterministic restore point where we re-inject the checkpoint saved by the PreCompact hook. This is the second half of the checkpoint-and-restore architecture (Decision 1 + Decision 3 from `docs/memory-system/decisions.md`).

## Why

Without post-compact restore, the LLM resumes with only the compaction summary — which paraphrases and loses critical details like exact task position, specific decisions made, and the next planned action. The restore hook injects the checkpoint via `systemMessage`, giving the LLM precise context about where it was and what to do next.

## Task

### Create Restore Hook

Create `src/hooks/scripts/session-compact-restore.sh`:

1. Detect SessionStart event with `source: "compact"` from stdin JSON
2. Read latest `session:checkpoint` from MuninnDB via HTTP GET to `http://127.0.0.1:8476/api/v1/recall`
3. If MuninnDB unavailable, fall back to `.planning/.context-checkpoint.json`
4. Format checkpoint as structured systemMessage (~1KB max):
   ```
   [Context Restored] You were working on Phase {X}: {name}. Task {N} of {M}.
   Goal: {goal}. Approach: {approach}.
   Key decisions: {decisions}.
   Completed: {summary}.
   Next step: {next_action}.
   ```
5. Output via JSON `{"systemMessage": "..."}` to stdout
6. Clean up: remove `.planning/.context-checkpoint.json` after successful restore

### Register Hook

Update `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": ".claude/hooks/session-compact-restore.sh",
        "matcher": "compact",
        "timeout": 10000
      }
    ]
  }
}
```

Note: This is a DIFFERENT SessionStart hook from the existing `session-start.sh` — it only fires on the `compact` matcher, not on new sessions.

## Acceptance Criteria

- Hook fires only after compaction (not on fresh sessions)
- Checkpoint is read from MuninnDB (primary) or filesystem (fallback)
- systemMessage is under 1KB
- systemMessage includes: position, goal, approach, decisions, next step
- LLM can resume work immediately after restore without asking "where were we?"
- Existing `session-start.sh` hook is unaffected

## Dependencies

- `precompact-checkpoint-hook` todo must be completed first (need checkpoint data to restore)
- `update-hook-schemas-18-events` todo must be completed first

## References

- `docs/memory-system/decisions.md` — Decision 3: Layered Restore
- `src/hooks/scripts/session-start.sh` — existing SessionStart hook (different matcher)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — SessionStart compact matcher

## Notes

Keep systemMessage under 1KB. For deeper context recovery, users can invoke the `/context-restore` skill (separate todo). This hook handles the automatic, zero-effort case.
