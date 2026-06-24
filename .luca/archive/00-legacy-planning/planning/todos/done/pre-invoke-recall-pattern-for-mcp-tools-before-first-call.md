---
title: "Pre-invoke recall pattern for MCP tools — subagents must check MuninnDB for procedure/pitfall memories before first call to an MCP tool"
area: subagent-prefix
created: 2026-05-15
priority: high
source: run-mp706uzq-analysis
muninn_id: 01KRP99A1B6EQETSRGY4CF2C6W
---

## Task

Add a pre-invoke recall directive to `SUBAGENT_SHARED_PREFIX` so that subagents (especially researchers) call `muninn_recall` for `procedure:*` and `pitfall:*` memories before their first invocation of any MCP-prefixed tool.

---
confidence: medium
externalResearch: false
priority: 1
---

## Problem

Research subagents make malformed Convex MCP requests on every COMPLEX run that touches `joes-book--next`. The vault already has the canonical fix:

- `01KRP5E3ES6RBCH4MH3GAF8ZAX` — `pitfall:convex-mcp-projectDir-must-be-monorepo-root`
- `01KRP5E3EX21XTX5EFF201ECEM` — `procedure:convex-mcp-read-flow-joes-book`

But researchers never recall them — they jump straight to calling `convex_status` / `convex_runOneoffQuery` with the wrong `projectDir`, hang ~30s on AbortError, get killed, parent retries. Cost in run `run_mp706uzq_udb346w7` (5/15): **61m 47s** of wasted research time.

Pattern observed across 3 consecutive COMPLEX runs (5/13, 5/14, 5/15).

## Why this matters

- Memories without recall are dead weight
- The whole MuninnDB investment assumes proactive recall before action
- This is the difference between "vault as documentation" and "vault as living guidance"

## Fix sketch

Add to `packages/luca-mastracode/src/subagents/shared-prefix.ts`:

```
## Tool Discovery

Before invoking any tool whose name starts with `mcp__` (an MCP-server tool) and that you have NOT already called in this task, FIRST call:

  mcp__muninn__muninn_recall({
    vault: "default",
    context: ["how to use <toolName>", "<toolName> common mistakes", "<toolName> request format"],
    threshold: 0.3,
    limit: 5
  })

If any `procedure:*` or `pitfall:*` memories return, read them and follow the canonical flow. Skip this step for built-in tools and tools you have already successfully invoked.
```

Constraints:
- Delta must stay under 200 chars to fit existing prefix budget (current ~1.6K)
- Don't apply to built-in tools (filesystem, shell, etc.) — they'd over-recall
- Don't apply to `mcp__muninn__*` itself — would cause recursion

## Acceptance criteria

1. `SUBAGENT_SHARED_PREFIX` contains the pre-invoke recall directive
2. Test in `memory-tier-prefix.test.ts` asserts directive present
3. Test asserts prefix stays under 1.8K total chars
4. Manual: trigger a COMPLEX task in `joes-book--next` that touches Convex MCP — confirm researcher logs show `muninn_recall` call before first `convex_*` call
5. Telemetry: research phase kill count = 0 on next 3 COMPLEX runs touching Convex MCP

## Risks

- Prefix bloat — current is dense, budget is tight
- Over-recall on every MCP tool that has no relevant memories — wasted token spend (~500 tokens per noop recall)
- May want to scope to FIRST-time-in-task only (use task-scoped memo) — but subagents don't have persistent state, so "first call in this subagent invocation" is the natural scope

## Out of scope

- Building a recall-result cache (premature)
- Forcing this on built-in tools (would over-recall)
- Adding mode-level pre-recall to luca:1-plan etc. (this todo is subagent-level only)
