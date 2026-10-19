# Luca board: the vocabulary

## The board's vocabulary

The plugin reads only the fields it needs. It never imports the engine: its loose Zod schemas are in `server/board-vocabulary.ts` (the kinds are in `board-vocabulary-run.ts`, `board-vocabulary-engine.ts`, and `board-vocabulary-review.ts`, and the pieces they share in `board-vocabulary-shapes.ts`), and extra fields are fine.

A record is `{ seq, time, kind, ticket, role, content }`. Unknown kinds are skipped quietly, so the engine can add kinds before the board reads them.

### Kinds the engine journals today

Each kind has a row in a table on one of these pages: what the panel shows and what the chat gets.

- [The run, its tickets, and their agents](vocabulary-run-kinds.md): starting and resuming, intake, snapshots, worktrees, the baseline, and what each agent does.
- [Checks, joins, stuck tickets, and the PR](vocabulary-ticket-kinds.md): commits, gates, joins and rebases, stuck tickets, owner replies, and the PR.
- [Stops, limits, the final review, and memory](vocabulary-engine-kinds.md): a stopped run, plan limits and the usage line, the decision model, agent messages, the final review, memory, and the scheduler's steps.

### Replies and stuck work (#366)

The engine reads the replies a stuck ticket offers (`retry #n`, `skip #n`, `stop`) and a stuck final review offers (`retry`, `stop`, `ship`) on the spec issue, and the other tickets keep building while one is stuck. A run can also end with `stopped_by_user` (reply `stop`) or `all_skipped`; those come through the usual `ended` message.

The engine journals a few more #366 kinds the board doesn't show; they are skipped quietly as unknown kinds: `stuck_reported` (the engine told the spec issue a ticket, the run, or the final review is stuck), `comment_read` (a comment it read on the spec issue while waiting), `final_review_retried` (a `retry` of the stuck final review; the `reply_received` before it already moved the board on), `join_undone` (a stuck ticket's join was undone on the run branch, never pushed), and `baseline_prepared` (the repo's prepare command before a ticket's baseline tests, #481; a failed one is shown by the `ticket_stuck` after it).

`lens` is one of `architecture`, `simplification`, `security`, `integration`, or `rules`.

### The limit and usage shapes

The engine journals these with `ticket` and `role` set to `null`, except `usage_recorded` with scope `ticket`, whose `ticket` is that ticket.

```ts
// limit_wait_started
{
    resets_at: string | null // when the limit resets; null if not known
    until: string // when the engine wakes; always set
    rate_limit_type: string | null // 'five_hour', 'seven_day', 'seven_day_opus', ...
    hit_ticket: number | null
    hit_role: string | null
}

// limit_wait_ended
{ until: string }

// usage_line_wait_started
{
    window: 'seven_day' | 'five_hour'
    line: number // the usage line, in percent
    percent: number // how full the window was, 0 to 100
    resets_at: string // when the window resets
    until: string // when the engine wakes at the latest
}

// usage_line_wait_ended
{ until: string; reason: 'reset' | 'line_raised' }

// usage_recorded
{
    scope: 'ticket' | 'run'
    ticket: number | null
    agent_turns: number
    tokens: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
    windows: Record<string, { from: number; to: number; used: number }> // percents, 0 to 100
}
```

Windows in words: `five_hour` is "five-hour", `seven_day` is "weekly", `seven_day_opus` is "weekly Opus", and `seven_day_sonnet` is "weekly Sonnet". Any other window shows its raw name.
