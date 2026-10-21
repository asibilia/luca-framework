# @luca/engine: the decision model

## The decision model in shadow mode

The **decision model** is Cloudflare's **Clef**, on Workers AI (#534; before
it, TypeSafe's Jev, so the code's folder and the journal's record kinds keep
the `jev` name and old journals still read). `runEngine({ ..., jev })` asks
it around each step in **shadow mode**: every call and answer goes in the
journal, and the engine still acts on its own fixed choices. `decide` never
reads these records. The one exception is the model pick for a role whose
**model floor** is below Opus (see below).

| Job | Asked | The engine's fixed choice |
| --- | --- | --- |
| `ticket_order` | Before a ticket's worktree: which ticket next? (Only tickets with no worktree are candidates.) | The ticket it is starting. |
| `agent_model` | Before each fresh test-writer and implementer, and the learner: which model? It offers the models at or above the role's floor (all three, `opus`, `sonnet` and `haiku`, when the floor is `opus`). Its facts add the `role` and the `try`. Never for a follow-up, a final-review fixer, the ticket reviewer, or a lens, nor after the role failed a try on the ticket on a cheaper model, nor on a crash redo that kept its first try's model. | `opus`. |
| `agent_skills` | Before each agent: which stock skills? (one yes/no each) | None. |
| `failure_kind` | After a failure: `code`, `test`, `agent`, or `clash`? | Where the engine routes it. |
| `finding_severity` | After a ticket review with findings: how severe is each? | The reviewer's severity. |

`ticket_model` (one model per ticket, before its worktree) is no longer
asked; old journals with it still read.

Each call writes `jev_asked` (the job, the request, the fixed choice, the
`model` asked, and `acted`: `true` for an `agent_model` ask of a role whose
floor is below Opus, `false` for a shadow ask; old journals read it as
`false`), then `jev_answered` (the answers, each with its value
and confidence, and the `model` that answered) or `jev_failed`
(`missing_credentials`, `rejected`, `timeout`, or `error`; old journals also
hold Jev's `missing_key`). Both point back with `asked_seq`. An error or a
timeout is journaled and the run goes on, and the next ask tries again. Each
call waits at most `timeout_ms` (default 10 seconds).

**Credentials.** The engine reads them itself from **Luca's own env file**,
`~/.config/luca/.env` (or `$XDG_CONFIG_HOME/luca/.env`), the same for runs
the board starts and runs started in a terminal. It never reads a repo's
`.env`. Put in:

```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-workers-ai-token
```

`CLOUDFLARE_AUTH_TOKEN` works as the token too (`CLOUDFLARE_API_TOKEN` wins).
A key set in the process env wins over the file, key by key. Note that Bun
loads the `.env` of the folder it starts in, so a `luca-run` started by hand
in a repo whose `.env` sets these keys uses the repo's; the board starts the
engine with `--no-env-file`, so board runs never do. `luca doctor` says
whether Clef is set up, and which keys to add where.

**Off for the run.** With no credentials, the decision model is off from
the start: one line (`decision model off: No Cloudflare credentials: add
... to <file>.`) and one `decision_model_off { model, reason:
'no_credentials', detail }` record, and nothing is asked. When Cloudflare
turns the token down (HTTP 401 or 403), that ask's `jev_failed` says
`rejected`, then one `decision_model_off { reason: 'rejected' }` and one
line, and no later ask in the run is sent or journaled. The off switch
belongs to the run (each `runEngine` call), never the process.

**The model.** `decision_model.model` in `.luca/config.json` picks it:
`@cf/cloudflare/clef` (the default, the accurate one) or
`@cf/cloudflare/clef-flash` (the fast one). It is fixed for a run at start,
like `checks`, so a run's asks are all of one model.

**Model floors (#603).** The `models` block in `.luca/config.json` sets
each routed role's floor, the cheapest model it may run on, and the
`confidence_bar` (default 0.8):

```json
{ "models": { "floors": { "test-writer": "sonnet" }, "confidence_bar": 0.8 } }
```

Only `test-writer`, `implementer` and `learner` have floors; one left out is
`opus`, and a floor for any other role fails the config check, since
reviewers always run Opus. Like `decision_model`, the block is fixed for a
run at start. The launch step reads the answer it just journaled and picks
the model (`pickModel` in `jev/model-pick.ts`); the first match wins:

1. The ticket reviewer or a lens: `opus`, reason `locked`.
2. The role already used up a try on this ticket on a model cheaper than
   Opus (#604): `opus`, reason `after_failure`, with no `agent_model` ask.
   Only a failure that counts as a try counts, so an `engine` failure
   doesn't; it is per ticket, and an owner's `retry` keeps it.
3. The role's floor is `opus`: `opus`, reason `floor`.
4. No answer (off, timed out, errored, or not asked): `opus`, `no_answer`.
5. Confidence below the bar or missing, or a model not offered: `opus`,
   `unsure`.
6. Otherwise the decision model's pick, reason `decision_model`.

A launch step a crash cut off is redone on the model and reason its first
try journaled, with no new ask; if it journaled none, it picks as above.

Each `agent_started` names its `model` and `model_reason` (older journals
read both as `null`). A follow-up, a failed try's included, keeps its
session's model and reason, so one session never switches models; the
step-up comes at the role's next fresh agent. The final review's fixers
always launch on `opus`, reason `locked`. A role's effort (#659) applies
whichever model it runs on.

```ts
import { createClefClient, loadDecisionModelCredentials, runEngine } from '@luca/engine'

const credentials = await loadDecisionModelCredentials({ env: process.env, home: homedir() })
if (credentials.ok) {
    const client = createClefClient({ credentials, model: '@cf/cloudflare/clef' })
    await runEngine({ journal, tracker, git, launcher, jev: { client } })
}
```

`runSpec` and `resumeRun` do this for you: they take `decision_model: {
credentials }` and journal the off record when there are none. Leave `jev`
out to run without the decision model; the journal is then exactly as
before. With many tickets at once, the asks after a step look only at the
new records of that step's own ticket.
