# The story format, field by field

A story is one JSON object. Every key is `snake_case`. `story-example.json`, next to this file, is a whole valid story. The schema itself is `packages/engine/src/story/` in `asibilia/luca-framework`; the helper's `check` command runs it. This is version 1 (`schema_version: 1`).

A field marked *nullable* takes `null`, never a missing key. Every text field must hold real words: an empty string fails the check.

## Top level

| Field | What goes in it |
| --- | --- |
| `schema_version` | `1` |
| `repo` | `owner/name` |
| `pr_number`, `pr_url`, `title` | From `gh pr view` |
| `base_ref`, `head_ref` | The branch names |
| `head_sha` | The full commit id the story was written for (`headRefOid`) |
| `base_sha` | The full commit id of the merge base the diff is read against |
| `written_at` | Now, as `2026-11-10T12:00:00Z` |
| `written_by` | Who wrote it: the agent and model |
| `summary`, `map`, `stops` | Below |

## `summary`: the whole PR

| Field | What goes in it |
| --- | --- |
| `kind` | `enhancement`, `fix`, `refactor`, `docs`, `test`, `chore`, or `mixed` |
| `what_changed` | A few plain sentences |
| `before`, `after` | How it behaved, and how it behaves now |
| `feedback_wanted` | `{ text, source }`. `source` is `author` when the PR itself says what to look at, `guessed` when it is what you were least sure about |
| `counts` | `files_added`, `files_changed`, `files_deleted`, `lines_added`, `lines_removed`, from `git diff --stat`. A renamed file counts as changed |
| `review_minutes` | A rough whole number |
| `flags` | The flags that matter most for the whole PR (a list of flags, below). Empty when nothing is off |

## `map`: the structure

| Field | What goes in it |
| --- | --- |
| `entry_path` | The file the walk starts in. It must be the first stop's file |
| `files` | One per changed file: `path`, `status` (`added`, `modified`, `deleted`, `renamed`), `previous_path` (*nullable*; the old path of a rename), `role` (what the file is for, one line), `in_walk` (false when it is read in the loose ends) |
| `links` | How files link: `from_path`, `to_path`, `kind` (`calls`, `imports`, `reads`, `tests`, `configures`), `note` (*nullable*). Either end may be a file the PR doesn't change |
| `architecture_note` | New modules, moved boundaries, things removed. Say "No change to the architecture." when that is so |

Every changed file is in `files`, and every file in `files` has at least one change in a stop.

## `stops`: the walk

An ordered list. Each stop:

| Field | What goes in it |
| --- | --- |
| `id` | Unique, such as `s1` |
| `kind` | `walk`, or `loose_ends` for the one last stop of changes outside the call chain |
| `path` | The file this stop visits. `null` for the loose ends |
| `title` | A few words |
| `why_here` | Why the walk comes here now |
| `changes` | At least one change (below). In a `walk` stop, all are in the stop's file |

## A change: one changed region and its context

| Field | What goes in it |
| --- | --- |
| `id` | Unique in the story, such as `c1` |
| `path` | The file |
| `side` | `head`: the lines are in the new file. `base`: the lines are in the old file, for a region or file that was only deleted |
| `start_line`, `end_line` | The region, checked against the file |
| `symbol` | *nullable*. The function, type, or section changed |
| `title` | A few words naming the change |
| `how_we_got_here` | `{ from_change_id, text }`. `from_change_id` is the earlier change that calls or needs this one; `null` at the starting point and in the loose ends |
| `why_needed` | Why the change exists |
| `architecture_note` | What it means for the architecture, or "None." |
| `check_this` | The one thing the reviewer should verify here |
| `proof` | `{ covered, tests, note }`. `tests` is a list of `{ path, line, name }` (`line` and `name` *nullable*). `covered` is true exactly when `tests` is not empty. With no test, `note` says "No test covers this." A change that is itself a test lists itself |
| `serves` | `{ found, refs, note }`. `refs` is a list of `{ label, url, quote }` (`url` and `quote` *nullable*). `found` is true exactly when `refs` is not empty |
| `blast_radius` | `{ dependents_total, dependents_outside_pr, dependents, note }`. `dependents` lists every caller or user as `{ path, line, in_pr }` (`line` *nullable*). `dependents_total` equals the length of the list; `dependents_outside_pr` equals how many have `in_pr: false`. `note` says how you counted |
| `flags` | A list of flags. Empty when nothing is off |

## A flag

Something that is off, named so it can be checked. Never a grade or a score.

| Field | What goes in it |
| --- | --- |
| `kind` | `convention` (a repo rule), `cleanliness` (code hygiene), or `risk` (could break something) |
| `rule` | The rule, in a few words: "No classes" |
| `rule_source` | *nullable*. The file the rule comes from: `AGENTS.md` |
| `path`, `line` | Where it is broken. `line` is *nullable* |
| `message` | What is off, in one sentence |

## What the check refuses

- A missing key (a key written in camelCase counts as missing), an empty text, a short commit id.
- Two stops or two changes with the same `id`.
- A `walk` stop without a `path`, or with a change from another file.
- Loose ends that are not the last stop, or that have a `path`.
- A walk that doesn't start in `map.entry_path`.
- A file on the map that no stop reads, or a change in a file that isn't on the map.
- `from_change_id` naming a change that comes later, or doesn't exist.
- `end_line` before `start_line`.
- Counts that don't match their lists, and `covered` / `found` that don't match theirs.
