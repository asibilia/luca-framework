# @luca/engine: agent messages and guards

## Agent messages

Test-writers and implementers can send each other a one-way heads-up
(decision #338). Reviewers can't send or receive, and the learner (#370)
can't either.

- **Addresses.** An agent's address is `<role>#<ticket>`, such as
  `implementer#11`; its prompt names it. A fresh test-writer after a bad test
  keeps the address, and its count. `to` is an address or `all`.
- **The tool.** A Claude agent calls `send_message({ to, text })` on the
  engine's in-process MCP server `luca` (`mcp__luca__send_message`). The
  answer says what happened; a refused message is an error result. Reviewers
  get no `luca` server and no delivery hooks, and the guard denies the tool
  to the reviewer and learner roles anyway.
- **Delivery.** At the receiver's next tool call, failed ones too: the
  `PostToolUse` and `PostToolUseFailure` hooks add the waiting messages as
  `additionalContext`, one line each, and journal `agent_message_delivered`
  (the receiver, the ids, the tool it rode on, and the text word for word; the
  record's time is when it was seen). Each message is handed over once. A
  session keeps its messaging for its follow-ups.
- **Who counts as live.** Tickets build at the same time, so the receiver
  may be on another ticket, working right now. A named address whose ticket
  is in the run and not over gets the message queued, even if that agent
  hasn't started yet: it gets it at its first tool call. A ticket is over
  (`isOver`) once it pushed, is stuck, was skipped (by a `skip` reply, or
  because it waits on a skipped ticket), the owner replied `stop` (every
  ticket), a billing stop ended the run, or the run's PR is open. A `retry`
  makes a stuck ticket live again for its fresh agents; messages queued
  before the retry were for the old agents, and are never handed over. Run
  notes are the run's, so the fresh agents get them as usual. A ticket that joined but hasn't pushed isn't over: a
  clash or failed gates after joining sends it back to its agents, and the
  implementer's follow-up (same session) or a fresh test-writer gets what
  waits. `all` goes to every other test-writer and implementer that has
  started on a ticket that isn't over, on any ticket; if there is none, it
  is not delivered.
- **Not delivered.** A message to an agent whose ticket is over is journaled
  as `not_delivered`, with why, and stays in the journal. It counts toward the
  cap.
- **Refused.** A reviewer sender, a reviewer or malformed address, the
  sender itself, a ticket not in the run, empty text, text over 2,000
  characters, or a sixth message from one address
  (`MAX_MESSAGES_PER_AGENT`, 5, per address: `implementer#11` and
  `implementer#12` each have their own 5; a fresh agent on a rejoin keeps its
  address's count). Refused messages are
  journaled too, with the reason, and don't count toward the cap.

Every message is journaled word for word as `agent_message` (`ticket` and
`role` are the sender's):

```ts
{ id: 'msg-<n>', from: 'test-writer#11', to: 'implementer#11' | 'all', text,
  status: 'queued' | 'not_delivered' | 'refused', recipients: string[], reason: string | null }
```

The rules are pure (`planMessage`, `pendingMessages`, `deliveryText`,
`isOver` in `src/messages/agent-messages.ts`) and read the journal on every
call: liveness, the cap, and what waits come from the journal alone, never
from memory, so a resumed run hands over exactly what is still waiting.

## Guards

Each role runs at its own effort, whatever its model (`role-effort.ts`,
#659): the test-writer and the implementer on tickets, and the learner, at
`medium`; the ticket reviewer, the five lenses and the final review's fixers
at `xhigh`; helpers at `low`. Each launch takes its effort, a follow-up runs
at its session's, and `agent_started` records the `effort` (older journals
read it as `null`; every agent ran at `high` then). The engine names models only by
short name (`opus`, `sonnet`, `haiku`), and Claude Code turns each into its
newest version; the exact version is journaled from the session's init. Each
launch takes its own model, and a follow-up runs on its session's; its
`agent_started` records the `model`. Before a launch the launcher refuses
every other name (`fable`, and short names such as `best` or `opusplan` that
resolve to Fable or switch models mid-session); on the init it refuses a
Fable or non-Claude model id. Three layers keep each **role**
to its rules; each one alone should hold.

| Role | Writes | Runs |
| --- | --- | --- |
| test-writer | test files only (`test_file_patterns`), and the `feature_map` file (#583) or any `*.md` page of a folder map (#597), and test helpers (`test_helper_patterns`, #619), and only with `may_edit_tests` | read-only commands, the config's checks, `rm` of what it may write |
| implementer | anything but `test_setup_files`, and test files only with `may_edit_tests` (a refactor ticket) | the same |
| reviewer (the ticket reviewer and every lens) | nothing | read-only commands only |
| learner (#370) | nothing | no shell |

No agent writes a test setup file, git, or GitHub, installs packages, reaches
the network or local ports, or gets Paseo or any MCP tool but the engine's own
(`mcp__luca__*`). Reviewers and the learner don't get `send_message`.

1. **Before a call.** `checkToolCall` runs as a `PreToolUse` hook and fails
   closed: unknown tools, paths outside the worktree, and shell commands off
   the list are denied. A shell call is one plain command: no chains, pipes,
   redirects, or subshells. Under `dontAsk`, only the role's pre-approved
   calls (`permissionRules`) run at all.
2. **The sandbox.** Absolute paths only: git's shared folder, the worktree's
   `.git`, `node_modules`, lockfiles, and the test setup files are never
   writable; an implementer that
   may not edit tests can't write test files; reviewers can't write the
   worktree. No network, no local ports, no unsandboxed commands.
   `~/.claude*`, `~/.paseo`, `~/.ssh`, and `~/.config/gh` can't be read.
3. **After the turn.** The engine, not the launcher, compares the worktree
   and its git state with a snapshot from right before the turn (content
   hashes, never mtimes), ignored files that matter included. Any path the
   agent may not write, or any git change (HEAD, the branch, new refs at
   HEAD other than the run branch and its ticket branches, the branch's
   stash, the index, the ticket branch's own section of the shared
   `.git/config`), is undone and fails the turn as `guard`. Other changes
   to the shared `.git` (other config keys, `info/exclude`, hooks) are
   other processes', not the agent's: they are journaled as
   `shared_git_changed`, never blamed or undone, and the check ignores the
   live excludes, fsmonitor, and hooks.
   This holds for every launcher and every turn, follow-ups too.

### Helpers

Any agent may hand repo searches to **helpers** (#627): read-only Haiku
sessions it starts itself with the SDK's `Agent` tool, so its own model goes
to the real work. Every launch passes one helper definition in the SDK's
`agents` option, the `searcher`: it runs on `haiku` (the short name, so
always the newest), with only `Read`, `Grep` and `Glob`, and a short
read-only prompt. Clef and the model floors don't apply to helpers.

The guard hook refuses a helper call, as a guard denial for the agent's role,
when it asks for another type than `searcher`, another model than `haiku`
(a Fable model is refused by name), a background run, or an isolation, and
when it would be a fourth helper while 3 of that agent's helpers run. A
helper counts as running from its allowed call until its result comes back.
A tool call from inside a helper (the hook input's `agent_id`) may only be
`Read`, `Grep` or `Glob`, whatever its agent may do. The helper's tool list
is the first fence, the guard hook the second, and the after-turn check,
which undoes any write the role may not make, the third. Helpers run in the
foreground, so each one ends inside its agent's turn.

A helper's tokens are in its turn's `model_usage` (subagents included), so
they count toward the run budget. `agent_session` counts the turn's helpers
in `helpers_started` (0 in older journals).

Before each launch, the launcher checks `accountInfo()` for a Claude plan
(pro, max, team, or enterprise) and no API key, before the prompt is sent.
The agent's environment comes from an allow-list, so `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_BASE_URL` never reach it. It loads no
settings, MCP servers, or skills, and keeps no session on disk.

The launcher stops the run (`run_stopped`, and `runEngine` throws) on the
wrong credentials or plan, an init with an API key, a Fable or non-Claude
model, or a foreign MCP server, in a launch or a follow-up alike. A rejected
rate limit, overage, or a billing error cuts the turn off as `plan` instead;
see "Plan limits and billing".
