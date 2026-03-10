---
title: Fix MuninnDB orphan ratio — add memory linking to lu-learner and workflow-save
area: memory
created: 2026-03-09T12:00:00Z
source: conversation
priority: P0
---

## Context

MuninnDB orphan ratio has risen to 86.2% — 56 of 65 memories have no links to other memories. The entity graph (39 nodes, 109 edges) is healthy, but the memory-to-memory graph is nearly flat. This cripples graph traversal (hop depth 2 finds nothing), Hebbian learning (nothing to strengthen), and deep recall (86% of memories invisible to traversal).

## Root Cause Analysis

Three memory write paths exist, zero create links:

| Write Path        | File                                                              | Links?                                 | Impact                                                  |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| **Emitter**       | `packages/luca-framework/src/emitter/__helpers/emit-functions.ts` | Never (fire-and-forget by design)      | Lifecycle events — low-value for graph                  |
| **lu-learner**    | `src/agents/general/lu-learner.agent.ts`                          | **No linking step exists**             | Patterns/decisions/pitfalls — HIGH value, no links      |
| **workflow-save** | `src/skills/general/workflow-save.skill.ts`                       | Step 5 documents linking, LLM skips it | Batch memories — medium value, instructions ineffective |
| **phase-execute** | `src/skills/general/phase-execute.skill.ts` (inline)              | Never                                  | Session findings — medium volume                        |

### Key Findings

1. **lu-learner** (biggest offender): Step 7 `write_memory` stores engrams via `muninn_remember` but has zero instructions to link them. Line 444 says "Links related engrams automatically" — this is aspirational, not real.

2. **workflow-save**: Step 5 has detailed linking documentation (relation types, priorities, examples) but it's structured as a "nice to have." The executing LLM consistently skips it because it comes after the batch store and there's no hard gate.

3. **Emitter**: Fire-and-forget by design. Each `emitXxx()` function creates an isolated engram. Acceptable for lifecycle events but contributes to orphan count.

## Task

### Change 1 — lu-learner: Add linking step after write_memory (HIGH impact)

In `src/agents/general/lu-learner.agent.ts`, add a new `<step name="link_memories">` between `write_memory` and `clear_working`:

- After each `muninn_remember` call, recall related existing memories for the concept just stored
- Link the new memory to the top 2-3 semantic matches using `muninn_link`
- Use `learned_from` relation to connect to the phase/session that produced the learning
- Use `relates_to` to connect to other patterns/decisions/pitfalls in the same domain
- Include explicit `muninn_link` tool call examples in the step

### Change 2 — workflow-save: Make Step 5 non-optional (MEDIUM impact)

In `src/skills/general/workflow-save.skill.ts`:

- Add a hard gate: "Do NOT proceed to Step 6 until links are created"
- Replace documentation-style instructions with an explicit numbered procedure
- Add concrete `muninn_link` tool call examples with IDs from Step 4's batch response
- Add minimum link count requirement: "Create at least N links where N = number of memories stored"

### Change 3 (optional) — One-time consolidation pass

Run `muninn_consolidate` on existing orphaned memories to bring the current ratio down. This is a one-time cleanup, not a workflow change.

## Verification

- After implementing Changes 1 and 2, run a full phase-execute cycle
- Check `muninn_status` — orphan ratio should decrease
- Check `muninn_export_graph` — memory-to-memory edges should appear
- Target: orphan ratio below 40% within 2-3 workflow cycles

## Notes

- The emitter path is acceptable as-is — lifecycle events are high-volume, low-value for graph traversal
- The entity co-occurrence graph IS healthy (109 edges) — the problem is specifically memory-to-memory links
- MuninnDB config: Hebbian learning enabled, PAS enabled, graph hop depth 2, temporal decay enabled — all of these features are underutilized due to orphan ratio
- Related todo: `95-close-learning-loop-apply-measure-refine.md` (learning loop depends on graph quality)
