---
title: Implement checkpoint and rollback system for execution
area: workflow
created: 2026-02-10
source: research (iterative refinement patterns)
---

## Context

Current execution is forward-only: execute plan → verify → if gaps, plan fixes → execute fixes. There's no ability to checkpoint before risky operations and rollback if they fail. Research shows checkpoint-based iteration is a key pattern: "Every action creates a checkpoint. Try risky approaches; if they fail, rewind and try differently."

This is especially important for the Ralph Wiggum iterative loop — each iteration should be able to rollback to a known-good state if it makes things worse.

## Task

1. **Design checkpoint system** — Git-based checkpoints (tags or stash) at key workflow points:
   - Before each plan execution
   - Before each wave
   - Before code review fixes
   - Before gap closure execution
2. **Implement rollback capability** — If verification fails or quality degrades, revert to last checkpoint
3. **Add checkpoint metadata** — Track what was attempted, why it failed, and what to try differently
4. **Integrate with Ralph Wiggum loop** — Each iteration starts from a checkpoint; if iteration N is worse than N-1, rollback
5. **Design partial rollback** — Rollback specific plans within a wave without affecting others
6. **Add checkpoint pruning** — Clean up old checkpoints after successful verification

## Notes

- Git already provides the mechanism (tags, stash, reset); we just need workflow integration
- Checkpoint metadata feeds into MEMORY.md as "what didn't work" (negative learning)
- This enables more aggressive experimentation — try bold approaches knowing you can undo
- The reflexion pattern (Act → Observe → Reflect → Improve) needs rollback to be effective
- Consider using git worktrees for truly isolated experimentation
- Pairs with writer/reviewer separation — reviewer can trigger rollback if quality is insufficient
