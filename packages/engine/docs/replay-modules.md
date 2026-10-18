# @luca/engine: replay modules

`src/journal/replay.ts` rebuilds a run's state from its journal. It keeps the record switch (`applyRecord`) and `replayRun`, and re-exports everything below that it exported before, so importers use `./replay` as ever. See [modules](modules.md) for the rest.

| Module | What it does |
| --- | --- |
| `src/journal/run-state.ts` | `RunState`'s shape and empty value, with small run-wide updates (snapshot phase, run notes, engine comments). |
| `src/journal/ticket-progress.ts` | `TicketProgress`'s shape and empty value. |
| `src/journal/final-review-state.ts` | `FinalReviewState`'s shape and empty value. |
| `src/journal/plan-replay.ts` | Replays the plan: rate limits hit, limit and usage-line waits, billing stops. |
| `src/journal/memory-replay.ts` | Replays memory and the learner's own records. |
| `src/journal/agent-turn-replay.ts` | Reads of an agent turn shared by ticket and final review replay (assumptions, bad test, sessions, declined findings). |
| `src/journal/ticket-replay.ts` | Replays a ticket's own records, a rebase, and a reused baseline. |
| `src/journal/ticket-result-replay.ts` | Where an agent's answer goes in its ticket's progress, including ticket reviews and `already_done` checks. |
| `src/journal/ticket-retry-replay.ts` | Replays a stuck ticket's `retry`: refused, restarted, or resumed. |
| `src/journal/final-review-replay.ts` | Replays the final review's records, its stuck report and reply, and its `retry`. |
| `src/journal/final-review-round.ts` | A final review round: namespaced lens results, settling the round, the fixers' answers. |
| `src/journal/reply-replay.ts` | Replays owner replies, stuck reports, and a ticket's `retry` at the run level. |
| `src/journal/cross-ticket-replay.ts` | Replays records that reach across tickets: crashes cut off, closed sessions, undone joins. |
