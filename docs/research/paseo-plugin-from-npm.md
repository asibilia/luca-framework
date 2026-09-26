# How does a Paseo plugin get installed from an npm package?

> Research for the wayfinder ticket #439 on "Map: Luca v14 on npm" (#438). Date: 2026-09-26. Paseo on this machine: 0.9.2.

## Answer

- **Paseo takes four kinds of plugin source:** a folder on the daemon's machine, a GitHub repo, any Git URL, or an npm package. Any of them can end in `:sub/folder` to point at a plugin inside a bigger package or repo. npm sources arrived in Paseo 0.9.0.
- **There are two ways to get the board in after `npm i -g @alecsibilia/luca`:**
  - **A. Folder source (fits best).** `luca init` runs `paseo plugin install <luca's own install folder>/<board folder> --id luca-board`. Paseo reads the plugin from the files npm (or Bun) already put on disk. This is what `luca-release` does today, but it points at the npm install instead of the pinned clone. Paseo doesn't need npm for this, it makes no second copy, and the board and engine always come from the same version.
  - **B. npm source.** `paseo plugin install npm:@alecsibilia/luca@<version>:<board folder> --id luca-board`. Paseo downloads its own second copy of the whole package, with all of Luca's runtime deps, into `~/.paseo/plugins/luca-board/<uuid>/node_modules/@alecsibilia/luca/`. It needs `npm` on the daemon's PATH. Its copy can drift from the CLI's copy.
- **Settings such as `engine_path`** live in `~/.paseo/plugin-settings/luca-board/engine.json`. You change them in **Settings → Plugins → luca-board**, or with the plugin RPC `settings.engine.write` through the local daemon (what `luca-release` does). The CLI has no settings command. Settings survive reloads, updates, and daemon restarts. **Removing the plugin deletes them.**
- **`/reload-skills` is not a Paseo command.** It's Claude Code's command, and Paseo passes it through to the Claude agent. The board README says `/luca-run` only shows up after it. Paseo's docs never mention this. It's a workaround we saw ourselves, and we don't know why it works (see "Unverified").
- **Updates:** a folder plugin never updates by itself. You change the files (for example `npm i -g @alecsibilia/luca@new`), then run `paseo plugin reload luca-board`. For an npm-source plugin, `paseo plugin update luca-board` only looks at the `latest` dist-tag. While v14 ships under `alpha`, a plain update does nothing, so you need `--version <exact version or alpha>`.
- **The lowest Paseo version is 0.9.1.** The board's manifest already says `>=0.9.1`. npm sources and the server settings handle the board uses both need 0.9.0. Nothing needs more than that. It was tested on 0.9.2.
- **`paseo plugin install` won't replace a plugin.** If the ID is already installed, it fails with `Plugin ID "luca-board" is already configured`. So install is not an upgrade. To switch the source, you remove the plugin and install it again, and that wipes its settings. This also means today's `luca-release` step 6 fails on its second run, although the engine README says "installing and upgrading are the same command".

## Source kinds

| Source | Form | Where the code lives | Needs | Update |
|---|---|---|---|---|
| Folder | `/abs/path` (optionally `:sub/path`) | Where it already is. Paseo stores only the path in `~/.paseo/config.json` | nothing extra | Edit the files, then `paseo plugin reload <id>`. `update` skips it. |
| npm | `npm:@scope/name[@version\|tag\|range][:sub/path]` | `~/.paseo/plugins/<id>/<uuid>/node_modules/<pkg>/<sub/path>` | `npm` on the daemon's PATH, Paseo ≥ 0.9.0 | `paseo plugin update <id>` checks `latest`; `--version` picks another |
| GitHub / Git | `github:owner/repo`, `git:<url>`, `--ref` | `~/.paseo/plugins/<id>/<uuid>/checkout/<sub/path>` | `git`; a `build` step for runtime deps | `update` checks the remote's default HEAD, whatever `--ref` said at install |

## Findings

**What the CLI says.** `paseo plugin install --help` (0.9.2): "Trust and install a plugin from a directory, Git repository, or npm package". Its argument is "Host directory, Git or npm source, optionally followed by :plugin/path", with the options `--id`, `--ref` (Git only), and `--path` (the old form of the suffix). `paseo plugin update --help` lists `--all`, `--check`, `--yes`, `--ref`, and `--version <version>` ("Apply an npm version, tag, or range without asking"). There's no subcommand for plugin settings.

