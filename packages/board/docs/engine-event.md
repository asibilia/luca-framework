# Luca board: the `engine.event` contract

How the engine sends its journal to the plugin. It goes on from
[The route](the-route.md).

## The `engine.event` contract

The engine calls the plugin RPC `engine.event`, through Paseo's `invokePluginRpc` on plugin `luca-board`. Keys are snake_case.

```ts
// input
{
    run_id: string
    token: string // LUCA_BOARD_TOKEN, as handed to the engine at spawn
    records: Array<{
        seq: number // int >= 1
        time: string
        kind: string
        ticket: number | null
        role: string | null
        content: unknown
    }>
    ended: null | { ok: boolean; message: string }
}

// output
{ ok: boolean; next_seq: number; message: string }
```

- `records` are the engine's journal records, verbatim.
- **Order.** The plugin applies records in seq order, starting at the run's `next_seq` (1 for a new run):
  - A seq below `next_seq` is a duplicate, and is ignored.
  - If the first new seq is above `next_seq`, that's a gap. Nothing past it is applied, and the reply's `next_seq` tells the engine where to resend from.
  - The engine should always resend from the `next_seq` it gets back.
- **`ended`** marks the run's engine as finished, ok or failed, with its message. The header row and the panel show it. It isn't applied while there's a gap.
- **Rejected sends.** An unknown `run_id` or a wrong `token` gets `ok: false, next_seq: 0`, and nothing is applied.
- **Bad records.** A record whose content doesn't fit the board's vocabulary is skipped and logged. A record of an unknown kind is skipped quietly. Either way it still counts as applied, and the plugin never throws on a record.
- **Plugin restart.** The run registry lives in `$LUCA_BOARD_STATE_DIR/runs.json`, or `~/.local/state/luca/board/runs.json` by default. For each run it keeps the run id, token, agent, workspace, repo, and spec, plus `ended` (how its engine ended, once it did) and `restarts` (how often the plugin restarted it). It is read at startup, and read again and written on every change, so a change keeps the runs another plugin copy (such as a second copy during a reload) wrote since. Board state lives only in memory. After a restart the plugin still knows the run, and a run whose engine ended still shows how it ended. The plugin rebuilds its board from its journal on disk (see [Journals on disk](the-route.md#journals-on-disk)), so its `next_seq` is past the journal's last record. The engine's next send (from its own cursor, which may be behind, since its sends failed while the plugin was down) is then mostly duplicates, and the reply's `next_seq` moves the engine past them. Duplicates still add their chat rows once: for a run whose engine hasn't ended, the plugin keeps the rows of the records it rebuilt from disk, and adds a record's rows (and an updated header row) the first time the engine sends that record again. The engine never resends the records below its cursor, so the chat already has those, and their kept rows are dropped. Rows are keyed by run id and seq, so adding one again updates it in place. Without a runs folder the plugin rebuilds nothing: `next_seq` is 1 again, and the engine resends the whole journal.
