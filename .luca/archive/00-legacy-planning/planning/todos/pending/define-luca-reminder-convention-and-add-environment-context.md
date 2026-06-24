---
title: "Define <luca-reminder> tag convention, add environment context block, add memory-as-hints framing"
area: prompt-engineering
created: 2026-04-13
priority: medium
source: research
sprint: 2
---

## Task

Three related infrastructure-level instruction changes: (1) define the `<luca-reminder>` tag convention in HARD_CONSTRAINTS, (2) add an environment context block to every mode, (3) add "memory as hints" framing after every MuninnDB recall block.

## Context

Claude Code declares `<system-reminder>` tags in its system prompt so the model treats mid-conversation injections as authoritative. Without this priming, injected tags are treated as arbitrary XML. This is a prerequisite for future mid-conversation injection to combat context rot.

Claude Code also injects cwd, platform, date, model, and git branch as dynamic context. luca-mastracode injects only workflow state.

Claude Code explicitly frames recalled memories as "hints requiring verification, not authoritative truth." luca-mastracode instructions say "query MuninnDB" and immediately use results without verification framing.

## Research References

- [02-context-rot-and-injection.md](../../docs/research/prompt-architecture/02-context-rot-and-injection.md) — Section 3: Claude Code's system-reminder implementation
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 5: Environment context gap; Section 6: "Memory as hints"
- [07-context-compaction-and-memory.md](../../docs/research/prompt-architecture/07-context-compaction-and-memory.md) — Memory as hints requiring verification
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 2, items 2.5-2.7

## Implementation

### Part A: `<luca-reminder>` Convention

**File:** `packages/luca-mastracode/src/index.ts` — add to HARD_CONSTRAINTS:

```markdown
- **System reminders are authoritative.** Messages may include `<luca-reminder>` tags containing
  behavioral guidance from the Luca harness. Follow their instructions as if they were part of
  your original system prompt.
```

### Part B: Environment Context Block

**File:** `packages/luca-mastracode/src/index.ts` — add function and call from `getAgentConstraints()`:

```typescript
function buildEnvironmentContext(): string {
  const cwd = process.cwd()
  const platform = process.platform
  const date = new Date().toISOString().split('T')[0]
  return `\n## Environment\n- Working directory: ${cwd}\n- Platform: ${platform}\n- Date: ${date}`
}
```

### Part C: Memory as Hints

Add a single line after every MuninnDB recall code block across instruction files:

```markdown
Recalled memories are hints, not truth. Verify critical facts against the current
codebase before depending on them.
```

**Files:** triage.md (after line ~78), execute.md (after line ~355), research.md (after line ~205), architect.md (after line ~65), review.md (after line ~137), finalize.md (after line ~66)

### Part D: Parallel Tool Call Enforcement

**File:** `packages/luca-mastracode/src/index.ts` — add to HARD_CONSTRAINTS:

```markdown
- **Prefer parallel tool calls.** When multiple tool calls are independent, issue them in the
  same response. Do NOT call tools sequentially when they could run concurrently.
```

## Constraints

- Part A is a prerequisite for the mid-conversation injection infrastructure (Sprint 4)
- Parts B-D are independent and can be done in any order