**How a source is picked.** The plugin reference ("Plugin sources") gives the order. A folder that matches the whole identifier wins. Then an explicit `npm:`, `github:`, or `git:` prefix. Then a final `:relative/path` suffix. Then a folder again. Then Git URLs, then `owner/repo` shorthand. Anything left is an npm name with an optional version, tag, or range, and no selector means `latest`. npm aliases, tarball URLs, and `file:` specs are rejected. The daemon's `installSource` in the Paseo app bundle matches this order. It checks for a folder first (`stat(...).isDirectory()`), and `--ref` on a folder throws "Plugin --ref is only valid for Git sources".

**What an npm install does on disk.** The daemon's `ManagedPluginSources` (in `app.asar`) stages each install under `~/.paseo/plugins/.staging/`. `acquireNpm` writes a wrapper `package.json` with one dependency, the package, and runs:

```
npm install --ignore-scripts --legacy-peer-deps --no-audit --no-fund --package-lock=true --lockfile-version=3 --include=prod --omit=dev --global=false --workspaces=false
```

It has a 2-minute timeout. `place` then moves the staged folder to `~/.paseo/plugins/<id>/<random uuid>/`. The plugin folder is `node_modules/<package>/<sub/path>` inside it, and `~/.paseo/plugins/sources.json` records `{ "kind": "npm" }`. The whole package and all its production deps get installed. For `@alecsibilia/luca` that means the engine's deps too (`@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `@getpaseo/client`, `lodash`, `zod`), so Paseo keeps a second copy of Luca. Lifecycle scripts never run. If npm is missing, the daemon fails with "npm is required on the daemon host to acquire or check npm plugins". The publishing guide says the same: "Paseo skips npm lifecycle scripts during installation", and "Paseo uses the host's npm registry settings and credentials". After install, "Loading, enabling, and reloading an installed plugin do not need npm" (reference, "npm installation and publishing").

**What a folder install does.** `installDirectory` reads `paseo-plugin.json` and checks `requirements.paseo` against the daemon version. It then writes `{ source: "directory", path, enabled: true }` into `~/.paseo/config.json` under `plugins` and starts the plugin. Nothing gets copied. On this machine, `luca-board` is installed that way from the dev checkout (`paseo plugin ls --json` shows `"identity": { "kind": "directory", "path": ".../luca-framework/packages/board" }`). The quickstart says Paseo compiles the TypeScript itself and "supplies the plugin SDK, React, React Native, TanStack Query, and Zod at runtime". The board only imports those, Node built-ins, and `zod`. So the board needs no `node_modules` of its own at runtime, and a plain folder of its source files is enough.

**Install never overwrites.** Both install paths in the daemon throw `Plugin ID "${pluginId}" is already configured; choose another ID with --id` when the ID is already in `config.json`. The reference says "An existing installation ID is rejected without changing its enabled state or files." `remove` "never deletes a directory source; it deletes managed files for Git and npm sources". The reference ("Persisted values") says "Removing an installation deletes its settings. Reinstalling that ID starts from defaults." So `luca init` has to check `paseo plugin ls --json` before it installs. If the path is wrong, it has to remove and install again, then write the settings back.

**Settings (`engine_path`).** The board defines one host settings document, `engine` (`packages/board/shared/engine-settings.ts`), with the fields `engine_path`, `bun_path`, `weekly_line`, and `five_hour_line`. It's registered with `server.registerSettings`. Paseo stores it as `~/.paseo/plugin-settings/luca-board/engine.json`, which holds `{"version":1,"values":{...}}` on this machine. The SDK's `settingsRpc(id)` (in the bundled `@getpaseo/plugin` 0.9.2) defines `settings.<id>.read`, `settings.<id>.write` (`{ revision, values }`, which returns `saved`, `conflict`, or `invalid`), and `settings.<id>.reset`. `luca-release` calls these through `DaemonClient.invokePluginRpc`, which it imports from `@getpaseo/client/internal/daemon-client`, an internal path. The reference says values "survive daemon restart, plugin reload, disable, and updates". If `engine_path` is empty, the board falls back to a `luca-run` binary in `~/.bun/bin`, `/opt/homebrew/bin`, or `/usr/local/bin` (`packages/board/README.md`, "Settings"). The plugin can't find its own folder, because inside the plugin process `import.meta.url` is undefined and the cwd is `/`.

