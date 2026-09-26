# Does v13's MuninnDB installer still work, and how does v14 add MuninnDB to Claude Code?

> Research for wayfinder ticket #441 on "Map: Luca v14 on npm" (#438). Date: 2026-09-26. MuninnDB's latest release is v0.11.0 (2026-08-04). Claude Code checked: 2.1.280.

## Answer

- **Partly.** v13's download still works. Its start step is broken. Its Claude Code step only works if the user already ran `muninn init` by hand.
- **Download works.** v13 fetches `https://muninndb.com/install.sh` and runs it. The script still exists. It gets the latest release (v0.11.0), checks its SHA-256, and puts `muninn` in `/usr/local/bin`, or `~/.local/bin` if it can't write there. Then v13 copies the binary into `~/.luca/bin/`. That second copy is a problem: `muninn upgrade` won't update it.
- **Start is broken.** v13 runs `muninn --port 8476 --data-dir ~/.luca/muninndb-data`. Today's `muninn` has no such flags. It exits with `Unknown command: "--port:8476"` (checked on this Mac). v13 hides the process's output, waits 10 s, and says "started but health check failed". If MuninnDB was already running, v13 skips the start step and says it's healthy, so the bug doesn't show.
- **The Claude Code step needs a token v13 never makes.** v13 reads `~/.muninn/mcp.token`, and only `muninn init` writes that file. On a fresh Mac, v13 skips the Claude Code step and tells the user to run `muninn init`. When it does write the entry, it writes `type: "sse"`, which Claude Code now calls deprecated. It also turns MuninnDB's own `type: "http"` entry back into `sse`.
- **How v14 should add MuninnDB to Claude Code:** add a user-scope server named `muninn` with the literal token in its header:
  `claude mcp add --transport http --scope user muninn http://127.0.0.1:8750/mcp --header "Authorization: Bearer <token from ~/.muninn/mcp.token>"`.
  This writes exactly what the engine reads: top-level `mcpServers.muninn.url` and `.headers.Authorization` in `~/.claude.json`. `--scope user` is required. The default scope, `local`, writes under `projects[<path>]`, and the engine never looks there.
- **Let MuninnDB set itself up.** Run `muninn init --yes` with no `--tool`. It makes the token (or keeps the old one), starts the server, and touches no AI tool config. Don't pass `--tool claude-code`. That also adds a memory block to the top of `~/.claude/CLAUDE.md`.
- **If MuninnDB is already installed another way:** v14 should find it and use it, not reinstall it. Find the binary on `PATH`. Check the server with `GET http://127.0.0.1:8475/api/health`, which returns the version. If a working `mcpServers.muninn` entry is already there, leave it alone.

## What v13's `luca init` MuninnDB step does, and what breaks

Source: tag `old-luca-final`, `packages/luca-cli/src/commands/init.ts` (Step 3, lines ~151-215) and the helpers it calls.

