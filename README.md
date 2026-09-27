# Luca Framework

Luca turns planned work into a reviewed pull request by running a team of AI agents under strict, code-driven control.

You write a **spec** (one feature: the problem, the solution, and how it will be tested) and split it into **tickets**. A **run** takes the spec's tickets through the **engine**: plain code that picks every next step. Agents write the tests, then the code, and a fresh reviewer checks each ticket. The engine runs its own **gates** (tests, type checks, lint) before the run moves on. Finished tickets join one **run branch**, a **final review** looks at the whole branch, and the run ends in one pull request. Everything that happens is written to the run's **journal**, and the **board** shows the run live in Paseo. The domain words are defined in [CONTEXT.md](CONTEXT.md).

## Packages

| Package | What it is |
| ------- | ---------- |
| [`packages/engine`](packages/engine/README.md) | The engine (`@luca/engine`). It drives a run of one spec with Claude agents, keeps the journal, and has the `luca-run` command line. |
| [`packages/board`](packages/board/README.md) | The board, the Paseo plugin `luca-board`. Type `/luca-run <spec>` in a Paseo chat to start a run and watch it in the side panel and the chat. |

## Start a run

From Paseo, install the board plugin and type `/luca-run <spec number>` (or `/luca-run demo` for a practice run with no GitHub and no models). See [Install and try it](packages/board/README.md#install-and-try-it).

From the command line:

```bash
bun packages/engine/src/cli/luca-run.ts --spec <n> [--repo <path>]
bun packages/engine/src/cli/luca-run.ts --demo
bun packages/engine/src/cli/luca-run.ts --resume <run-id>
```

See [The command line: `luca-run`](packages/engine/README.md#the-command-line-luca-run) for every flag.

## Develop

Bun is required.

```bash
bun install                                  # Install dependencies
bunx --bun tsc --noEmit                      # Type check (leaves out packages/board)
bunx --bun tsc --noEmit -p packages/board    # Type check the board
bun test packages                            # Run the tests
bun run lint                                 # Lint
```

These are the engine's own gates for this repo, set in [`.luca/config.json`](.luca/config.json) along with the test file patterns, the rule files, and the memory vault.

## Release (maintainers)

`@alecsibilia/luca` ([`packages/luca`](packages/luca/README.md)) is released with changesets and the [`release.yml`](.github/workflows/release.yml) workflow. The repo is in changesets' pre mode `alpha`, so only `14.0.0-alpha.N` versions go out, under npm's `alpha` tag, and `latest` stays on `13.0.1`.

1. Merge a PR with a changeset. On the push to `main`, the workflow opens or updates the Version PR, "chore(release): version packages (...)".
2. The Version PR is opened by the bot, so its checks don't start on their own: on the PR, click **Approve workflows to run**.
3. Merge the Version PR. The workflow sees no pending changesets and a version that isn't on npm yet, so it publishes: the PR checks, `bun pm pack`, an install of the tarball with `luca-run --demo`, a guard that fails unless the version is `-alpha.N`, `npm publish --tag alpha` over npm trusted publishing (no token), and a GitHub release marked as a prerelease.

Switch on `latest` later, after a real `tmnb` run works, with one reviewed PR that runs `changeset pre exit` and changes the `-alpha.N` guard (and the `--tag alpha`) in `release.yml` together.

## Documentation

- [CONTEXT.md](CONTEXT.md): the domain words
- [docs/README.md](docs/README.md): the docs index
- [AGENTS.md](AGENTS.md): instructions for AI coding agents working on this repo
- [docs/guides/coding-standards.md](docs/guides/coding-standards.md): coding standards

## Old Luca

Old Luca (the `luca` CLI, the `luca-*` packages, the `/lu` pipeline, and their docs) has been deleted. Its last code and docs are at the tag `old-luca-final`. To read a file from it, run `git show old-luca-final:<path>`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
