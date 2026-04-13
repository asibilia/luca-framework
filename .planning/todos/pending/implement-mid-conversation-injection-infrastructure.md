---
title: "Implement mid-conversation injection infrastructure for context rot remediation"
area: architecture
created: 2026-04-13
priority: critical
source: research
sprint: 4
---

## Task

Build a `ContextRefresher` module that evaluates conditions at harness lifecycle events and injects `<luca-reminder>` behavioral reminders into the message stream to combat context rot.

## Context

Context rot — the degradation of instruction adherence as conversations grow — is the single most impactful missing capability in luca-mastracode. Adobe Research measured 29-60 percentage point drops across frontier models at 32K tokens. Agent drift compounds exponentially: 95% per-step reliability over 20 steps = 36% combined success; 2% early misalignment escalates to 40% failure.

Claude Code implements 37 system-reminders across 5 domains, injected reactively at lifecycle events. They are invisible to users, placed in the message layer to preserve cache validity.

Prerequisite: The `<luca-reminder>` tag convention must be defined in HARD_CONSTRAINTS first (Sprint 2 todo).

## Research References

- [02-context-rot-and-injection.md](../../docs/research/prompt-architecture/02-context-rot-and-injection.md) — Full analysis: 37 system-reminders, 5 domains, injection strategies, degradation curves
- [05-attention-curves-and-structure.md](../../docs/research/prompt-architecture/05-attention-curves-and-structure.md) — Recency peak exploitation
- [01-cache-boundary-design.md](../../docs/research/prompt-architecture/01-cache-boundary-design.md) — Message-layer injection preserves cache
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 4, item 4.3

## Implementation

**New file:** `packages/luca-mastracode/src/context-refresher.ts`

```typescript
interface RefreshConfig {
  /** Re-inject hard constraints every N tool calls */
  toolCallInterval: number       // default: 15
  /** Re-inject mode boundaries every N tokens estimated */
  tokenThreshold: number         // default: 30_000
  /** Always re-inject after these events */
  alwaysTriggerAfter: string[]   // ['compaction', 'mode_transition']
}

const REFRESH_TIERS = {
  critical: () => HARD_CONSTRAINTS,
  mode: (modeId: string) => getModeCoreBehavior(modeId),
  tools: (modeId: string) => getToolPriorityReminder(modeId),
} as const
```

Integration via harness event subscription:

```typescript
harness.subscribe(async (event) => {
  if (event.type === 'tool_end') {
    refresher.recordToolCall()
    if (refresher.shouldInject()) {
      const reminder = refresher.buildReminder(currentModeId)
      await harness.followUp({
        content: wrapInLucaReminder(reminder)
      })
    }
  }
})
```

Content injected per tier:
- **Critical** (~200 tokens): HARD_CONSTRAINTS, mode boundaries
- **Mode-specific** (~100 tokens): Core behavioral rules for current mode
- **Tool guidance** (~100 tokens): Priority ordering reminders

## Dependencies

- Requires `<luca-reminder>` tag convention in HARD_CONSTRAINTS (Sprint 2)
- Requires `harness.followUp()` for message injection (already wired via `followUpRef`)
- Does NOT require cache boundary (Sprint 5) — message-layer injection is cache-independent

## Constraints

- Start conservative: every 15 tool calls, inject only critical-tier content
- Each injection should be under 200 tokens to avoid attention dilution
- Over-injection wastes tokens — measure impact on task completion before increasing frequency
- Add circuit breaker: maximum 3 injections per mode turn to prevent runaway injection
