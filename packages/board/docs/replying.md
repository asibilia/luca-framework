# Luca board: replying from the board

The reply buttons on stuck work, and **Help me**.

## Replying from the board

A stuck card's replies are buttons (#503), in the panel's **Needs you** and in the chat's stuck rows. Each button is one word the engine takes for that stuck item, and no other:

| Stuck | Buttons |
| --- | --- |
| a ticket | `retry #n`, `skip #n`, `stop` (always with the ticket, since a bare word only works while one ticket is stuck) |
| the final review | `retry`, `stop`, `ship` |
| the run, on its budget | `retry`, `stop` |

Tap one, and the card asks first: "Post `retry #134` on spec #133?". Tap **Post**, and the plugin RPC `reply.post` posts it as a comment on the spec issue. The card then shows it was posted, and "The engine took it." once the journal has the engine's `reply_received` for it. The engine reads the spec about once a minute. Once a reply is posted for a stuck item, its other buttons lock, since the engine takes only the first reply.

**`reply.post`.** Keys are snake_case.

```ts
// input
{ run_id: string; key: string; reply: string } // key: `ticket-<n>`, `final`, or `run`

// output
{
    ok: boolean
    status: 'posted' | 'already_posted' | 'refused' | 'failed'
    message: string // in words, for the card
    posted: { key, since, reply, posted_at, comment_url, taken_at } | null
}
```

It never trusts the button. Before it posts, it checks again:

- **The run and the item.** The run is one the board knows, not a demo, and names its spec. Its board has the item stuck under `key` now, and `reply` is one of that item's buttons. Anything else is `refused`, and nothing runs.
- **Once per stuck item.** The same reply again (a double tap, the panel and a chat row, or a second tap while it is in flight) posts nothing and answers `already_posted`. A different word for the same stuck item is `refused`. A ticket stuck again later is a new item, with its buttons open again. What was posted is kept in the plugin's memory, so a plugin restart forgets it.
- **The owner.** The engine only counts the spec owner's replies (the spec issue's author). The plugin asks `gh api user --jq .login` who is signed in and compares it, without case, with the owner from the journal (`spec_snapshot` or `intake_read`). A journal without the owner is answered by `gh issue view <spec> --json author,url`. If they differ, it doesn't post, and the card says so: "You're signed in to gh as x, but spec #133 is y's. The engine only counts y's replies, ..."

Then it runs `gh issue comment <spec> --repo <owner/repo> --body <reply>` in the run's repo folder. The repo comes from the spec's URL. `gh` always gets an argument list, never a shell, and `GH_PROMPT_DISABLED=1`. A `gh` that fails (not signed in, no access, a timeout after 30 s) is `failed`, with `gh`'s own words, and the reply can be tried again.

The plugin looks for `gh` in `LUCA_GH`, then the daemon's `PATH`, `/opt/homebrew/bin`, `/usr/local/bin`, and `~/.local/bin`. Posting needs no engine token, so the buttons work for runs the plugin didn't start (read-only runs) too.

**Help me.** Each stuck card also has **Help me**. It sends `/luca-unstick <run id> #<ticket>` (or `/luca-unstick <run id>` for the final review or the run budget) as a prompt to a chat's agent, through Paseo's `agents.ref(id).send`, so an agent can look into why it is stuck. From a chat's stuck row, that chat gets it. From the panel, the chat the run started in gets it. A run the plugin didn't start has no chat, so the panel copies the command instead, for you to paste in a chat (it copies too when the send fails, for example because the chat is gone). The `/luca-unstick` skill itself ships with Luca's skills.
