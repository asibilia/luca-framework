# @luca/engine

## 14.0.0-alpha.9

### Patch Changes

- a9a7e02: The domain-words file is now `GLOSSARY.md` (was `CONTEXT.md`), the name Matt Pocock's skills v1.3 look for. Docs and comments point to the new name; no behaviour change.

## 14.0.0-alpha.8

### Patch Changes

- 156f004: Undoing a stuck ticket's join never rewinds the run branch over other work (#519). No ticket joins while a stuck ticket's join is still on the run branch. An undo that takes later joins with it clears those tickets' joins too, so they join again instead of being undone a second time. An undo that would rewind over other work is refused: the run branch is left alone and the ticket is stuck (`undo_refused`). A ticket already joining finishes its join before a retried ticket joins.

## 14.0.0-alpha.7

### Patch Changes

- 2b6686a: A resumed run now reads the repo's `.luca/config.json` again and takes its new `prepare`, `prepare_timeout_ms`, and `prepare_concurrency`; every other field, such as `checks`, stays as the run started with it. A config it can't use is noted in the journal and on the board, and the run goes on with its own (#516).

## 14.0.0-alpha.6

### Patch Changes

- 09716cc: Spec: fewer false stops, and a PR that always opens ([#510](https://github.com/asibilia/luca-framework/issues/510))

## 14.0.0-alpha.5

### Patch Changes

- bdfc285: New `/luca-unstick` skill, installed by `luca init` and `luca upgrade`: it explains why a run is stuck, fixes what it safely can, and posts the reply for you after you confirm (#504).

## 14.0.0-alpha.4

### Patch Changes

- befad59: A spec can hold tickets for a person: `ready-for-human` tickets, and the tickets that wait on them, are left out of the run instead of refusing it (#499).
- befad59: A refusal no longer crashes when the repo lacks a label: the engine creates it, and a labeling failure can't stop the refusal (#500).

## 14.0.0-alpha.3

### Patch Changes

- 4bd296d: The engine checks a test-writer's "already done" evidence (the commits are on the base, the named tests exist and pass) before counting a ticket as done (#495).
- 4bd296d: A crashed run whose engine is gone no longer blocks `luca upgrade` (#491), and `/luca-run resume <run id>` picks a run back up with the board attached (#493).
- 4bd296d: Prepare runs one at a time by default (`prepare_concurrency`) (#492), a commit with nothing left to commit no longer crashes the run (#494), and prepare's files from before an upgrade aren't committed (#496).
- 4bd296d: When a rebase makes a ticket's tests wrong, the test-writer gets a turn to update them instead of the ticket getting stuck (#489), and a stuck bad test keeps the implementer's reason (#490).

## 14.0.0-alpha.2

### Patch Changes

- a2837cf: A ticket whose work is already on the base branch counts as done, not stuck, and the board shows it calmly. The PR names the spec's open tickets that weren't in the run (#484).
- a2837cf: Files the prepare command makes stay out of the ticket's changes, and an odd path in a worktree (like a symlinked folder) no longer crashes the run (#486).
- a2837cf: The prepare command gets its own time limit (30 minutes by default, `prepare_timeout_ms` in `.luca/config.json`), and a command that times out is stopped with everything it started (#485).

## 14.0.0-alpha.1

### Patch Changes

- 8a58510: Spec: Luca v14 fixes: no empty changesets, board version, init sets up the repo ([#480](https://github.com/asibilia/luca-framework/issues/480))
