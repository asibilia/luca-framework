# Running the engine from a global npm install

Question (#440, map #438): can Luca's engine run from a global install of `@alecsibilia/luca`? Where does `bun add -g` or `npm i -g` put it, do its `.ts` bins run under Bun from there, should we ship TypeScript or a build, how do the private workspace packages get into one package, and can a run keep its version while a newer one is installed? This would replace the pinned clone that `luca-release` keeps in `~/.local/share/luca/`.

Sources:

- The code on `main` at `3ba954ac2`.
- Bun 1.3.11 and npm 11.8.0 (Homebrew Node 25.6.0), on this Mac (macOS, Apple silicon).
- Bun's docs: [bunfig](https://bun.com/docs/runtime/bunfig), [`bun add`](https://bun.com/docs/pm/cli/add), [`bun publish`](https://bun.com/docs/pm/cli/publish), [catalogs](https://bun.com/docs/pm/catalogs), [`bun pm`](https://bun.com/docs/pm/cli/pm), and [env vars](https://bun.com/docs/runtime/environment-variables).
- npm's docs: [folders](https://docs.npmjs.com/cli/v11/configuring-npm/folders), [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json), and [`npm publish`](https://docs.npmjs.com/cli/v11/commands/npm-publish).
- Paseo 0.9.2's `~/.paseo/config.json`, and the environment of its plugin processes.

The hands-on checks all happened in temp folders:

- A scratch Bun workspace.
- A candidate `@alecsibilia/luca@14.0.0-alpha.0`, staged from `packages/engine/src` without the tests, and packed with `bun pm pack`.
- Global installs of that tarball under temp prefixes (`npm i -g --prefix <tmp>`, and `bun add -g` with `BUN_INSTALL_GLOBAL_DIR` and `BUN_INSTALL_BIN`). The steps are under "How to repeat".

Nothing was published.

## Short answer

**Yes.** The real engine runs from a global install made by either tool. `luca-run --unfinished` and a full `luca-run --demo`, gates included, both work from `bun add -g` and from `npm i -g`, and both exit 0. Bun runs the `.ts` bin straight through the bin symlink. No build step and no `tsconfig.json` are needed.

- **Where it lives.**
  - **Bun:** `~/.bun/install/global/node_modules/@alecsibilia/luca/`, with bin links in `~/.bun/bin/`. Bun's global folder is one shared project, and v13 already lives in it on this Mac.
  - **npm:** `{prefix}/lib/node_modules/@alecsibilia/luca/`, with bin links in `{prefix}/bin/`. The prefix is `/opt/homebrew` with Homebrew's Node. With nvm, each Node version has its own prefix.
- **Ship TypeScript source, not a build.** The engine calls Bun's own APIs 44 times in 23 files, so it only runs under Bun. Source starts as fast as a bundle (0.22 s vs 0.21 s), and the tarball is 297 KB.
  - A `bun build` bundle would only buy install size. It would drop an unused 202 MB `claude` binary that comes with the Agent SDK.
- **One flat package.**
  - `bun pm pack` and `bun publish` swap `workspace:` and `catalog:` for real versions. `npm pack` doesn't, and then the install fails.
  - A private workspace package can't simply be a dependency: it isn't on npm, so the install gets a 404.
  - `bundleDependencies` is fragile: Bun ignores the bundled copy if the package is also in `dependencies`.
  - So the published folder should hold the engine's source and the board's files itself, and list their public dependencies once.
- **A running engine keeps its version. A restarted one doesn't.**
  - An upgrade swaps the package folder, and both tools do it. A demo that was going when the upgrade happened finished fine: Bun loads all the engine's code at start, and the engine reads nothing from its own folder after that.
  - But the board finds the engine again at every restart (`--resume`) and every `--unfinished` check. So a crashed run comes back on whatever is installed then.
  - Each global location holds one version at a time. Keeping a run on its version across restarts needs one folder per version. Tested: two versions side by side both run.

## Key facts for later tickets

| # | Fact | Matters for |
| --- | --- | --- |
| 1 | `bun add -g`: code in `~/.bun/install/global/node_modules/@alecsibilia/luca/`, bins as relative links in `~/.bun/bin/`. The global folder is one project (`package.json` + `bun.lock`), with its packages hoisted and shared with every other global tool. | #446, #447, #450 |
| 2 | `npm i -g`: code in `{prefix}/lib/node_modules/@alecsibilia/luca/` with its own nested `node_modules`, bins as relative links in `{prefix}/bin/`. The prefix is where Node is installed, so it's per Node version under nvm. | #446, #450 |
| 3 | Both installers make the bin's target executable, and Bun runs a `.ts` target through an extensionless link. `Bun.main`, `argv[1]`, and `import.meta.dir` are the real paths inside the package. | #446 |
| 4 | Run as a command, the bin depends on `bun` being on PATH (`#!/usr/bin/env bun`). With `PATH=/usr/bin:/bin` it fails: `env: bun: No such file or directory`, exit 127. Absolute Bun plus the real `.ts` path always works. | #439, #450 |
| 5 | `npm pack` keeps `workspace:*` and `catalog:`, and `npm i` then fails with `EUNSUPPORTEDPROTOCOL`. `bun pm pack` and `bun publish` swap in real versions. `npm publish <tarball>` can publish a Bun-made tarball. | #442, #446 |
| 6 | A private workspace dependency becomes `"@luca/engine": "0.0.0"`, which isn't on npm, so the install gets a 404. `bundleDependencies` works with npm, but Bun ignores the bundled copy when it's also listed in `dependencies`. | #446 |
| 7 | Install size: about 275 MB. 202 MB (Bun) to 208 MB (npm) of it is `@anthropic-ai/claude-agent-sdk-darwin-arm64`, a `claude` binary the engine never runs: it passes the user's own `claude` from PATH. Another 14 MB is `@anthropic-ai/sdk`, the Agent SDK's peer dependency. No package in the tree has an install script. | #446 |
| 8 | An upgrade swaps the package folder (it gets a new inode) under a running engine, and the run goes on. But the board finds the engine again at every restart and every `--unfinished` check. The journal doesn't record the engine's version. | #447, #448 |
| 9 | The board's fallback list (`~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) misses nvm, a custom npm prefix, and a custom `BUN_INSTALL`. | #450, `luca init` |
| 10 | The engine runs with the target repo as its working folder. So that repo's `bunfig.toml` (top-level `preload`) and `.env` load into the engine. That's true today too. `--no-env-file --config=<file>` stops both. | #426 (v2), board launch |

## Details

### Where each installer puts it

**Bun (`bun add -g`).**

- The docs say globally installed packages go to `globalDir`, which defaults to `~/.bun/install/global`, or `BUN_INSTALL_GLOBAL_DIR`. Their bins are linked in `globalBinDir`, which defaults to `~/.bun/bin`, or `BUN_INSTALL_BIN`. ([bunfig](https://bun.com/docs/runtime/bunfig), [`bun add`](https://bun.com/docs/pm/cli/add))
- Tested: `BUN_INSTALL=<dir>` alone moves all three, to `<dir>/bin`, `<dir>/install/global`, and `<dir>/install/cache`.
- The global folder is a single project. On this Mac, `~/.bun/install/global/package.json` lists `@alecsibilia/luca: ^13.1.0-alpha.0` next to gemini-cli, wrangler, vercel, and others. It has one `bun.lock`, and `node_modules` is hoisted.
  - So Luca shares its dependency tree with every other global tool.
  - The engine already pins exact versions of its three big dependencies (`packages/engine/package.json`), which limits drift.
- Bin links are relative: `~/.bun/bin/luca -> ../install/global/node_modules/@alecsibilia/luca/bin/luca.js` (v13, today).
  - The candidate made `luca-run -> ../global/node_modules/@alecsibilia/luca/engine/src/cli/luca-run.ts`.
  - Bun set the target to mode `777`.
- One slot per package name. `bun add -g @alecsibilia/luca@<v14>` replaces v13 in place, and v14's `luca` bin replaces v13's `luca` bin. The existing `^13.1.0-alpha.0` range won't move to 14 by itself, because 14 is a new major version.
- `bun remove -g @alecsibilia/luca` removes the package and its bin links (tested).
- A `bunfig.toml` in the current folder did **not** change where `bun add -g` installs. Its `globalDir` and `globalBinDir` were ignored, and the install went to `$HOME/.bun`. I did not check whether other local keys, such as this repo's `minimumReleaseAge`, apply to global installs.

**npm (`npm i -g`).**

- The docs: "Global installs on Unix systems go to `{prefix}/lib/node_modules`", and "executables are linked into `{prefix}/bin`". The prefix "defaults to the location where node is installed". ([folders](https://docs.npmjs.com/cli/v11/configuring-npm/folders))
- Here, `npm config get prefix` is `/opt/homebrew`. Under nvm it would be `~/.nvm/versions/node/<version>`, so switching Node versions hides the install.
- The package gets its own nested `node_modules`: 112 packages for the candidate. It shares nothing with other global tools.
- Bin links are relative (`luca-run -> ../lib/node_modules/@alecsibilia/luca/engine/src/cli/luca-run.ts`), and the target was mode `755`.

### Does the bin run under Bun from there

Yes, from both installs:

- **Scratch package:** Bun ran `src/cli.ts` through the extensionless `bin/app-run` link, with a workspace import and zod.
  - `Bun.main` and `Bun.argv[1]` were the real `.ts` path inside the package, not the link.
  - `import.meta.dir` was the real `src` folder.
- **Real engine** (candidate tarball, 115 files, no tests, no `tsconfig.json`):
  - `luca-run --unfinished` printed `{"runs":[]}` from both `$NPM_PREFIX/bin/luca-run` and `$BUN_BIN/luca-run`.
  - `luca-run --demo` ran the whole practice run from both, with scripted agents, gates, a review, and memory. Each ended with `demo PR #13 (in memory): Practice spec (#10)` and exit 0.
- **What the demo doesn't cover:** real Claude agents. That path goes through the Agent SDK, which is loaded at start like everything else, but I didn't run it.

The shebang needs Bun on PATH. `env PATH=/usr/bin:/bin $PREFIX/bin/app-run` failed with `env: bun: No such file or directory` (exit 127). `env PATH=/usr/bin:/bin ~/.bun/bin/bun <real .ts path>` worked.

The board can already run an installed `luca-run` directly, through its shebang (`packages/board/server/engine-launch.ts:137`):

- On this Mac, Paseo's plugin processes have the login shell's PATH, which includes `~/.bun/bin`.
- I found no `bun` shim in Paseo or `~/.paseo`, so I couldn't confirm the note that "Paseo swaps a bare `bun` for its Node" (`engine-launch.ts:89`).
- Either way, an absolute Bun is the safe choice.

### TypeScript source or a build

The engine only runs under Bun:

- Outside the tests, it calls `Bun.file` 19 times, `Bun.write` 11, `Bun.sleep` 5, `Bun.argv` 3, `Bun.which` 2, `Bun.Glob` 2, `Bun.spawn` 1, and `Bun.hash` 1.
- So a Node build is pointless. Any build would target Bun.
- v13 did ship a build: `bin/luca.js` with `#!/usr/bin/env bun`, importing `../dist/index.mjs`, with `engines.bun >=1.0.0`.

Measured with `luca-run --unfinished`, which loads the whole import graph:

| | Source (`.ts` in `node_modules`) | `bun build --target=bun` bundle |
| --- | --- | --- |
| Startup, 5 runs | 0.22 s each (0.31 s with `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`) | 0.20 to 0.23 s |
| Size | 297 KB tarball, about 0.9 MB of `.ts` | `luca-run.js` 12.4 MB, plus a 24.5 MB source map |
| Needs `node_modules` | Yes (about 275 MB installed) | No. The demo ran from a copy with no `node_modules` |
| Build step in CI | None | `bun build` per bin |
| Stack traces | Real file and line | Through the source map |

Source is simpler and just as fast. Bun keeps a transpiler cache for files over a certain size ([env vars](https://bun.com/docs/runtime/environment-variables)), so the second start is cheaper.

The one real gain from a bundle is size. With no dependencies, the 202 MB SDK platform binary goes away:

- The engine always passes `pathToClaudeCodeExecutable` (`packages/engine/src/agents/claude-options.ts:185`), set to the real path of the `claude` on PATH (`packages/engine/src/agents/claude-launcher.ts:225-229`, `:615`).
- So that binary is never run.
- A publisher can't stop the SDK's `optionalDependencies` from installing. A bundle is the only lever.
- The real-agent path inside a bundle is untested.

The engine needs no files beside its `.ts`:

- No dynamic `import()`.
- No `.json`, `.md`, or other assets.
- Only `luca-release` uses `import.meta.dir` (`packages/engine/src/cli/luca-release.ts:119`), and it retires.

### Getting the private workspace packages into one package

Both workspace packages are `private: true`, and npm "will refuse to publish" those ([package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)). They also use `catalog:` for zod. Tested in a scratch workspace with a publishable app that depends on a private lib (`workspace:*`) and on zod (`catalog:`):

- **`npm pack`** leaves `"@scratch/lib": "workspace:*"` and `"zod": "catalog:"` in the tarball. `npm i -g` of it fails: `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"`.
- **`bun pm pack`** writes `"@scratch/lib": "0.0.0"` (the lib's own version) and `"zod": "^4.3.6"`.
  - The docs say `bun publish` "strips catalog and workspace protocols" ([publish](https://bun.com/docs/pm/cli/publish)), and that `bun publish` and `bun pm pack` replace `catalog:` ([catalogs](https://bun.com/docs/pm/catalogs)).
  - It also marked the bin file executable in the tarball.
  - But the private lib at `0.0.0` isn't on npm: `bun add -g` of that tarball fails with `GET .../@scratch%2flib - 404`.
- **`bundleDependencies: ["@scratch/lib"]`:** both `npm pack` and `bun pm pack` follow the workspace link and put `node_modules/@scratch/lib/` in the tarball.
  - npm installs it and uses the bundled copy.
  - **Bun doesn't** while the lib is also in `dependencies`: it goes to the registry and gets the same 404.
  - With the lib only in `bundleDependencies` and not in `dependencies`, both tools used the bundled copy. But then its own dependencies must be listed on the outer package, and it's an unusual use of the field.
- **A flat package works.** The candidate held `engine/src/**` (no tests) and the board's files, and listed the engine's five public dependencies with real versions. `bun pm pack` made a 297 KB tarball that installs and runs with both tools.

So the one published package should hold the code itself. How to lay that out is #446's call. Two ways fit:

- **(a)** A publishable `@alecsibilia/luca` workspace whose pack step copies in `engine/src` and the board's files, with its own `dependencies`. A check keeps those in step with the engine's.
- **(b)** Move the engine and board folders under one package.

Either way, pack with Bun (`bun pm pack` or `bun publish`). If npm is wanted for publishing, for example for `--provenance`, then `npm publish <tarball>` takes "a gzipped tarball" ([`npm publish`](https://docs.npmjs.com/cli/v11/commands/npm-publish)). A plain `npm publish` of the folder, which is what `changeset publish` runs, would ship `catalog:`.

The engine and the board don't import each other (no `@luca/*` imports in either), so they can share one package without code changes.

### Keeping a run on its version

**Each global location holds one version at a time.** Tested, while a `luca-run --demo` from alpha.0 was going:

- **npm:** `npm i -g --prefix <p> <alpha.1 tarball>` gave the package folder a new inode, with alpha.1's files in it. The demo went on and ended with exit 0.
- **Bun:** I edited the global `package.json` to alpha.1 and ran `bun install` in the global folder, which is what `bun add -g` does. The folder got a new inode, and the demo went on and ended with exit 0.
  - `bun add -g <alpha.1 tarball>` over the alpha.0 tarball itself failed with `error: An internal error occurred (DependencyLoop)` in Bun 1.3.11.
  - That looks tied to local tarball paths. An upgrade from the registry wasn't tested, since nothing may be published.
- **A process that reads a file later sees the new version:** "read at start: 14.0.0-alpha.0; read 6 s later: 14.0.0-alpha.1".

Why a running engine is safe: Bun resolves and loads the whole static import graph before the entry runs. The engine has no dynamic imports and reads nothing from its own folder afterwards. Agents run the user's own `claude`, not a file from the Luca install.

What does **not** stay on the run's version:

- **Restarts.** The board finds the engine again, from the settings, each time it restarts a dead run with `--resume` (`packages/board/server/board-server.ts:756`, `:803`). It does the same for each `--unfinished` check (`:760`) and each new run (`:486-506`). A run that crashes after an upgrade resumes on the new engine, with the old journal. At most 3 restarts per run (`engine-watch.ts:13`).
- **The board plugin itself.** Paseo keeps a directory plugin by its path (`~/.paseo/config.json`: `"luca-board": { "source": "directory", "path": ".../packages/board" }`). If the board is installed from the package folder, an upgrade changes its files on disk, and Paseo loads them on the next reload. Installing from npm is #439.
- **No version on record.**
  - `run_started` has no engine version (nothing in `packages/engine/src/journal/` mentions one).
  - The SDK client tag is hard-coded: `CLAUDE_AGENT_SDK_CLIENT_APP: 'luca-engine/0.0.0'` (`claude-options.ts:102`).

**Side by side works.** A plain `bun add <tarball>` into `versions/alpha0/` and `versions/alpha1/` gave two separate copies. Both ran `luca-run --unfinished`. Each is 273 MB, mostly the unused SDK binary.

So there are two shapes for #447:

- **(a) One folder per version.** For example under `~/.local/share/luca/versions/<v>/`, the XDG data folder the pinned clone uses today. The board records each run's engine path at start and restarts with it.
- **(b) One global install.** Refuse or delay upgrades while runs are going, which is what `luca-release` does today (`release.ts:430`), and catch a version change at resume.

Either way, the cheap first step is to write the engine's version into `run_started`.

### Where the board finds the engine

`resolveEngine` (`packages/board/server/engine-launch.ts:94-138`):

1. The `engine_path` setting wins. It's run with an absolute Bun: the `bun_path` setting, then `LUCA_BUN`, then `~/.bun/bin/bun`, `/opt/homebrew/bin/bun`, and `/usr/local/bin/bun`.
2. Otherwise, the first installed `luca-run` in `~/.bun/bin`, `/opt/homebrew/bin`, or `/usr/local/bin` (`:67-75`), run directly through its shebang.

A default `bun add -g` lands in the first folder, and Homebrew's `npm i -g` in the second. The list misses nvm's per-version prefix, a custom npm prefix (such as `~/.npm-global`), and a custom `BUN_INSTALL`.

`luca-release` sets `engine_path` to the pinned clone's `luca-run.ts` today (`release.ts:457-465`). The same idea carries over: `luca init` (or `luca doctor`) sets `engine_path` to the real path of the installed `luca-run.ts`, and `bun_path` to its own `process.execPath`. The board then never depends on PATH, the shebang, or where the installer put things.

On this Mac, `~/.local/share/luca` doesn't exist, and `luca-board` points at the development working copy. So the pinned clone isn't in use here today.

### The target repo's bunfig and .env reach the engine

The board spawns the engine with the target repo as its working folder (`board-server.ts:544`). Bun reads `bunfig.toml` from the project and `.env` files "from the current working directory" ([bunfig](https://bun.com/docs/runtime/bunfig), [env vars](https://bun.com/docs/runtime/environment-variables)).

Tested with a target folder whose `bunfig.toml` had `preload = ["./pre.ts"]` and whose `.env` had `TARGET_SECRET=...`:

- The preload ran inside the globally installed program, and `TARGET_SECRET` was set.
- The same happened through the bin link and through absolute Bun.
- `bun --no-env-file --config=<an empty file> <real .ts>` stopped both.

This is true of the pinned clone today, and it's not caused by npm. But it matters more once Luca runs on other people's repos (#426):

- Agents get an allow-listed environment (`claude-options.ts:58-107`), so an `ANTHROPIC_API_KEY` in a target `.env` never reaches them.
- The engine's own `LUCA_*` variables and `TYPESAFE_API_KEY` would be picked up from a target `.env`.
- A top-level `preload` in a target repo runs inside the engine.

### What `luca-release` does today, and what takes over each part

| `luca-release` step (`packages/engine/src/cli/release.ts`) | With npm |
| --- | --- |
| Clean `main` that matches `origin/main`, then gates (`:423-440`) | CI checks before publishing (#449) |
| No run going (`:430-436`) | #447 (see above) |
| Date tag `luca-YYYY.MM.DD` (`:442`) | The npm version, made by changesets (#442) |
| Pinned clone at the tag, frozen install (`:328-376`) | The global install (this ticket) |
| `paseo plugin install <clone>/packages/board --id luca-board` (`:453-456`) | `luca init` (#439) |
| `engine_path` = the clone's `luca-run.ts` (`:457-465`) | `luca init` / `luca doctor`: the real path of the installed `luca-run.ts`, plus `bun_path` |

## Uncertain or not checked

- **Upgrades from the registry.** A Bun global upgrade from the registry (`bun add -g @alecsibilia/luca@alpha` over an older version) wasn't tested, because nothing may be published. Only the tarball case hit `DependencyLoop`.
- **Real agents** from a global install weren't run. The demo uses scripted agents. The SDK is loaded at start like the rest, so I expect no difference for the source install. A bundle would need this check.
- **Paseo's "bare `bun`" swap.** I couldn't confirm the claim in `engine-launch.ts:89`. On this Mac, Paseo's plugin processes have the login shell's PATH.
- **Other local bunfig keys.** Whether keys other than `globalDir` and `globalBinDir` in a local `bunfig.toml` affect `bun add -g`. The one that matters is this repo's `minimumReleaseAge = 604800`, which would hide an alpha under 7 days old if it applied (#448).
- **Intel Macs** (`darwin-x64`) weren't tried.
- **Loading the board plugin** from the package folder (its `zod` and `@getpaseo/plugin` imports) is #439's question.

## How to repeat

```bash
# Stage: engine/src without tests + board files + a package.json with
# name @alecsibilia/luca, bin luca-run -> engine/src/cli/luca-run.ts,
# files [engine/src, board], and the engine's five dependencies at real versions.
bun pm pack                                    # -> alecsibilia-luca-14.0.0-alpha.0.tgz

# npm, temp prefix
P=$(mktemp -d); npm i -g --prefix "$P" ./alecsibilia-luca-14.0.0-alpha.0.tgz
LUCA_RUNS_DIR=$(mktemp -d) "$P/bin/luca-run" --unfinished
"$P/bin/luca-run" --demo

# Bun, temp global dir and bin (BUN_INSTALL is set in this shell, so a temp
# HOME alone does not keep Bun away from ~/.bun)
B=$(mktemp -d)
BUN_INSTALL_GLOBAL_DIR="$B/global" BUN_INSTALL_BIN="$B/bin" bun add -g ./alecsibilia-luca-14.0.0-alpha.0.tgz
"$B/bin/luca-run" --demo
```
