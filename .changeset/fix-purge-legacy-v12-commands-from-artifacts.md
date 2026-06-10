---
"@alecsibilia/luca": patch
---

Purge legacy v12 commands from shipped instruction bodies.

A legacy audit found pre-v13 commands surviving as actionable instructions in the shipped artifact set, causing LLM sessions to invoke nonexistent commands:

- **`bun run commit --message=... --type=... --skip-checks`** (14 sites across `phase-execute`, `quick`, `project-new`, `session-pause`, `milestone-complete`) — a repo-specific v12 script. Replaced with plain `git commit` using conventional messages (`{type}({scope}): {subject}` per `luca preferences read`).
- **`bun run ./src/harness/runner.ts`** (3 sites in `phase-execute`) — the v12 harness, which doesn't exist in v13. Replaced with `luca checks run --file .luca/tmp/checks.json` and its real output contract (`{ passed, summary }`, exit 0/1).
- **`luca branch-guard assert-not-default`** (executor subagent + execute/finalize/triage modes) — wrong syntax for a command that is actually `luca branch guard`; output fields corrected to the real `{ ok, current, default, message }` contract.
- **`luca milestone` CLI surface** (finalize mode) — no such command exists; reworded to reference the LUCA_DIR_CONTRACT milestone paths (a sanctioned milestone write surface is tracked as a backlog item).

Remaining v12 debris (the `src/iteration/*` subsystem embedded in `phase-execute`, and the orphaned `luca-framework`/`luca-mastracode` packages) is tracked in the MuninnDB backlog as phase-sized work.
