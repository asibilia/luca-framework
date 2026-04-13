---
title: "Implement conditional MCP tool loading per mode to save ~15K tokens/turn"
area: architecture
created: 2026-04-13
priority: high
source: research
sprint: 4
---

## Task

Only inject MuninnDB MCP tools into modes that actually use memory operations. Skip MCP tool injection for lightweight modes (fast, triage, plan, research, architect, review) to save ~15,000+ tokens per turn.

## Context

Each MCP server connection injects tool definitions costing 15,000+ tokens. MuninnDB tools are currently loaded into every mode via `mcpManagerRef.current?.getTools()`, even modes that never use memory. 5 connected MCP servers can burn 60K tokens before the first user message — over 30% of a 200K context window.

## Research References

- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — Section 3: MCP tool definition overhead, budget math
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 4, item 4.2

## Implementation

**File:** `packages/luca-mastracode/src/index.ts` (line ~271, tools callback)

```typescript
const MEMORY_MODES = new Set([
  'luca:4-execute',
  'luca:6-finalize',
  'luca:discuss',
  'build'
])

// In createStaticAgent tools callback:
tools: () => {
  const mcpTools = MEMORY_MODES.has(currentModeId)
    ? (mcpManagerRef.current?.getTools() ?? {})
    : {}
  return { ...staticTools, ...mcpTools }
},
```

Also update mode instruction files that reference MuninnDB in non-memory modes to note that MuninnDB is available only when relevant.

## Constraints

- Verify which modes actually reference MuninnDB in their instructions before finalizing the MEMORY_MODES set
- If a mode references MuninnDB but only for optional recall (not required), it should still be in MEMORY_MODES
- This change is zero-risk for modes not in the set — they simply won't see MuninnDB tools
