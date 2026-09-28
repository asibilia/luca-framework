# @luca/engine

## 14.0.0-alpha.2

### Patch Changes

- a2837cf: A ticket whose work is already on the base branch counts as done, not stuck, and the board shows it calmly. The PR names the spec's open tickets that weren't in the run (#484).
- a2837cf: Files the prepare command makes stay out of the ticket's changes, and an odd path in a worktree (like a symlinked folder) no longer crashes the run (#486).
- a2837cf: The prepare command gets its own time limit (30 minutes by default, `prepare_timeout_ms` in `.luca/config.json`), and a command that times out is stopped with everything it started (#485).

## 14.0.0-alpha.1

### Patch Changes

- 8a58510: Spec: Luca v14 fixes: no empty changesets, board version, init sets up the repo ([#480](https://github.com/asibilia/luca-framework/issues/480))
