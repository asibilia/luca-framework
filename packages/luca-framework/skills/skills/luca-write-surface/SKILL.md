---
name: luca-write-surface
description: >
  Reference for the `luca` CLI write surface — the deterministic command
  track for structured and operational mutations of the .luca/ workflow
  directory (state, roadmap, preferences, todos, checks, pr-review,
  repo-cleanup, workflow-reset, branch-guard, confidence). Each command is a
  noun/verb pair invoked via Bash; payloads are small flags or a --file JSON
  path. Documents every subcommand, its arguments, and its pipelineStep
  rules.

  Use when a Luca skill or agent needs to read or mutate .luca/ workflow
  state, advance the pipeline, manage the backlog, or run verification — i.e.
  anything that is NOT a freeform phase artifact file.
---

# luca-write-surface Skill

The `luca` CLI is the **structured / operational** track of the Luca write
surface. It is invoked via `Bash` and mutates `.luca/` through validated,
deterministic handlers — never a raw file write.

This skill covers the **18 CLI commands only**. The 9 freeform phase
artifact files (research, context, plan, plan-review, summary, wave, verify,
audit, learn) have **no CLI command** — they are written with the native
`Write` tool to their canonical path. That convention is documented
separately.

## Invocation shape

```
luca <noun> <verb> [--flags] [--file <path>]
```

- **Small scalar params** are passed as flags.
- **Large structured payloads** (arrays, objects) are passed as a `--file`
  pointing at a JSON file you stage first. The CLI reads and `JSON.parse`s
  it.
- Output: the command prints a human/JSON result to stdout and exits `0` on
  success, `1` on error (validation failure, phase refusal, handler error).
- Run `luca <noun> <verb> --help` for the authoritative argument schema.

## Phase rules

Some commands are restricted to specific `pipelineStep`s. Before running, the
CLI reads `.luca/state.json` and **refuses with exit 1** if the current step
is not allowed. Pure reads have no restriction.

| Command | Allowed pipelineSteps |
|---|---|
| `roadmap create` | `idle`, `triage` |
| `checks run` | `execute`, `checks` |
| all other commands | any (pure reads or phase-agnostic mutations) |

## Commands

### `state` — workflow state machine

- **`luca state read`** — read the full `.luca/state.json` (pipelineStep,
  currentPhase, iteration counters, roadmap). Pure read.
- **`luca state advance --to-step <step>`** — atomically advance the
  pipelineStep. The transition is validated against the pipeline-transitions
  table; illegal jumps are rejected.

### `phase` — active phase inspection (read only)

- **`luca phase current`** — report the active phase as
  `{ active, NN, slug, dir }`, or `{ active: false }` when none is active.
  Use the `dir` field as the base path when writing artifact files with the
  native `Write` tool. Pure read.

### `roadmap` — workflow roadmap

- **`luca roadmap read`** — read the roadmap array plus currentPhase /
  totalPhases. Pure read.
- **`luca roadmap create --file <path>`** — replace the roadmap. The file
  holds the phases array: `[{ name, deps?, status?, complexity? }, ...]`.
  Resets currentPhase to 0. Allowed only in `idle` / `triage`.

### `preferences` — project preferences in config.json

- **`luca preferences read`** — read the validated `preferences` section of
  `.luca/config.json`. Pure read.
- **`luca preferences write --file <path>`** — section-level shallow merge
  into the preferences. The file holds the partial preferences object. The
  merged result is validated against `ProjectPreferencesSchema`.

### `todo` — backlog (MuninnDB-backed)

Todos live in MuninnDB; these commands validate the shape and emit a
`muninn_*` instruction for the agent to execute (delegation pattern).

- **`luca todo add --title <t> [--body <b>] [--status pending|backlog]
  [--source <s>] [--id <id>] [--metadata-file <path>]`** — create a todo.
- **`luca todo list [--status <s>] [--limit <n>]`** — list todos
  (limit 1-200, default 50).
- **`luca todo update --id <id> --title <t> --status <s> [--body <b>]
  [--source <s>] [--verification-criterion <id>] [--metadata-file <path>]`**
  — update a todo. Promoting `--status done` requires
  `--verification-criterion` pointing at a met PASS criterion in the active
  phase's verify.json.

### `pr-review` — PR-review analysis (read only)

Used by the gh-pr-address flow. Each takes a JSON `--file` payload.

- **`luca pr-review filter-stale --file <path> [--head-sha <sha>]
  [--max-drift-lines <n>]`** — file holds the comments array; drops comments
  whose cited code was rewritten.
- **`luca pr-review detect-convergence --file <path>
  [--line-tolerance <n>]`** — file holds the findings array; promotes
  cross-perspective clusters to must-fix.
- **`luca pr-review regression-check --file <path>`** — file holds the full
  payload `{ before, after, touched_paths?, from_sha?, to_sha? }`. Exits 1
  when regressions are present.

### `repo` — repository housekeeping

- **`luca repo cleanup-apply --file <path> [--confirm]`** — apply one
  shadow-scan remediation finding (file holds a single `ShadowScanFinding`).
  Without `--confirm` it is a no-op preview — nothing is deleted or moved.

### `checks` — verification commands

- **`luca checks run --file <path> [--timeout-ms <ms>]`** — run an ordered
  list of commands sequentially with per-command timeouts. File holds the
  commands array `[{ argv: string[], label? }, ...]`. Allowed only in
  `execute` / `checks`.

### `branch` — git branch guard

- **`luca branch guard [--default-branch <name>]`** — exits 1 when the
  current branch equals the default branch (default `main`). Use before
  committing.

### `workflow` — workflow lifecycle

- **`luca workflow reset [--confirm]`** — reset `.luca/state.json` to idle
  defaults and clear the pipeline lock. Destructive but recoverable;
  requires `--confirm`.

### `confidence` — confidence logging

- **`luca confidence log --score <0..1> --stage <s> --rationale <r>
  [--metadata-file <path>]`** — append a confidence entry to the active
  phase's confidence.jsonl.

## Error handling

- **Phase refusal** — exit 1, message names the allowed pipelineSteps. Do
  not work around it; advance the pipeline correctly first.
- **Invalid arguments** — exit 1, message lists each schema violation.
- **Handler error** — exit 1 with the handler's message verbatim.

Always check the exit code; a non-zero exit means the mutation did not
happen.
