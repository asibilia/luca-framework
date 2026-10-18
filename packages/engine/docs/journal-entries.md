# @luca/engine: journal entry modules

`src/journal/journal-record.ts` builds the journal's record kinds from one module per area, and re-exports what they export. Back to [Modules](modules.md).

| Module | What it does |
| --- | --- |
| `src/journal/entry-fields.ts` | The fields every entry has. |
| `src/journal/run-entries.ts` | Run start, resume, stop, and step entries. |
| `src/journal/intake-entries.ts` | Intake entries. |
| `src/journal/worktree-entries.ts` | Worktree and baseline entries. |
| `src/journal/agent-entries.ts` | Agent turn and session entries. |
| `src/journal/agent-message-entries.ts` | Agent message entries. |
| `src/journal/limit-entries.ts` | Plan limit and usage entries. |
| `src/journal/gate-entries.ts` | Red check, install, and gates entries. |
| `src/journal/commit-entries.ts` | Leftover scan and commit entries. |
| `src/journal/join-entries.ts` | Join, rebase, and push entries. |
| `src/journal/stuck-entries.ts` | Stuck work and the owner's reply entries. |
| `src/journal/already-done-entries.ts` | Already-done ticket entries. |
| `src/journal/final-review-entries.ts` | Final review entries. |
| `src/journal/pull-request-entries.ts` | Changeset and pull request entries. |
| `src/journal/memory-entries.ts` | Memory entries. |
| `src/journal/decision-model-entries.ts` | Decision model entries. |
