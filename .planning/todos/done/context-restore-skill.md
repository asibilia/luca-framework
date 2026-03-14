---
title: Create /context-restore skill for on-demand deep context recovery
area: skills
created: 2026-03-13
source: conversation
priority: medium
complexity: MODERATE
---

## Context

The SessionStart restore hook (Layer 1) provides automatic, lightweight recovery (~1KB systemMessage). But after explicit `/clear` or when the user wants richer context, a dedicated skill provides Layer 2 recovery: hub-and-spoke expansion from MuninnDB with full semantic recall of related patterns, decisions, and pitfalls.

This is Decision 3, Layer 2 from `docs/memory-system/decisions.md`.

## Why

The automatic hook restore is necessarily compact (~1KB). Sometimes the user needs deeper recovery — understanding not just "where was I" but "what patterns apply here", "what pitfalls to avoid", and "what decisions were already made in similar situations." This is the on-demand complement to the automatic hook.

## Task

### Create Skill

Create `src/skills/general/context-restore.skill.ts`:

1. **Recall checkpoint** from MuninnDB:
   - Query `session:checkpoint` from repo vault (`luca-framework`)
   - If no checkpoint, inform user and offer to read `.planning/STATE.md` instead

2. **Hub-and-spoke expansion**:
   - Extract keywords from checkpoint (phase name, goal, approach)
   - Perform semantic recall from MuninnDB (both vaults — repo + default)
   - Recall related patterns (`pattern:*`), decisions (`decision:*`), pitfalls (`pitfall:*`)
   - Use 7-signal composite scoring (same as lu-cognition)
   - Cap at 5-7 related engrams

3. **Present restored context**:

   ```markdown
   ## Context Restored

   ### Checkpoint (from MuninnDB)

   - Position: Phase {X}, Task {N}/{M}
   - Goal: {goal}
   - Approach: {approach}
   - Next step: {next_action}

   ### Key Decisions

   - {decision}: {rationale}

   ### Related Memory (semantic recall)

   - [pattern:X] {summary} (score: 0.85)
   - [decision:Y] {summary} (score: 0.78)
   - [pitfall:Z] {summary} (score: 0.72)

   ### Completed Work

   - {completed_summary}
   ```

4. **Source attribution**: Each recalled engram shows its concept ID and relevance score

### Register Skill

- Add to skill index so it's discoverable via `/context-restore`
- Set `disable-model-invocation: true` (skill provides the prompt, not a model call)

## Acceptance Criteria

- `/context-restore` is invocable as a skill
- Reads checkpoint from MuninnDB (repo vault)
- Falls back gracefully if no checkpoint exists
- Performs hub-and-spoke semantic recall (both vaults)
- Presents structured, attributed context to the LLM
- Related engrams are scored and ranked
- Total output is under 3KB (to avoid consuming too much fresh context)

## Dependencies

- `precompact-checkpoint-hook` — needs checkpoints to exist in MuninnDB
- Existing MuninnDB infrastructure must be running

## References

- `docs/memory-system/decisions.md` — Decision 3: Layered Restore (Layer 2)
- `docs/memory-system/decisions.md` — Decision 2: Hub-and-Spoke Pattern
- `src/skills/general/session-resume.skill.ts` — similar skill pattern to follow
- `src/agents/general/lu-cognition.agent.ts` — 7-signal composite scoring reference
- `packages/luca-observer/lib/muninn-config.ts` — MuninnDB REST client reference

## Notes

This skill is the manual counterpart to the automatic SessionStart restore hook. Users invoke it when they want deeper context than the automatic 1KB injection provides. It complements Layer 3 (lu-cognition pre-flight) which handles fresh sessions.
