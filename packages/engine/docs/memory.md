# @luca/engine: memory

## Memory (#370)

Only the engine talks to MuninnDB, over MCP; agents get no memory tools, and
the guard keeps the MuninnDB connection they would inherit away from them.
Memory is **off** unless `run_started` turns it on (`memory: { project_vault }`,
from `startRun({ memory })`), so a run without it goes exactly as before.
`runEngine({ ..., memory: { client, timeout_ms } })` takes the client; each
call waits at most `timeout_ms` (default 10 s), and an error or a timeout is
journaled as a value, never thrown: memory never breaks a run.

**Recall points.** Each search covers the project vault (the engine config's
`muninn.vault`) and `default` (just `default` with no project vault, or once
if they're the same), passes `threshold: MIN_MEMORY_SCORE` (0.5, MuninnDB's
own default; its scores can go above 1) and `limit: 5` to each, then merges
the hits by score, drops those below the minimum, keeps one per vault and id,
and keeps at most `MAX_MEMORIES_PER_RECALL` (5). When a step needs a search
whose key isn't journaled yet, the decision step returns `recall_memories`
in its place, under the same scheduler key (so tickets search at the same
time; the run's start is run-level, the final review's under `final`). A
search is a step like any other: it gets step records under that key, and
one a crash cut off is searched again.

