---
title: "Introduce cache boundary in the prompt assembly pipeline (static/dynamic split)"
area: architecture
created: 2026-04-13
priority: critical
source: research
sprint: 5
---

## Task

Split the prompt assembly pipeline into a two-block system prompt with explicit cache breakpoints: a static prefix (mode instructions, hard constraints, always-apply rules) cached with a 1-hour TTL, and a dynamic suffix (workflow state, environment info, MCP instructions) refreshed per-request with a 5-minute TTL.

## Context

Claude Code splits every system prompt at `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`. Content before is cached globally across all users (1-hour TTL); content after is per-session (5-minute TTL). This achieves 85% latency reduction and 90% cost reduction on reads. It also enables fork-model subagent spawning at near-zero marginal cost — spawning 5 agents costs barely more than 1.

luca-mastracode currently assembles a single monolithic `instructions` string via `createStaticAgent()`. Every call to `instructions()` re-reads `luca-state.json` and mixes it with static instruction markdown. If any state field changes, the entire instruction prefix cache is invalidated.

## Research References

- [01-cache-boundary-design.md](../../docs/research/prompt-architecture/01-cache-boundary-design.md) — Full technical analysis of cache boundaries, micro-compaction, 5-level compression pipeline
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 2: Cache boundary pattern
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 5, item 5.1

## Implementation

### Phase A: Code Separation (no API change)

Extract dynamic state from `buildXInstructions()` into a shared `buildDynamicContext()`:

```typescript
// Static (cacheable): loaded once per mode
function buildStaticInstructions(modeId: string): string {
  return loadModeInstructions(modeId)
    + '\n\n' + HARD_CONSTRAINTS
    + '\n\n' + ALWAYS_APPLY_RULES
}

// Dynamic (per-request): changes on every turn
function buildDynamicContext(): string {
  const state = readLucaState()
  return buildWorkflowContext(state)
    + '\n\n' + buildEnvironmentContext()
}
```

### Phase B: Two-Block System Prompt (requires Mastra support)

When Mastra exposes `cache_control` support:

```typescript
system: [
  { type: 'text', text: buildStaticInstructions(modeId), cache_control: { type: 'ephemeral' } },
  { type: 'text', text: buildDynamicContext() }
]
```

### Phase C: Cache Hit Rate Monitoring

Add monitoring via API response `usage` fields:

```typescript
const cacheHitRate = usage.cache_read_input_tokens /
  (usage.cache_read_input_tokens + usage.cache_creation_input_tokens)
```

## Dependencies

- Phase A: No external dependencies. Pure refactoring.
- Phase B: Requires Mastra's `@mastra/core/agent` to support array-form `system` blocks or a wrapper that sets `cache_control` directly on the API request.
- Phase C: Requires access to API response `usage` fields.

## Files Changed

- `packages/luca-mastracode/src/index.ts` — Main assembly refactor
- `packages/luca-mastracode/src/modes/*.ts` — Extract dynamic state from buildXInstructions()
- Potentially new: `packages/luca-mastracode/src/cache-boundary.ts`

## Constraints

- Phase A has value regardless of Mastra API support — start there
- If Mastra converts `instructions` to a single text block internally, Phase B requires patching Mastra or wrapping the API call
- Tool definitions should also benefit from caching — ensure `buildModeTools()` returns stable objects per mode
