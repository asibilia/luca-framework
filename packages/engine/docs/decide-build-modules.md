# @luca/engine: decide-build modules

`src/core/decide-build.ts` re-exports these modules, so importers don't change. See [modules](modules.md) for the rest.

| Module | What it does |
| --- | --- |
| `src/core/build-action.ts` | `BuildAction`, and the ticket steps' shared args. |
| `src/core/build-launch.ts` | A build agent's launch: run notes, prompt sections. |
| `src/core/decide-ticket.ts` | One ticket's next step: failed turns, install, baseline. |
| `src/core/decide-red-green.ts` | Tests, red check, code, gates, and their commits. |
| `src/core/decide-ticket-review.ts` | The ticket review and its fix rounds. |
| `src/core/decide-rejoin.ts` | Joining the run branch, and rebases with test updates. |
