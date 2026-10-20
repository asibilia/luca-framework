# @luca/board

## 14.0.0-alpha.19

### Minor Changes

- 23edf53: Spec: a board that shows it's alive: live cards, model tags and Clef's picks, waits that say why, and read-only Haiku helpers ([#625](https://github.com/asibilia/luca-framework/issues/625))

### Patch Changes

- 5b737bc: Split the board's `reduce-board.ts`, `board-panel.tsx`, `board-server.ts`, `board-state.ts` and test fixtures, the engine's `claude-launcher.ts`, `gate-runner.ts` and `journal-record.ts`, and seven big test files, so spec #625's tickets have room under the repo's 5,000-token file limit. No behaviour change: every module keeps its exports, and the test count and names are unchanged.

## 14.0.0-alpha.18

### Minor Changes

- 930bea2: Spec: fewer stops from the machine (Wave 2): GitHub retries, test slots, environment failures, one run per repo, findings to the right role ([#589](https://github.com/asibilia/luca-framework/issues/589))

### Patch Changes

- d52eedc: Split `run-modes.ts`, `engine-config.ts`, `decide-build.ts`, `role-prompts.ts`, `decide-final-review.ts` and the board's `board-vocabulary.ts`, four big test files, the board README and two engine docs pages, so spec #589's tickets have room under the repo's 5,000-token file limit. No behaviour change: every module keeps its exports, and the test count and names are unchanged.

## 14.0.0-alpha.17

No changes in this release.

## 14.0.0-alpha.16

No changes in this release.

## 14.0.0-alpha.15

No changes in this release.

## 14.0.0-alpha.14

### Patch Changes

- 78e24c4: Spec: fewer false stops (Wave 1): reviewers, docs, Clef choices, seq citations, board states ([#552](https://github.com/asibilia/luca-framework/issues/552))

## 14.0.0-alpha.13

### Patch Changes

- b0a59a5: A repo can give its test commands longer than 5 minutes with `test_timeout_ms` in `.luca/config.json` (#542). Every run of a test command uses it (baseline, red check, already-done check, gates), for both `bun` and `pass_fail` commands; types and lint keep 5 minutes. A test command that runs out of time says so and names `test_timeout_ms`, and a resume picks up a new value.

## 14.0.0-alpha.12

### Patch Changes

- 58fbb72: Shadow mode now asks Cloudflare's Clef instead of Jev (#534). Jev never answered in a board-started run, because its key had no place to live (#522).

  The engine reads Clef's credentials from Luca's own env file, `~/.config/luca/.env` (or `$XDG_CONFIG_HOME/luca/.env`), the same for runs the board starts and runs started in a terminal. It never reads a repo's `.env`. To turn it on, put this in that file:

  ```
  CLOUDFLARE_ACCOUNT_ID=your-account-id
  CLOUDFLARE_API_TOKEN=your-workers-ai-token
  ```

  - With no credentials, the decision model is off for the run: one line and one `decision_model_off` record at the start, and no asks (no more flood of `jev_failed`).
  - If Cloudflare turns the token down, that ask is journaled as `rejected`, the decision model turns off, and the run asks nothing more.
  - `luca doctor` has a new "Decision model" check: OK when Clef is set up, else a warning naming the file and the keys to add. It never shows the token.
  - `decision_model.model` in `.luca/config.json` picks `@cf/cloudflare/clef` (the default) or `@cf/cloudflare/clef-flash`.
  - The journal keeps the `jev_asked`, `jev_answered`, and `jev_failed` kinds, now with the model's name, so old journals still read. The board shows `decision_model_off` as one quiet line.

## 14.0.0-alpha.11

No changes in this release.

## 14.0.0-alpha.10

No changes in this release.

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

- bdfc285: A stuck card's replies are buttons: tap `retry`, `skip`, `stop`, or `ship`, confirm, and the board posts it on the spec for you. "Help me" starts `/luca-unstick` in the chat (#503).

## 14.0.0-alpha.4

### Patch Changes

- befad59: A spec can hold tickets for a person: `ready-for-human` tickets, and the tickets that wait on them, are left out of the run instead of refusing it (#499).

## 14.0.0-alpha.3

### Patch Changes

- 4bd296d: A crashed run whose engine is gone no longer blocks `luca upgrade` (#491), and `/luca-run resume <run id>` picks a run back up with the board attached (#493).
- 4bd296d: When a rebase makes a ticket's tests wrong, the test-writer gets a turn to update them instead of the ticket getting stuck (#489), and a stuck bad test keeps the implementer's reason (#490).

## 14.0.0-alpha.2

### Patch Changes

- a2837cf: A ticket whose work is already on the base branch counts as done, not stuck, and the board shows it calmly. The PR names the spec's open tickets that weren't in the run (#484).

## 14.0.0-alpha.1

### Patch Changes

- 8a58510: Spec: Luca v14 fixes: no empty changesets, board version, init sets up the repo ([#480](https://github.com/asibilia/luca-framework/issues/480))
