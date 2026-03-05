---
title: "P2: Add stall detection and retry limits to verification loop"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P2
---

## Context

The workflow machine has a verify → execute → verify retry loop but no limit on iterations. If verification keeps failing, the machine retries indefinitely without user notification or escalation.

## Task

1. Add `verification_attempts` counter to XState context
2. Add guard: `context.verification_attempts < MAX_RETRIES` (suggest 3)
3. After max retries, transition to `paused` state (human intervention needed)
4. Record halt reason in ledger
5. Add test for stall detection behavior

## Notes

- Related to todo #35 (phase actor hang risk)
- Both issues share the theme: unbounded retry without escalation
- MAX_RETRIES should be configurable via `.planning/config.json`
