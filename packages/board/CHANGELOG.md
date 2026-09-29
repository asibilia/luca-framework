# @luca/board

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