**Where a global install puts the files.** On this machine, `npm root -g` is `/opt/homebrew/lib/node_modules`, and Bun's global packages are in `~/.bun/install/global/node_modules` with bins in `~/.bun/bin`. With nvm, fnm, or volta, npm's global folder is somewhere else again. `luca init` runs under Bun, so it can read its own folder (`import.meta.dir`) and pass the exact path to `paseo plugin install` without guessing.

**Updates.** Paseo's quickstart says "`update` shows a proposed npm or Git revision and asks for approval. npm offers a newer latest release". In the daemon's `preview`, npm resolves `latest` unless `--version` was given, through `npm view <pkg>@<selector> version dist --json`. It then compares with semver. An installed version newer than `latest` gives `installed-newer`, and nothing changes. So under the map's plan (`latest` = 13.0.1, v14 on `alpha`), a plain `paseo plugin update luca-board` never moves an npm-source board. `paseo plugin update luca-board --version alpha` (or an exact version) does, without asking. `--yes` is needed for non-interactive plain updates. Folder plugins are skipped by `update`: "edit the directory and use `reload`". A reload "stops the old plugin, runs its cleanup, compiles the current source, and starts it again". A failed reload stays failed, and Paseo doesn't restore the previous bundle.

**The global switch.** Every plugin stays `disabled` until the root `pluginsEnabled` in `~/.paseo/config.json` is `true` (Settings → Plugins → Enable plugins, then `paseo reload --json`). The quickstart says: "An automated tool must read the current value and get your explicit permission before turning it on." It's `true` on this machine. A stranger's machine probably has it off, so `luca init` must ask first.

**`/reload-skills`.** Claude Code's docs (`code.claude.com/docs/en/slash-commands`) describe `/reload-skills` as the command that picks up new skill folders. The string `reload-skills` doesn't appear anywhere in Paseo's app bundle or docs. The only related code is the bundled Claude Agent SDK's `reloadSkills()`, which sends the `reload_skills` control request. Paseo's composer puts built-in commands first, then plugin commands, then provider commands (reference, "Slash commands"). So `/reload-skills` typed in Paseo goes to the Claude agent. Paseo's client builds plugin slash commands (`usePluginClientSlashCommands`) from the installed-plugins list, so in theory `/luca-run` should show up without it. But the board README (step 2 of "Install and try it") and `luca-release`'s last message both say to run it, because "a plugin reload alone isn't enough". It's only needed after a new install. The runs themselves don't need it.

**Minimum Paseo version.** From Paseo's `CHANGELOG.md`:
- Plugins arrived (experimental) in 0.5.0, and Git sources in 0.7.0.
- 0.8.0 added manifest `requirements`, separate client and server entries, and settings screens.
- 0.9.0 added "plugin installation from npm, including scoped packages, versions, tags, and ranges", `paseo plugin update`, and "a server settings handle returned by `registerSettings()` with `read()` and `subscribe()`". The board uses that handle (`index.server.ts:43`).
- 0.9.1 had no plugin changes.

The board's manifest says `"paseo": ">=0.9.1"`, matching its `@getpaseo/plugin` 0.9.1 dev dependency and the engine's `@getpaseo/client` 0.9.1. The daemon checks this range before install, on startup, on enable, and on reload, and each app checks it again before running client code (reference, "Requirements").

## Key facts later decisions depend on

1. Paseo takes folder, GitHub, Git, and npm sources, each with an optional `:sub/path`. npm needs Paseo ≥ 0.9.0 and `npm` on the daemon's PATH.
2. A folder source that points at Luca's global install is the simplest fit. It needs no npm, makes no second copy, and keeps the board and engine on one version. Its cost: after each upgrade, `paseo plugin reload luca-board`, and the path breaks if the global folder moves (a different package manager or a different Node version).
3. An npm source makes Paseo keep its own full copy of `@alecsibilia/luca` and its deps under `~/.paseo/plugins/luca-board/`. `update` follows `latest` only, so with v14 on `alpha` it needs `--version`.
4. `paseo plugin install` fails on an ID that's already installed. Switching the source means `remove` plus `install`, and that deletes `engine_path`, `bun_path`, and the usage lines. `luca init` and `luca doctor` must check `paseo plugin ls --json` first and write the settings back. Today's `luca-release` hits this on its second run.
5. `engine_path` can be set only through the Settings UI or the `settings.engine.write` plugin RPC (today through an internal `@getpaseo/client` import). If it's empty, the board falls back to `luca-run` in `~/.bun/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`.
6. Plugins stay off until `pluginsEnabled` is `true`, and a tool must ask the user before turning it on.
7. The package has to ship the board's `paseo-plugin.json`, `index.client.tsx`, `index.server.ts`, `client/`, `server/`, and `shared/` together in one folder. Paseo compiles the TypeScript and supplies React, React Native, TanStack Query, Zod, and the SDK.
8. The lowest Paseo version is 0.9.1, as the board already says.