| Point | When | Key | Query | Where the memories go |
| --- | --- | --- | --- | --- |
| `run_start` | once intake passed, before the run branch | `run_start` | the spec's title and body | the TOP of every fresh agent's prompt in the run, so every prompt starts the same and is cached |
| `ticket` | before a ticket's first test-writer or implementer | `ticket:<n>` | the ticket's title and body | the end of that ticket's fresh test-writers' and implementers' prompts, next to the run notes |
| `review` | before each ticket review, and each final review round's lenses (one search for all five) | `review:<n>:<commit>`, `review:final:<head>` | the ticket's (or spec's) title and the files changed | the reviewer's or lenses' prompts |
| `fix_round` | before a follow-up after a failed red check or failed gates, a review fix round, and a final review fix round | `fix_round:<n or final>:<red, gates, or review>:<seq>` | the failure text's last 1,500 characters (the output, or the findings) | that follow-up message, or the round's fresh fixers' prompts |

Failed-try follow-ups (agent errors, guard violations) and clash fixes are
no fix rounds. A follow-up is in its session already, so it gets no run-start
memories. A memory shown at the run's start (or earlier in the same prompt)
isn't repeated. Each section reads `## Memories from past runs...`, then
`- [<vault>] <concept>: <content>` (content cut at 600 characters). Every
search is journaled as `memory_recalled` with its query, each vault's outcome
and count, and the memories with their scores; one that failed in a vault
still journals, with the error, and the run moves on.

**The learner.** Once the run is about to end, it runs before anything else
(always before the last worktrees are removed, so the run branch's worktree
is its read-only folder):

- **with its PR**: once the final review passed or was shipped, before
  `open_pull_request`, so the PR can list the new memories;
- **stopped by the owner**: after a `stop` reply (a stuck final review then
  `stop` too), once the steps in flight settled;
- **every ticket skipped**: before the worktrees go.

Not on a refused run or one with nothing to do (no agent ran, nothing to
learn), not after a billing stop (starting any agent then could bill per
token), and not after a stop for crashes (the run stopped for good). A
learner's turn a crash cut off is taken again by a fresh learner (step
`launch_learner:learner`, under the run's key). The learner is a fresh agent (role `learner`: Read, Grep, Glob; no
shell, writes nothing, no messages) on `opus` like every role. Its prompt
is a digest of the journal built by pure code (`learnerPrompt`): the
failures (failed red checks and gates with their output's end, clashes), fix
loops, failed tries, review and final review findings, stuck points,
assumptions, run notes, and every memory shown (id, vault, concept,
content), each item capped at 700 characters and the whole at 40,000. It
answers `{ memories: { type, scope, concept, content, summary }[] (at most
10), helped: string[] }`; `scope` is `repo` or `anywhere`, by the user's test
"would this memory be useful in a completely different repo?" (#406).
`type` and `scope` are plain strings, so an unknown type or a missing or
unknown scope is refused alone rather than failing the answer. A failed try gets a fresh learner, up
to `MAX_FIX_ROUNDS` (3) tries or `MAX_ENGINE_FAILURES` (3) engine failures in
a row; then `learning_skipped { reason }` and the run ends as it would have.
A plan cut-off is a limit wait like any agent's, then the learner again. Its
records have `ticket: null` and never count as the final review's.

**Saving** (`save_memories`, routed by pure code):

| Type | Scope | Vault |
| --- | --- | --- |
| `pattern`, `pitfall`, `procedure` | `repo` | the project vault (refused if the config names none) |
| `pattern`, `pitfall`, `procedure` | `anywhere` | `default` |
| `decision` | `repo` or `anywhere` | the project vault (refused if the config names none) |
| anything else | | refused, with the reason |
| | missing or anything else | refused, with the reason |

A type and a scope are read without case or spaces. The stored concept is
`<type>:<concept>`. For each memory the executor searches its vault for the
most similar one (limit 1, threshold 0); a `vector_score` of at least
`SIMILAR_MEMORY_SCORE` (0.85) updates it (`muninn_evolve`), else a new one is
added (`muninn_remember`, tags `luca` and `spec-<n>`, and an `op_id` from the
learner's record so a save repeated after a crash adds it once). Then every
distinct memory shown in the run gets feedback: useful if its id is in
`helped` (ids never shown are ignored). Each write (a save's update or add,
a feedback) is journaled just before it as `memory_write_started` (its key,
vault, and the save's concept, `op_id`, the id it updates, and the similar
memory; or the feedback's memory id) and after it as `memory_write_done`
(the save's or the feedback's outcome), so a crash never saves twice or
sends a feedback twice (see "Crash recovery"). All of it is journaled once as
`memories_saved`: each save's vault, outcome (`added`, `updated`, `refused`,
`failed`), id, the similar memory found (id, score, vector score), and error,
and each feedback's outcome.

**Listing them.** The PR description ends with "New memories" (each added or
updated memory's type, vault, concept, id, and whether it was added or
updated). With no PR (stopped, or every ticket skipped), `report_memories`
comments the same list on the spec issue (──> `memories_reported`), unless
nothing was saved.

**Connecting.** `createMuninnMcpClient` calls `muninn_recall` (`vault`,
`context: [query]`, `limit`, `threshold`), `muninn_remember` (`vault`,
`concept`, `content`, `summary`, `type`, `tags`, `op_id`), `muninn_evolve`
(`vault`, `id`, `new_content`, `reason`), and `muninn_feedback` (`vault`,
`engram_id`, `useful`) on one connection, Streamable HTTP first, then SSE.
Answers are checked with Zod; a bad shape or an error result is an error
value. Where MuninnDB is (`muninnSettings`, pure):

| Setting | From |
| --- | --- |
| URL | `LUCA_MUNINN_URL`, else `mcpServers.muninn.url` in `~/.claude.json` |
| Token | `LUCA_MUNINN_TOKEN` (sent as `Authorization: Bearer <token>`), else that entry's `headers.Authorization` |

The token is never logged or journaled, and is hidden from error text.
`luca-run --spec` turns memory on when it finds MuninnDB (and logs "memory
off" when it doesn't); `runSpec` takes the client as an argument, so its
tests hand in the fake. The demo uses the fake MuninnDB seeded with two
memories and a scripted learner, so the board shows memory with nothing
leaving the machine.

Choices made:

- The design's `save_memories` step also carries each save's `op_id` and
  tags, so the executor stays a plain loop.
- A save whose similarity search fails is `failed`, not added, so a
  MuninnDB that half works doesn't fill a vault with duplicates.
- A save a crash left in doubt is repeated with no new search, as its
  `memory_write_started` says: a new search could find the memory its first
  try just added and update it instead, journaling `updated` for an add.
- The learner's answer is saved once (`memories_saved` is its checkpoint),
  even with nothing to save, so the run's end is clear in the journal.
- The run's start memories go on every fresh agent but the learner, whose
  digest already lists every memory shown.