| Step | v13 code | Against MuninnDB v0.11.0 today |
|---|---|---|
| Find binary | `checkMuninndbBinary()` (`utils/muninndb-health.ts`): `~/.luca/bin/muninn`, then `~/.local/bin`, `~/bin`, `~/.muninndb/bin`, `~/.muninndb`, `~/.muninn/bin`, `~/.cargo/bin`, `/usr/local/bin`, then `Bun.which('muninn')` | Works. The binary is still named `muninn`. `muninn --version` prints `v0.11.0`. `/opt/homebrew/bin` isn't in the list, but `Bun.which` finds it if it's on `PATH`. |
| Download | `downloadMuninndbBinary()` (`utils/muninndb-download.ts`): `curl -sSL -f https://muninndb.com/install.sh`, then `INSTALL_DIR=… BIN_DIR=… PREFIX=… sh -c <script>` (line 325) | Works. The URL redirects to `raw.githubusercontent.com/scrypster/muninndb/main/install.sh`. **But the env vars do nothing:** the script sets `INSTALL_DIR="/usr/local/bin"` itself and falls back to `~/.local/bin`. It asks the GitHub API for the latest tag without logging in, so it can hit the rate limit. |
| Copy | Copies the found binary to `~/.luca/bin/muninn` (lines 370-374) | Makes a second, stale binary. `muninn upgrade` replaces the binary it runs from, not this copy. |
| Start | `startMuninndb()` (`utils/muninndb-service.ts`): if `GET http://localhost:8476/health` is OK, return. Otherwise spawn `~/.luca/bin/muninn --port 8476 --data-dir ~/.luca/muninndb-data` (line 90) with output ignored, and poll for 10 s. | **Broken.** Tested: `muninn --port 8476 --data-dir /tmp/x` → `Unknown command: "--port:8476"`, exit 1. Today's CLI takes `muninn start` (fixed defaults) or `muninn --daemon --data <dir>`. The spawn also always uses `~/.luca/bin/muninn`, even when the binary was found somewhere else. And a separate `~/.luca/muninndb-data` would have made a second, empty database. The early check still works: `:8476/health` is the web UI and returns 200. |
| Token | `readMuninnToken()` reads `~/.muninn/mcp.token` (`utils/muninn-token.ts`) | Only `muninn init` writes this file (`loadOrGenerateToken`, `cmd/muninn/setup_ai.go`). v13 never runs `muninn init`, so on a fresh Mac there's no token and v13 skips the Claude Code step. |
| Claude Code | `wireClaudeMcp()` (`init/helpers/wire-claude-hooks.ts:453`) merges `mcpServers.muninn = { type: 'sse', url: 'http://127.0.0.1:8750/mcp', headers: { Authorization: 'Bearer <token>' } }` into `~/.claude.json` with an atomic temp-file rename and `chmod 600` | Still loads: MuninnDB's `/mcp` takes both SSE (GET) and Streamable HTTP (POST). But Claude Code's docs mark SSE as deprecated, and v13 rewrites any entry whose `type` isn't `sse` (line 399), so it turns MuninnDB's own `http` entry into `sse`. |

**Result:** today, v13's step only works on a Mac where the user already ran `muninn init` and MuninnDB is running. That describes this Mac. On a fresh Mac it downloads the binary and then fails to start it or register it.

## How MuninnDB wants to be installed and run today (v0.11.0)

- **Install options** (from `docs/quickstart.md` and the README): `curl -sSL https://muninndb.com/install.sh | sh`; Homebrew; Docker (`ghcr.io/scrypster/muninndb`); or build from source. The release has raw binaries `muninn-darwin-arm64` and `muninn-darwin-amd64`, tarballs, and `checksums.txt`.
- **Homebrew:** the tap `scrypster/homebrew-tap` has `Formula/muninn.rb` (v0.11.0), so the command is `brew install scrypster/tap/muninn`. The quickstart says `brew install muninndb`, but the tap has no formula or alias by that name (tree listed via the GitHub API; not run). The formula has no `service` block, so `brew services` can't run it.
- **Commands** (`muninn --help`, `cmd/muninn/main.go`):
  - `muninn init`: a setup wizard. `--yes` makes it non-interactive, `--tool <list>` sets up AI tools, and `--no-token` and `--no-start` skip those steps.
  - `muninn start`, `stop`, `restart`, `status`, `upgrade`.
  - `muninn start` refuses all flags on purpose (`checkStartArgs`). It always uses `MUNINNDB_DATA` or `~/.muninn/data` and the default ports.
- **What `muninn init --yes` does with no `--tool`** (`runNonInteractiveInit`, `cmd/muninn/init.go:903`):
  1. Reads `~/.muninn/mcp.token`, or writes a new `mdb_…` token there with mode 0600.
  2. Runs `muninn start`. If a server is already running, it does nothing and warns.
  3. Writes a commented `~/.muninn/muninn.env` template, only if the file doesn't exist.
  4. Touches no AI tool config.
