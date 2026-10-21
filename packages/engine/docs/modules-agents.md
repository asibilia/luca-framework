# @luca/engine: modules in `src/agents/`

Launching agents, their instructions, prompts, and results. A module in another
folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/agents/agent-launcher.ts` | The agent launcher interface (`launch` a fresh session, or `followUp` in an open one), its failure kinds, and the session summary. |
| `src/agents/claude-launcher.ts` | The real launcher: one Claude Agent SDK session per agent, with every guard on, kept open for follow-ups. |
| `src/agents/claude-options.ts` | Pure: the model, effort, clean environment, and SDK options for one agent. |
| `src/agents/role-effort.ts` | Pure: the effort each role runs at, whatever its model (#659). |
| `src/agents/role-instructions.ts` | Each role's instructions, appended to Claude Code's system prompt ([its modules](#role-instructions-modules)). |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write files, act (sending and receiving agent messages too), return a result or a failure, and record each launch and follow-up with its session and what it was handed. |
| `src/agents/message-tool.ts` | The engine's in-process MCP server `luca` with its `send_message` tool, and the hook that hands messages over after each tool call. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids, its address for messages, and the run's newest **run notes**), and each role's task; re-exports the modules below ([role-prompts modules](#role-prompts-modules)). |

## role-prompts modules

The modules split out of `src/agents/role-prompts.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/agents/rejoin-prompts.ts` | The sections for a ticket sent back onto the run branch: after a clash or failed gates (`rejoinSection`), and after a rebase made its tests wrong (`testUpdateSection`). |
| `src/agents/prompt-sections.ts` | The sections the decision step adds to a prompt: the run notes, the prepare command, the feature map, and the changesets. |

## role-instructions modules

The modules split out of `src/agents/role-instructions.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/agents/common-instructions.ts` | Shared sections: shell, messages, every agent's rules, review fixes. |
| `src/agents/writer-instructions.ts` | The test-writer's and implementer's tasks. |
| `src/agents/reviewer-instructions.ts` | The ticket reviewer's and each lens's tasks. |
| `src/agents/learner-instructions.ts` | The learner's task and rules. |

## claude-launcher modules

The modules split out of `src/agents/claude-launcher.ts`. It keeps `createClaudeLauncher` (the follow-ups and the closing) and the two default timeouts, and re-exports `AgentQuery` and `AgentQuerySession`.

| Module | What it does |
| --- | --- |
| `src/agents/claude-messages.ts` | What the launcher reads from an SDK session: the Zod schemas of its messages, the outcome of a turn, and the safety checks on the account and the init message. Pure. |
| `src/agents/open-session.ts` | One session the launcher keeps open between turns (`OpenSession`), and how it is read: each SDK message goes into the session's summary, and each outcome to the turn waiting for it. |
| `src/agents/input-channel.ts` | The queue the SDK reads an agent's prompt from (streaming-input mode). |
| `src/agents/launch-paths.ts` | Where the launcher finds things on disk: the real path of the `claude` binary, and the repo's common git dir. |
| `src/agents/session-pool.ts` | The agent sessions the launcher keeps open between turns: a turn on one (`runTurn`), keeping it open until it sits idle, and closing one or all. |
| `src/agents/launch-session.ts` | How the launcher starts one agent session (`createLaunch`): the model check, the role's locked-down options, the account check before the prompt, then the first turn. Holds the `AgentQuery` type. |
