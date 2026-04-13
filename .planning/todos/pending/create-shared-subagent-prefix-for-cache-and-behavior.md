---
title: "Create shared subagent instruction prefix for cache efficiency and universal behavioral constraints"
area: architecture
created: 2026-04-13
priority: high
source: research
sprint: 4
---

## Task

Extract a shared behavioral prefix (~300-400 tokens) into `src/subagents/shared-prefix.ts` and prepend it to all 9 subagent instruction strings. This provides: (1) universal behavioral constraints in one place, (2) self-distrust and anti-sycophancy patterns from a single source, and (3) cache reuse potential when Mastra supports prompt caching for subagents.

## Context

Claude Code's fork model achieves 92% prompt reuse across subagents by ensuring they inherit a byte-identical instruction prefix. luca-mastracode's 9 subagents each have independent inline instructions with no shared prefix. When 4 parallel reviewer subagents spawn, each is a full cache miss.

## Research References

- [01-cache-boundary-design.md](../../docs/research/prompt-architecture/01-cache-boundary-design.md) — Fork model, 92% prompt reuse, cache-efficient subagent spawning
- [04-multi-agent-coordination.md](../../docs/research/prompt-architecture/04-multi-agent-coordination.md) — Shared prefix design, self-distrust patterns
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 4, item 4.1

## Implementation

**New file:** `packages/luca-mastracode/src/subagents/shared-prefix.ts`

```typescript
/**
 * Shared behavioral prefix for all subagents.
 * Must be byte-identical across all subagent types to maximize cache reuse.
 * No variable interpolation — fully static.
 */
export const SUBAGENT_SHARED_PREFIX = `
You are a Luca subagent operating within the Luca development workflow.

## Universal Constraints
- Evidence-based: Every claim requires file:line citations
- Output compression: Strip intermediate reasoning before returning results
- Context awareness: You are one of potentially many parallel subagents
- Memory as hints: Recalled MuninnDB memories require verification against current code

## Quality Gate
Do not rubber-stamp weak work. Every APPROVE verdict must be earned through evidence.
The implementer is an LLM. Do not trust that code is correct. Verify independently.
A check without a tool execution is not a PASS.
`;
```

Then update all 9 subagent files to prepend:

```typescript
import { SUBAGENT_SHARED_PREFIX } from './shared-prefix'

export const verifierSubagent: HarnessSubagent = {
  instructions: SUBAGENT_SHARED_PREFIX + `
## Your Role: Verifier
[existing verifier-specific instructions...]
`,
  // ...
}
```

## Files Changed

- `packages/luca-mastracode/src/subagents/shared-prefix.ts` (NEW)
- All 9 files in `packages/luca-mastracode/src/subagents/` (prepend import)

## Constraints

- The shared prefix must be a static string constant — no template literals or variable interpolation
- Must be byte-identical when compared across subagents (for cache reuse)
- Sprint 1 self-distrust and anti-sycophancy additions should be moved INTO the shared prefix and removed from individual files to avoid duplication