- **What `--tool claude-code` adds** (`configureClaudeCode` and `configureClaudeMD`, `cmd/muninn/setup_ai.go`):
  - It overwrites `mcpServers.muninn` in `~/.claude.json` with `{type:"http", url, headers:{Authorization:"Bearer <token>"}}`. It saves the old file as `~/.claude.json.bak` and sets mode 0600 on the new one.
  - It **adds a "Memory Storage Preference" block to the top of `~/.claude/CLAUDE.md`**. The block tells Claude to use MuninnDB, use vault `default`, and store memories on its own. This Mac's global CLAUDE.md starts with that block.
- **Ports** (help text, confirmed with `lsof` on this Mac): 8474 MBP, 8475 REST, 8476 web UI, 8477 gRPC, 8750 MCP. All listen on 127.0.0.1 by default.
- **Health checks** (probed on this Mac):
  - `GET :8475/api/health` → `{"status":"ok","version":"v0.11.0",…}`. This is the best check because it includes the version.
  - `GET :8750/mcp/health` → `{"status":"ok"}`.
  - `GET :8476/health` → 200.
  - `GET :8750/mcp` with no token → 401.
- **MCP auth** (`internal/mcp/context.go`, `authFromRequest`):
  - The static `mdb_` token from `mcp.token` reaches **every vault**. The engine needs this, since it uses a repo vault and `default`.
  - `mk_` keys and `cap_` tokens are pinned to one vault.
  - With no token file, the MCP endpoint is open to anything on localhost.
  - The server reads the token once, at start.
- **MCP transport** (`internal/mcp/server.go`): `/mcp` takes POST as Streamable HTTP and GET as SSE. So `type: "http"` and `type: "sse"` both connect.
- **No start at login.**
  - `muninn start` forks `muninn --daemon --data <dir>` into its own session and writes a PID file (`cmd/muninn/lifecycle.go`, `process_unix.go` `Setsid: true`).
  - The daemon doesn't come back after a reboot or logout. MuninnDB ships no launchd plist; `contrib/` has only a systemd unit.
  - A code comment calls launchd "this project's own recommended setup". But `muninn stop` and `muninn upgrade` can't see a launchd-run daemon on macOS: there's no PID file and no `/proc` (`cmd/muninn/upgrade.go` ~L700). A `KeepAlive` launchd job would fight both commands.

## How the engine finds MuninnDB today

Source: `packages/engine/src/memory/muninn-mcp-client.ts`, `cli/luca-run.ts`, `cli/luca-setup.ts`.

- **Order:**
  1. `LUCA_MUNINN_URL`, plus `LUCA_MUNINN_TOKEN` if set. The token gets `Bearer ` added in front if it's missing.
  2. Otherwise, the **top-level** `mcpServers.muninn` in `~/.claude.json`: its `url` and `headers.Authorization`, used as written.
  3. Otherwise, `luca-run` logs `memory off: …` and the run goes on without memory.
- **Blind spots:** the engine does not read local-scope entries (`projects[<path>].mcpServers`), `.mcp.json`, or servers with a name other than `muninn`. It does not expand `${VAR}` in headers or run a `headersHelper`. So the header must hold the literal token.
- **Transport:** the engine tries Streamable HTTP first, then SSE, on the same URL. So both v13's `sse` entries and new `http` entries work.
- **Engine agents never see this server.** They launch with `settingSources: []` and `strictMcpConfig: true` (`agents/claude-options.ts:207-208`). The Claude Code entry is how the engine finds MuninnDB, and it also serves the user's own Claude Code sessions. It does not give memory tools to Luca's agents.

## What `claude mcp add` writes (verified)

These were run against a throwaway `CLAUDE_CONFIG_DIR=/tmp/cc-probe` with a placeholder token. The real `~/.claude.json` was not touched.

- `claude mcp add --transport http --scope user muninn http://127.0.0.1:8750/mcp --header "Authorization: Bearer <placeholder>"` writes, at the top level of `.claude.json` (mode 0600):
  `"mcpServers": { "muninn": { "type": "http", "url": "http://127.0.0.1:8750/mcp", "headers": { "Authorization": "Bearer <placeholder>" } } }`
  That is exactly the shape the engine's `ClaudeJsonSchema` parses. The CLI prints the header as `[REDACTED]`.