## Unverified / open

- **Why `/reload-skills` makes `/luca-run` appear.** Paseo's client code suggests plugin commands should show up once the plugin is installed. Nobody has checked whether a new chat or an app refresh works as well. Try it on a clean install before the first-run docs are written.
- **Whether the desktop-managed daemon finds `npm`** when Node comes from nvm, fnm, or volta rather than Homebrew. The daemon uses `findExecutable("npm")`, and we didn't trace which PATH that searches. This only matters for option B.
- **Whether a folder plugin needs its own `package.json`** (for example for `"type": "module"`) when it sits inside the published package. The board has one today. Keep it to be safe.
- **What a running folder plugin does while `npm i -g` swaps its files.** It should keep running on its compiled bundle until the next reload, but we didn't test that.
- **Whether `settings.<id>.write` works while the plugin is disabled or failed.** It goes through the plugin's RPC path, so it probably needs the plugin running.
- **Nothing was installed, removed, or changed** on this machine for this research. The npm install path comes from Paseo's docs and daemon code, not from a live npm install.

## Sources

- Paseo CLI 0.9.2: `/Applications/Paseo.app/Contents/Resources/bin/paseo plugin --help`, and `plugin install|update|ls|reload|remove --help`. Also `paseo daemon status --json` and `paseo plugin ls --json` (read only).
- Paseo docs (fetched 2026-09-26): `https://paseo.sh/llms.txt`, `https://paseo.sh/docs/plugins.md` (quickstart), `https://paseo.sh/docs/plugins/publishing.md`, and `https://paseo.sh/docs/plugins/reference.md` (sections "Project files", "Requirements", "Persisted values", "Slash commands", "Plugin sources", "npm installation and publishing", "CLI reference", "Load failures").
- Paseo daemon and SDK code in `/Applications/Paseo.app/Contents/Resources/app.asar` (0.9.2): `installDirectory` / `installSource`, `ManagedPluginSources` (`prepareInstall`, `place`, `preview`, `prepareUpdate`, `remove`), `acquireNpm` / `resolveNpm` / `requireNpm` (`npm.js`), and `settingsRpc` in `@getpaseo/plugin` 0.9.2. Also the client bundle `app-dist/_expo/static/js/web/index-*.js` (`addSlashCommand`, `usePluginClientSlashCommands`).
- Paseo `CHANGELOG.md`: `https://raw.githubusercontent.com/getpaseo/paseo/main/CHANGELOG.md` (0.5.0, 0.7.0, 0.7.2, 0.8.0, 0.9.0, 0.9.1, 0.9.2).
- The `paseo-plugin` skill: `~/.claude/skills/paseo-plugin/SKILL.md` ("Typecheck and manage", "Hosts and trust").
- Claude Code docs: `https://code.claude.com/docs/en/slash-commands.md` (`/reload-skills`).
- This repo: `packages/engine/src/cli/luca-release.ts`, `packages/engine/src/cli/release.ts` (`runRelease` steps 6–7), `packages/engine/README.md` ("luca-release"), `packages/board/paseo-plugin.json`, `packages/board/package.json`, `packages/board/README.md` ("Settings", "Install and try it", "Develop"), `packages/board/shared/engine-settings.ts`, `packages/board/index.server.ts`, and `packages/board/index.client.tsx`.
- This machine (read only): `~/.paseo/config.json` (`pluginsEnabled`, `plugins`), `~/.paseo/plugins/`, `~/.paseo/plugin-settings/luca-board/engine.json`, `npm root -g`, and `~/.bun/install/global/node_modules`.
