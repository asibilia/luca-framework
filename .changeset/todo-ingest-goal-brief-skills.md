---
"@alecsibilia/luca-tools": minor
---

feat(tools): add the `todo-ingest` and `goal-brief` skills — a lightweight plan-then-execute pair

Two new skills covering the path from a raw batch of task ideas to a backlog an execution team can pick up cold, without the full Luca pipeline.

- **`todo-ingest`** — RESEARCH → PLAN → parallel adversarial REVIEW → DECONSTRUCT into dependency-linked todos → SUMMARY. Research validates the *premise* of each task before planning it, because a meaningful fraction of user-listed tasks turn out to be already-fixed or aimed at the wrong file, and a backlog built on a false premise gets built. Each stage is an explicit barrier: research fully returns before the plan begins, review fully returns before decomposition — persisted todos are write-once in practice (`luca todo update` is full-replace and `muninn_evolve` orphans tree children), so a late finding can only be bolted on as a sibling.
- **`goal-brief`** — composes a short `/goal` prompt from the backlog: dependency waves, same-file conflicts, blocked work, and the rejected approaches recorded in the ingestion session memory, so the execution team does not re-derive analysis already paid for. Compose-only by design; it never performs the work.

Both were validated by A/B evaluation against unaided baselines. Two findings drove the final shape:

- Given go-ahead phrasing ("ok let's run these") against a populated backlog, an unaided agent implements the work every time — editing source, writing tests, spawning executors. The compose-only boundary has to be stated, and stated early, or it does not exist.
- The adversarial review pass in `todo-ingest` earned its cost outright: across three runs it caught a plan that was materially wrong four separate ways, deleted a planned todo whose justification came from an exit code measured through a pipe, and converted unfalsifiable acceptance criteria into checkable ones.
