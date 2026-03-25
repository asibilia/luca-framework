---
title: "Agent cross-talk protocol: inter-agent note passing, task queue handoff, priority-based messaging"
area: agents
created: 2026-03-24
source: conversation
---

## Context

User envisions agents that can communicate with each other during concurrent work. When an agent editing a file notices something relevant for another active agent (different task or area of expertise), it should be able to park context and route it to the other agent's queue. This is the **behavioral/protocol side** — the UI side is tracked separately in `agent-collaboration-ui.md`.

## Task

Design and implement the inter-agent messaging protocol:

1. **Note Types & Priority System**
   - Define note categories (code suggestion, context hint, dependency alert, blocker)
   - Priority levels (urgent/blocks-me, normal, FYI/low)
   - Schema for note payloads (source agent, target agent, file context, code snippet, rationale)

2. **Task Queue Handoff**
   - Agent can "park" code or context into another agent's task queue
   - Target agent picks up queued items at natural breakpoints (not mid-edit)
   - Queue persistence (survives agent restart or context compression)

3. **Cross-Agent Awareness**
   - Agents know which other agents are active and what they're focused on
   - File ownership tracking (which agent is editing which files)
   - Relevance detection: how does an agent decide something is relevant to another agent?

4. **Conflict Resolution**
   - What happens when two agents want to edit the same file?
   - Priority/lock mechanism or merge strategy
   - Escalation path (ask user to arbitrate)

## Notes

- This is the behavioral counterpart to the UI in `agent-collaboration-ui.md`
- May need a shared state layer (could leverage MuninnDB session context or a lightweight message bus)
- Consider how this interacts with existing agent spawning (Agent tool, subagent_type)
- Current agents are fire-and-forget with no cross-talk — this is a fundamental capability addition
- Need to think about token cost: inter-agent messaging adds context to each agent's window
- Could prototype with simple file-based message passing before building a real bus
