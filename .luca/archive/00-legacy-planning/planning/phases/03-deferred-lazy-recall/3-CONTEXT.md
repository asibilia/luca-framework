# Phase 3 Context: Deferred/Lazy Recall

## Phase Goal

Change lu-cognition to load only the brain tree at session start (~1K tokens), deferring pattern/pitfall/decision recall to the first agent that needs it via `requestMemoryContext()`. Saves 6-8K tokens on sessions that don't reach COMPLEX execution.

## Decisions

### 1. Cache Strategy

**Decision:** Global per-session cache with agent-tag filtering. [researched]

- One MuninnDB semantic recall per session (first time any agent requests memory)
- The recall result is cached in-memory for the session lifetime
- Subsequent agents receive the same cached results, filtered by their `memory_tags`
- No TTL within a session — "recall once per session" is sufficient since sessions are short-lived
- Cache key: session ID (already tracked in STATE.md and MuninnDB session engrams)

**Rationale:** Different agents have overlapping memory needs (patterns, decisions, pitfalls). A global recall with agent-specific filtering avoids redundant MCP calls while still providing relevant context. The existing `buildMemoryContextBlock()` already accepts agent-specific parameters for filtering.

### 2. eager_recall Field Placement

**Decision:** Add `eager_recall` inside `CognitionConfig` as `cognition.eager_recall: boolean`. [researched]

- Extends the existing `CognitionConfig` Zod schema: `{ default_tier, promotable_to, memory_tags, eager_recall }`
- Default: `false` (deferred recall is the new default)
- Agents that set `eager_recall: true` will have their memory loaded during lu-cognition pre-flight (current behavior)
- Agents that leave it `false` (default) will use `requestMemoryContext()` on first need

**Agent classification:**

- `eager_recall: true`: lu-planner (always benefits from decisions/patterns), lu-cognition itself
- `eager_recall: false` (default): lu-executor, lu-verifier, lu-learner, all reviewers

**Rationale:** Cognition config already groups tier, promotion, and memory tag settings. `eager_recall` is a cognition concern (when to load memory), not a context concern (what documents to include). Keeps the schema cohesive.

### 3. Fallback Behavior

**Decision:** Log warning to MuninnDB session and proceed with empty context. [researched]

- When `requestMemoryContext()` fails (MuninnDB timeout, connection error, empty results):
  1. Log a warning to console: `[MEMORY] Deferred recall failed: {reason}. Proceeding without memory context.`
  2. Record in MuninnDB session (if available): `session:findings` with `[RECALL-FAILED]` tag
  3. Return empty string (consistent with `buildMemoryContextBlock()` returning empty when no content)
- No retry — MuninnDB downtime is rare for a dev tool, and adding latency to the critical path is worse than missing context
- No local cache file fallback — adds complexity for a rare failure mode

**Rationale:** Consistent with the existing fire-and-forget pattern in `src/emitter/`. The circuit breaker in the emission layer already handles MuninnDB failures gracefully. Agents function fine without recalled memory — they just lack past context. Over-engineering resilience for a dev tool is counterproductive.

## Key Files

| File                                             | Changes                                           |
| ------------------------------------------------ | ------------------------------------------------- |
| `src/agents/__schemas/agent.schemas.ts`          | Add `eager_recall` to CognitionConfig schema      |
| `src/agents/general/lu-cognition.agent.ts`       | Slim down pre-flight to brain-tree-only default   |
| `src/shared/__helpers/memory-context-builder.ts` | Add `requestMemoryContext()` with session cache   |
| `src/shared/__helpers/recall-cache.ts`           | NEW: Session-scoped recall cache module           |
| `src/shared/index.ts`                            | Barrel re-export new function                     |
| `src/skills/general/phase-execute.skill.ts`      | Update memory context loading to use deferred API |
| `src/skills/general/phase-plan.skill.ts`         | Update memory context loading to use deferred API |

## Scope Guardrail

This phase changes WHEN memory is loaded, not WHAT is loaded. It does NOT:

- Change the brain tree structure or content
- Modify what MuninnDB stores or how engrams are organized
- Alter the memory context builder's formatting logic
- Touch the emission layer or circuit breaker
- Change the observer UI

## Deferred Ideas

- Per-agent recall context tuning (different recall queries per agent type)
- Cross-session recall caching (persist last recall to disk for faster warm-up)
- Adaptive recall depth based on phase complexity history
