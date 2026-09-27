# @alecsibilia/luca

Luca turns a spec on GitHub Issues into a reviewed pull request. A run takes the spec's tickets through the engine, plain code that picks every next step, while Claude agents write the tests and the code and a fresh reviewer checks each ticket. The board shows the run live in Paseo.

This is Luca v14, in alpha. Old Luca (v13) is still on npm; see [Coming from v13](#coming-from-v13).

## What you need

- macOS
- the Paseo desktop app, 0.9.1 or newer
- Claude Code 2.1.280 or newer, signed in with a Claude **Pro or Max** plan (not the Free plan, and not an API key)
- [Bun](https://bun.sh)
- git
- the GitHub CLI, `gh`, signed in (`gh auth login`)
- GitHub Issues as your repo's tracker

## First run

1. Install Luca:

   ```bash
   bun add -g @alecsibilia/luca
   ```

   While v14 is in alpha, npm's `latest` is still v13, so install `@alecsibilia/luca@alpha` for now.

2. Set up this computer, once:

   ```bash
   luca init
   ```

3. Set up your repo, once, from inside it:

   ```bash
   luca setup
   ```

4. In Claude Code, in your repo, run `/setup-matt-pocock-skills` so the planning skills know your repo.
5. Write a spec with `/to-spec`, then split it into tickets with `/to-tickets`.
6. In a Paseo chat, type `/luca-run <spec number>`. The board shows the run in the side panel, and the run ends in one pull request.

## Commands

| Command | What it does |
| ------- | ------------ |
| `luca init` | Sets up this computer, once (safe to run again): MuninnDB and its Claude Code entry, the board in Paseo with its engine and Bun paths, and the planning skills (`to-spec`, `to-tickets`, `setup-matt-pocock-skills`, `grilling`, `domain-modeling`). It asks before turning on Paseo's plugins, and leaves skills you already have alone. `--skip-skills` skips the skills. |
| `luca setup` | Gets the repo in this folder ready: the labels a run needs (and the `release:*` labels when the repo uses changesets), `.luca/config.json`, and a check of GitHub sub-issues and dependencies. `--base <branch>` names the base branch. |
| `luca doctor` | Checks this computer, this repo when you're in one, and what v13 left behind. Each problem comes with its exact fix. `luca doctor --fix` fixes what's safe without asking: it never deletes (v13 files go to a dated backup folder) and never commits, and it lists the repo files to commit. |
| `luca upgrade` | Moves to the newest Luca on your channel: `alpha` stays on `alpha`, and it never goes back to v13. It refuses while any run is going (stuck runs and limit waits count) and lists them. Then it reloads the board and says when to run `/reload-skills`. |
| `luca upgrade --to <version>` | Installs that exact version, an older one too, to go back when a version breaks. |

`init`, `setup`, and `upgrade` end with their part of `luca doctor`'s checks.

## Memory

Luca's runs remember what they learn with MuninnDB. `luca init` installs and starts it, adds it to Claude Code as the user-scope `muninn` server, and adds a login item that starts it again after a reboot.

If you run MuninnDB your own way, or want no memory, skip that step:

```bash
luca init --skip-muninndb
```

A run with no `muninn` server in Claude Code has memory off, and `luca doctor` warns "memory off" rather than failing.

## Coming from v13

v14 is a new Luca: `/lu`, `/luca-init`, v13's skills, agents, commands, hooks, and status line are gone. Matt Pocock's skills do the planning, and `/luca-run` does the building. Run `luca doctor --fix` to move what v13 left behind to a backup folder. See the [migration guide](https://github.com/asibilia/luca-framework/blob/main/docs/migrating-from-v13.md).

To stay on v13, don't install v14: v13 stays on npm. One computer holds one global `luca`.

## For maintainers

### Releasing

This package is released with changesets and the [`release.yml`](https://github.com/asibilia/luca-framework/blob/main/.github/workflows/release.yml) workflow. The repo is in changesets' pre mode `alpha`, so only `14.0.0-alpha.N` versions go out, under npm's `alpha` tag, and `latest` stays on `13.0.1`.

1. Merge a PR with a changeset (`bunx changeset`). On the push to `main`, the workflow opens or updates the Version PR, "chore(release): version packages (...)".
2. The Version PR is opened by the bot, so its checks don't start on their own: on the PR, click **Approve workflows to run**.
3. Merge the Version PR. The workflow sees no pending changesets and a version that isn't on npm yet, so it publishes: the PR checks, `bun pm pack`, an install of the tarball with `luca-run --demo`, a guard that fails unless the version is `-alpha.N`, `npm publish --tag alpha` over npm trusted publishing (no token), and a GitHub release marked as a prerelease.

Switch on `latest` later, after a real `tmnb` run works, with one reviewed PR that runs `changeset pre exit` and changes the `-alpha.N` guard (and the `--tag alpha`) in `release.yml` together.

### What's in the package

This is the one package that goes to npm. It's TypeScript source with no build and no bundle, because the engine only runs on Bun. It has two commands: `luca`, for people, and `luca-run`, the engine, which the board starts. At pack time it copies in:

| Folder | What it is |
| ------ | ---------- |
| `engine/` | The engine's source, from [`packages/engine/src`](../engine/src). Both bins point into it. |
| `board/` | The board plugin's folder, from [`packages/board`](../board): `paseo-plugin.json`, its entry points, its client, server, and shared code, and its own `package.json`, so Paseo can install it as a folder source. |
| `LICENSE` | The repo's license. |

Test files and test helpers stay out. The engine and the board stay private workspace packages, and this package lists every package they import at runtime as its own dependency.

### Pack it

Pack it with Bun, from this folder:

```bash
bun pm pack
```

`bun pm pack` runs the `prepack` script ([`scripts/copy-sources.ts`](scripts/copy-sources.ts)), which copies the engine and the board in, then packs, then runs `postpack`, which removes the copies again.

`bun pm pack` leaves out every `bunfig.toml` by default, even one named in `files`. The engine needs its own `cli/bunfig.toml`, because the board starts it with `--config` pointing there. So the script writes an `.npmignore` into `engine/` that puts it back.

It must be packed with Bun. The manifest uses the workspace's `catalog:` and `workspace:` versions, and `bun pm pack` turns them into real versions in the packed `package.json`. A plain `npm pack` ships them unchanged, and an install from that tarball fails. Publish the tarball Bun made:

```bash
npm publish <tarball> --tag alpha
```

npm does the publishing because Bun can't publish over npm's trusted publishing (OIDC) yet.

## License

Apache License 2.0. See [LICENSE](https://github.com/asibilia/luca-framework/blob/main/LICENSE).
