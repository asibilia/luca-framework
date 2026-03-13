---
title: Implement PreCompact checkpoint hook for deterministic context preservation
area: hooks
created: 2026-03-13
source: conversation
priority: critical
complexity: MODERATE
---

## Context

When Claude Code auto-compacts (at ~83.5% context usage) or the user runs `/compact`, the conversation context is summarized and critical details can be lost. The PreCompact hook event fires deterministically before compaction with the full `transcript_path`, enabling a checkpoint-and-restore strategy.

This is Decision 1 from `docs/memory-system/decisions.md` — the cornerstone of smart context management.

## Why

Without this, every compaction risks losing: current task position, key decisions with rationale, the mental model/approach being taken, and the next planned action. This is the #1 pain point in long coding sessions with Luca.

## Task

### Phase 1A: PreCompact Checkpoint Hook

Create `src/hooks/scripts/pre-compact-checkpoint.sh`:

1. Receive PreCompact event with `transcript_path` and `trigger` (manual/auto) from stdin JSON
2. Read session state from `.planning/STATE.md` and bridge (`luca-bridge read-status`)
3. Extract recent git activity (`git log --oneline -5`, `git diff --stat`)
4. Compose 5-field MVP checkpoint (~1.5KB):
   - **Position**: phase, task number, complexity level
   - **Current Work**: goal, approach, next step
   - **Key Decisions**: decisions with rationale (from STATE.md or transcript)
   - **Completed Summary**: what's done this session
   - **Trigger**: manual vs auto (for restore behavior)
5. Write checkpoint to MuninnDB as `session:checkpoint` engram via HTTP POST to `http://127.0.0.1:8476/api/v1/remember`
6. Write fallback to `.planning/.context-checkpoint.json`
7. Run async (`async: true`) to avoid blocking compaction

### Phase 1B: Proactive Checkpointing

Update `src/hooks/scripts/context-check-throttled.sh`:

1. At 50% context (good_end zone boundary): write first proactive checkpoint to MuninnDB
2. At 70% context (degrading_end): write second checkpoint + existing warning
3. Use same 5-field format as PreCompact checkpoint
4. Throttle checkpoint writes (no more than once per 5 minutes)

### Phase 1C: Register Hooks

Update `.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "type": "command",
        "command": ".claude/hooks/pre-compact-checkpoint.sh",
        "async": true,
        "timeout": 15000
      }
    ]
  }
}
```

## Acceptance Criteria

- PreCompact hook fires before both manual `/compact` and auto-compact
- 5-field checkpoint is written to MuninnDB (`session:checkpoint` concept)
- Fallback checkpoint written to `.planning/.context-checkpoint.json`
- Proactive checkpoints fire at 50% and 70% context zones
- Hook runs async and does not block compaction
- Checkpoint is under 2KB total
- MuninnDB write uses correct vault (`luca-framework` from config)

## Dependencies

- `update-hook-schemas-18-events` todo must be completed first
- MuninnDB must be running at `http://127.0.0.1:8476`

## References

- `docs/memory-system/decisions.md` — Decision 1: PreCompact Hook + SessionStart Restore
- `docs/memory-system/decisions.md` — Decision 2: 5-Field MVP Checkpoint
- `src/hooks/scripts/context-check-throttled.sh` — existing context monitoring hook
- `src/hooks/scripts/context-monitor.sh` — existing stop hook for reference
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — PreCompact event docs

## Notes

The checkpoint principle is "store only what the codebase cannot tell you" — code is in files, history is in git. The checkpoint needs only: intent, decisions, approach, and position.
