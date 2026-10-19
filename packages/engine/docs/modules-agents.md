# @luca/engine: modules in `src/agents/`

Launching agents, their instructions, prompts, and results. A module in another
folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/agents/agent-launcher.ts` | The agent launcher interface (`launch` a fresh session, or `followUp` in an open one), its failure kinds, and the session summary. |
| `src/agents/claude-launcher.ts` | The real launcher: one Claude Agent SDK session per agent, with every guard on, kept open for follow-ups. |
| `src/agents/claude-options.ts` | Pure: the model, effort, clean environment, and SDK options for one agent. |
| `src/agents/role-instructions.ts` | Each role's instructions, appended to Claude Code's system prompt ([its modules](#role-instructions-modules)). |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write files, act (sending and receiving agent messages too), return a result or a failure, and record each launch and follow-up with its session and what it was handed. |
| `src/agents/message-tool.ts` | The engine's in-process MCP server `luca` with its `send_message` tool, and the hook that hands messages over after each tool call. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids, its address for messages, and the run's newest **run notes**), and its section after a clash: the clashed tests, the clashed code, or "re-review only the new changes". |

## role-instructions modules

The modules split out of `src/agents/role-instructions.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/agents/common-instructions.ts` | Shared sections: shell, messages, every agent's rules, review fixes. |
| `src/agents/writer-instructions.ts` | The test-writer's and implementer's tasks. |
| `src/agents/reviewer-instructions.ts` | The ticket reviewer's and each lens's tasks. |
| `src/agents/learner-instructions.ts` | The learner's task and rules. |