- Running the same `add` again fails with `MCP server muninn already exists in user config` (exit 1). `claude mcp remove muninn --scope user` removes it. So v14 must check first, and remove before re-adding.
- The docs (https://code.claude.com/docs/en/mcp) say:
  - The default scope is `local`, stored under that project's path in `~/.claude.json`. `user` scope is stored at the top level.
  - Scope precedence is local > project > user, matched by name.
  - SSE is deprecated; use HTTP.
  - `add-json` takes the same entry as JSON.
  - `${VAR}` expansion is documented for `.mcp.json`, but the engine wouldn't expand it anyway.

## Recommendation for v14's `luca init` MuninnDB step

1. **Skip flag.** Keep something like v13's `--skip-muninndb`. With it, or when any later step fails, runs still work (`memory off`).
2. **Detect what's there.**
   - Binary: `Bun.which('muninn')`, then `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`.
   - Server: `GET http://127.0.0.1:8475/api/health`.
   - Registration: the engine's own `muninnSettings()` on the current env and `~/.claude.json`.
3. **Install only if there's no binary and no server answering.**
   - Download the official `install.sh` and run it, as v13 did, keeping v13's HTTPS and trusted-host checks. Drop the `INSTALL_DIR` env vars and the copy into `~/.luca/bin`.
   - Or, since `gh` is a v14 prerequisite: `gh release download -R scrypster/muninndb` the `muninn-darwin-<arch>` asset plus `checksums.txt`, check the hash, and put the binary in `~/.local/bin`. This avoids the GitHub API rate limit.
4. **Set up and start.**
   - Fresh install: `muninn init --yes`. This makes the token, starts the server, and touches no AI tool config.
   - Binary present but server down: `muninn start`.
   - Server already up: do nothing.
   - Wait for `/api/health`.
5. **Register with Claude Code.**
   - If `muninnSettings()` finds an entry and one MCP call works (such as `muninn_recall` with `limit: 1` on vault `default`), leave it, even if it's v13's `sse` form.
   - If there's no entry: `claude mcp add --transport http --scope user muninn http://127.0.0.1:8750/mcp --header "Authorization: Bearer $(token)"`. Leave out the header if there's no token file.
   - If an entry exists but fails: say so, and replace it (remove, then add) only with the user's OK or a `--force` flag.
   - Never print or log the token.
   - Cost of using the CLI: the token shows in `ps` for the moment `claude mcp add` runs. MuninnDB avoids this for its own daemon. The alternative is v13's atomic JSON merge, but that means hand-editing a file that Claude Code also rewrites.
6. **Version floor.** The engine depends on MCP answer shapes: `muninn_recall` → `{memories, total}`, `muninn_remember` → `id`, `muninn_evolve` → `new_id`. `luca doctor` should warn below the tested version (v0.11.0), reading it from `/api/health`.
7. **Start at login** is a decision for the spec (see below).

## What happens when MuninnDB is already installed another way

| Existing setup | v13 today | v14 should |
|---|---|---|
| Install script or hand-placed binary, running (this Mac: `~/.local/bin/muninn`, running as `muninn --daemon --data ~/.muninn/data`, no launchd job) | Finds it and says it's healthy. Turns an `http` Claude entry into `sse`. | Use it as is. Install nothing, copy nothing. |
| Same, but not running | Tries to spawn `~/.luca/bin/muninn` with bad flags, which fails | Run `muninn start` |
| Homebrew (`scrypster/tap/muninn`) | `Bun.which` finds it | Use it. Don't run `install.sh`: that would add a second `muninn`, and `PATH` order would decide which one runs. |
| Docker (ports published, no binary on the host) | Downloads a host binary anyway, then sees the container's health | Skip the install when `/api/health` answers. There's no `~/.muninn/mcp.token` (Docker uses `MUNINN_MCP_TOKEN`), so use an existing entry or ask the user for the token. |
| Already registered with `muninn init --tool claude-code` (`type: http`) | Rewrites it to `sse` | Keep it |
| Registered by v13 (`type: sse`) | Keeps it | Keep it. It works. `luca doctor` could offer to switch it to `http`. |
| Registered at local or project scope only, or under another name | Counts it as registered (its check looks at `.mcp.json` and `projects[cwd]`) | The engine can't see it. Add the user-scope `muninn` entry. Claude Code will use the local one in that project, and both point at the same server. |
| Non-default URL, TLS, or remote server | Hard-codes `127.0.0.1:8750` | If a `muninn` entry exists, trust its URL. `muninn init` honours `MUNINN_MCP_URL`. |

## Uncertain / open

- **Start at login.** Pick one:
  - (a) No autostart. `luca doctor` says "run `muninn start`", and runs go on with memory off meanwhile.
  - (b) A LaunchAgent that runs `muninn start` at login (`RunAtLoad`, no `KeepAlive`). This keeps MuninnDB's PID file, so `stop` and `upgrade` still work. Untested: whether launchd leaves the `Setsid` daemon alone once `muninn start` exits.
  - (c) A LaunchAgent that runs `muninn --daemon` with `KeepAlive`. This fights `muninn stop` and `muninn upgrade` on macOS.
- **`LUCA_MUNINN_URL` / `LUCA_MUNINN_TOKEN` under Paseo.** The board plugin launches `luca-run`. It's unknown whether the Paseo desktop app passes the user's shell env through. Treat these as an advanced override. `~/.claude.json` is the reliable path.
- **Was v13's start step ever right?** Not checked against older MuninnDB releases. It's broken against v0.11.0.
- **`brew install muninndb`** (from MuninnDB's quickstart) probably fails, since the tap only has `muninn`. Not run.
- **Paths to clean up** (for #445 and #450): v13 may have left `~/.luca/bin/muninn`, `~/.luca/muninndb-data/`, and `~/.luca/muninndb.pid`. On this Mac, `~/.luca/bin/` is empty and the other two don't exist.

## Sources

- v13: `git show old-luca-final:<path>`:
  - `packages/luca-cli/src/commands/init.ts`
  - `packages/luca-cli/src/utils/muninndb-download.ts`, `muninndb-service.ts`, `muninndb-health.ts`, `muninndb-schemas.ts`
  - `packages/luca-cli/src/utils/muninn-token.ts`, `muninn-mcp-registration.ts`
  - `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`
  - `packages/luca-cli/src/utils/doctor/checks/muninn-mcp.ts`
- Engine: `packages/engine/src/memory/muninn-mcp-client.ts`, `packages/engine/src/cli/luca-run.ts`, `packages/engine/src/cli/luca-setup.ts`, `packages/engine/src/cli/setup.ts`, `packages/engine/src/agents/claude-options.ts`.
- MuninnDB releases: https://github.com/scrypster/muninndb/releases (v0.11.0 assets and upgrade notes).
- MuninnDB source at tag v0.11.0 (https://github.com/scrypster/muninndb/tree/v0.11.0):
  - `cmd/muninn/main.go`, `dispatch.go`, `init.go`, `setup_ai.go`, `lifecycle.go`, `process_unix.go`, `upgrade.go`, `logdest.go`, `service_manager.go`
  - `internal/mcp/server.go`, `internal/mcp/context.go`
  - `docs/quickstart.md`, `docs/self-hosting.md`, `README.md`, `install.sh`
- MuninnDB install script: https://muninndb.com/install.sh (read, not run).
- Homebrew tap: https://github.com/scrypster/homebrew-tap/blob/main/Formula/muninn.rb
- Claude Code MCP docs: https://code.claude.com/docs/en/mcp (sections: remote HTTP server, SSE deprecation, managing servers, installation scopes, env var expansion, headersHelper, add-json).
- This Mac (read-only; no tokens printed):
  - `muninn --version` / `--help`, `ps`, `lsof`, `launchctl list`
  - Health probes on 8475, 8476, and 8750
  - The key names and `type`/`url` of `mcpServers.muninn` in `~/.claude.json`
  - One run of v13's exact start arguments, which exited without starting anything
  - `claude mcp add`/`remove` against a throwaway `CLAUDE_CONFIG_DIR`
