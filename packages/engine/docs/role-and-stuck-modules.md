# @luca/engine: role and stuck modules

The modules split out of `src/guards/role-rules.ts`,
`src/agents/role-instructions.ts` and `src/core/stuck-text.ts`. Each original
file re-exports them. See [modules](modules.md) for the rest.

| Module | What it does |
| --- | --- |
| `src/core/ticket-stuck-text.ts` | A stuck ticket's comment (why, what was tried, suggestion) and the retry note. |
| `src/core/final-stuck-text.ts` | The stuck final review's comment. |
| `src/core/run-stuck-text.ts` | The run's stuck comments: run budget, unopened PR. |
| `src/core/stuck-detail-text.ts` | Stuck details: a setup file change, a bad test. |
| `src/core/stuck-format.ts` | The stuck texts' error fence and plurals. |
| `src/agents/common-instructions.ts` | Shared sections: shell, messages, every agent's rules, review fixes. |
| `src/agents/writer-instructions.ts` | The test-writer's and implementer's tasks. |
| `src/agents/reviewer-instructions.ts` | The ticket reviewer's and each lens's tasks. |
| `src/agents/learner-instructions.ts` | The learner's task and rules. |
| `src/guards/guard-roles.ts` | The guard's roles, their tools, and its decision type. |
| `src/guards/write-rules.ts` | Pure: the paths each role may write (`mayWrite`). |
| `src/guards/shell-rules.ts` | Pure: the shell commands each role may run. |
| `src/guards/permission-rules.ts` | Pure: each role's SDK permission rules. |
