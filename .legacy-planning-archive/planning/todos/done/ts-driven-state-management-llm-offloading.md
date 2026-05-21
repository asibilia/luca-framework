---
title: TS-driven state management — offload deterministic writes from LLM to Bun scripts
area: architecture
created: 2026-02-12
source: conversation
---

## Context

Discussion about improving Luca's performance and reducing token costs. Currently the LLM handles reading state files, deciding on changes, and writing updates — work that is largely deterministic and could be handled by TypeScript logic instead.

## Task

Design and implement a TS-driven state management layer where Bun-callable functions handle all persistent context writes (BRAIN.md, MEMORY.md, STATE.md, WORKING.md, etc.), reserving the LLM for reasoning, research, and decision-making only.

### Key Ideas

1. **Deterministic writes via TS functions**: Instead of the LLM reading a file, deciding on changes, and writing — have callable TS functions that accept structured input and handle the read-modify-write cycle internally.

2. **Pre-primed contexts**: Functions could respond with pre-formatted context or instructions, so the LLM doesn't need to read files and reason about structure — it just calls the right function with the right arguments.

3. **Intelligent routing from TS**: Functions could return routing instructions (e.g., an `initialize` function that updates state AND tells the LLM what workflow step comes next), reducing LLM decision overhead for mechanical transitions.

4. **Separation of concerns**:
   - **LLM does**: Reasoning, question answering, research, amorphous data collection, choosing next steps
   - **TS does**: File reads, structured writes, state transitions, data formatting, context priming

5. **Example — skill initialization**: Today the LLM reads STATE.md, decides to set status to "in_progress", writes the file. Instead: call `bun scripts/state.ts initialize --skill=workflow-start` which reads, updates, and returns next-step instructions.

### Expected Benefits

- Reduced token consumption (no file content in context for mechanical operations)
- Faster execution (skip LLM reasoning for deterministic operations)
- More reliable state management (TS logic is testable and deterministic)
- Cleaner LLM prompts (less noise from file contents)

## Notes

- This is a significant architectural shift — should be planned as its own milestone or major phase
- Could start incrementally: pick one state file (e.g., STATE.md) and build TS functions for its common operations
- Need to define the interface between LLM tool calls and TS functions (likely MCP tools or shell commands)
- Consider how this interacts with existing hooks and skills infrastructure
- Related to broader "agentic efficiency" goals — doing more with fewer tokens
