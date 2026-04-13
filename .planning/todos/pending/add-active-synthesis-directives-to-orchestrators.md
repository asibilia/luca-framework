---
title: "Add active synthesis directives to execute and review orchestrators"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 1
---

## Task

Add "synthesize, don't relay" directives to execute.md and review.md orchestrator instructions, and add behavioral refresh to continuation messages in index.ts.

## Context

Claude Code's coordinator mode explicitly says: "Do not rubber-stamp weak work. Never write 'based on your findings' — these phrases delegate understanding to workers instead of doing it yourself." luca-mastracode's orchestrator modes contain zero such directives. The execute mode "consolidates" review findings but is not told to challenge them. The review mode can passively relay subagent opinions without owning the verdict.

## Research References

- [04-multi-agent-coordination.md](../../docs/research/prompt-architecture/04-multi-agent-coordination.md) — Section 4: Coordinator prompt design principles, active synthesis
- [08-advanced-patterns-and-hidden-systems.md](../../docs/research/prompt-architecture/08-advanced-patterns-and-hidden-systems.md) — Section 6: "Do not rubber-stamp weak work"
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 1, item 1.7

## Implementation

### Part A: execute.md

**File:** `packages/luca-mastracode/src/instructions/execute.md`

Add to Behavioral Guidelines section:

```markdown
- **Synthesize, don't relay.** When subagents return results, YOU must understand them.
  Never write "based on the reviewer's findings" or "as the verifier reported."
  Resolve conflicts between subagents and present a unified assessment.
  If two reviewers contradict each other, investigate — don't average.
```

### Part B: review.md

**File:** `packages/luca-mastracode/src/instructions/review.md`

Add to Behavioral Guidelines section:

```markdown
- **Own the verdict.** You are the decision-maker, not a relay for subagent opinions.
  If all 4 reviewers approve but you see an issue, flag it. If a reviewer flags a
  false positive, dismiss it with explanation. Never defer understanding to subagents.
```

### Part C: Continuation Messages

**File:** `packages/luca-mastracode/src/index.ts` (`buildContinuationMessage` function)

Add behavioral refresh to every continuation message:

```typescript
const BEHAVIORAL_REFRESH = [
  `<luca-reminder>`,
  `- Synthesize subagent results yourself — never relay passively`,
  `- A verification without tool execution is a guess, not a check`,
  `- Do not rubber-stamp weak work from subagents`,
  `</luca-reminder>`,
].join('\n');
```

## Constraints

- Do NOT change the continuation message structure — only add the behavioral refresh block
- Keep additions under 100 words each
