# What does v13 leave on a user's computer and repos?

> Research for wayfinder ticket #445 on "Map: Luca v14 on npm" (#438). Date: 2026-09-26.
> Primary sources: v13's code at the tag `old-luca-final`, the two v13 tarballs on npm (`13.0.1` = `latest`, `13.1.0-alpha.0` = `alpha`), v14's `packages/engine` on `main` (`3ba954ac2`), and Claude Code's hooks docs. This Mac was checked read-only; nothing was changed.

## Answer

- **Per computer, v13 writes into five places:** `~/.claude/` (41 skills, 20 agents, 17 commands, a global hook, the status line), `~/.claude.json` (the `muninn` MCP entry), `~/.gemini/antigravity-cli/` (the same skills and agents, a hook, an MCP entry), `~/.luca/` (a `bin/` folder, maybe a MuninnDB copy), and Bun's global packages (the `luca` command).
- **Per repo, v13 writes:** `.luca/` (config, state, ledger, phases and more), three hook scripts in `.claude/hooks/` wired in a **tracked** `.claude/settings.json`, a `.claude/cache/` file, a `.gitignore` block, and sometimes `.env` and `.claude/settings.local.json`.
- **The worst clash is the command name.** v13 and v14 are the same npm package (`@alecsibilia/luca`) with the same `luca` command. Installing v14 replaces v13. But v13's global hook still runs `luca hook stage-gate` before every Edit, Write, NotebookEdit and Bash call, in every repo. After the upgrade that line runs v14's `luca`. If v14 exits with code 2 there, it blocks every one of those tool calls everywhere. Any other non-zero code shows an error on every call but lets it through.
- **The second clash is `.luca/config.json`.** Both versions use that exact path with different shapes. v14's `luca-setup` already rewrites an old one and keeps `muninn.vault`. It leaves the rest of v13's `.luca/` alone.
- **Most of the rest doesn't break v14, it just lingers.** v14's run agents start with `settingSources: []`, so v13's skills, agents, and hooks never reach a Luca run. They still reach the user's own Claude Code sessions.
- **One thing v14 should reuse, not remove:** MuninnDB. Its data, token and binary belong to MuninnDB (`~/.muninn/`, `~/.local/bin/muninn`), not to v13. v14's engine already finds MuninnDB through the `mcpServers.muninn` entry v13 wrote.

## Which v13 is "v13"?

| Version | Where | What differs |
|---|---|---|
| `13.0.1` | npm `latest` (2026-07-02) | What most v13 users have. 41 skills, 20 agents, 17 commands, 3 project hooks, status line. |
| `13.1.0-alpha.0` | npm `alpha` | Adds the `trace-insights` skill and the LangSmith step (`.claude/settings.local.json`). Same agents, commands, hooks. |
| tag `old-luca-final` | git only, never published | Adds the `## Compact Instructions` block in `CLAUDE.md`, the retired-artifact prune (`.luca-retired-backup/`), and the handoff mailbox (`~/.luca/handoff/`). No npm user has these. |

Sources: `https://registry.npmjs.org/@alecsibilia%2fluca` (`dist-tags`); tarball listings of `luca-13.0.1.tgz` and `luca-13.1.0-alpha.0.tgz` (`dist/claude/skills`, `dist/claude/.claude/{agents,commands,hooks}`); string search of both bundles for `Compact Instructions`, `.luca-retired-backup`, `.luca/handoff`, `CC_LANGSMITH_METADATA`.

Note: the `alpha` dist-tag points at `13.1.0-alpha.0` today. v14's first `14.0.0-alpha.N` publish will move it.

## How v13 gets onto a computer

- **Install:** the v13 README says `bun add -g @alecsibilia/luca` *or* `npm install -g @alecsibilia/luca`. Both put a `luca` command on `PATH` (`bin: { luca: ./bin/luca.js }`, shebang `#!/usr/bin/env bun`).
- **Then `luca init`** (tag `packages/luca-cli/src/commands/init.ts`) runs five steps. Steps 1-4 are per computer. Step 5 writes into the current folder, so every repo a user ran `luca init` in got the per-repo files.
- **Then `luca vault:init`** (`commands/vault-init.ts`) per repo, for the vault name and an optional key.
- **Older Luca:** v12 and before shipped as a *different* package, `@alecsibilia/luca-framework` (latest `11.8.1`, alpha `12.0.0-alpha.16`), also with a `luca` command. v13's own doctor warns when both are installed (`utils/doctor/checks/legacy-package.ts:24`).

## Per computer: what v13 writes

| # | What | Where | Written by (tag path) | In 13.0.1? |
|---|---|---|---|---|
| C1 | The `luca` command | `~/.bun/bin/luca` → `~/.bun/install/global/node_modules/@alecsibilia/luca/` (or npm's global prefix) | `bun add -g` / `npm i -g` | yes |
| C2 | Luca home | `~/.luca/` and `~/.luca/bin/` (empty unless C3 ran) | `utils/luca-home.ts:36,40`, init Step 2 (`init.ts:147-148`) | yes |
| C3 | MuninnDB binary copy | `~/.luca/bin/muninn` (copied after MuninnDB's own installer put one in `/usr/local/bin` or `~/.local/bin`) | `utils/muninndb-download.ts`, init Step 3 | yes |
| C4 | MuninnDB start attempt | `~/.luca/muninndb-data/` (mkdir), `~/.luca/muninndb.pid` | `utils/muninndb-service.ts:68-69,90` | yes, but broken (see below) |
| C5 | Vault creation | a vault inside MuninnDB, via `muninn vault create <name>` | `utils/vault-setup.ts:120`, init Step 5 | yes |
| C6 | Skills | `~/.claude/skills/<41 names>/` (13.1.0-alpha.0 adds `trace-insights`) | `init/helpers/install-skills.ts`, `harness.ts:77` | yes |
| C7 | Agents | `~/.claude/agents/<20 names>.md` | same | yes |
| C8 | Commands | `~/.claude/commands/<17 names>.md` | same | yes |
| C9 | Global stage-gate hook | `~/.claude/settings.json` → `hooks.PreToolUse[]` entry `{ matcher: "Edit\|Write\|NotebookEdit\|Bash", hooks: [{ type: "command", command: "luca hook stage-gate", timeout: 30 }] }` | `init/helpers/wire-claude-hooks.ts:29,41,127` | yes |
| C10 | Status line | `~/.claude/luca-statusline.ts` (self-contained Bun script) + `~/.claude/settings.json` `statusLine: { type: "command", command: "bun \"<home>/.claude/luca-statusline.ts\"", padding: 0 }` (only if no statusLine existed) | `init/helpers/install-statusline.ts:39,170-174` | yes |
| C11 | MuninnDB in Claude Code | `~/.claude.json` → `mcpServers.muninn = { type: "sse", url: "http://127.0.0.1:8750/mcp", headers: { Authorization: "Bearer <token>" } }`. Only when `~/.muninn/mcp.token` exists. Atomic write, mode 0600. | `wire-claude-hooks.ts:15,421,457` | yes |
| C12 | Antigravity skills + agents | `~/.gemini/antigravity-cli/{skills,agents}/` (no commands). Only if that folder already existed. | `harness.ts:92` | yes |
| C13 | Antigravity hook | `~/.gemini/antigravity-cli/hooks.json` → `"luca-stage-gate": { enabled: true, PreToolUse: [{ matcher: "replace\|write_file\|run_shell_command\|run_command", hooks: [{ command: "luca hook stage-gate", timeout: 30 }] }] }` | `wire-claude-hooks.ts:154,296` | yes |
| C14 | Antigravity MCP | `~/.gemini/antigravity-cli/mcp_config.json` → `mcpServers.muninn` (`serverUrl`, `headers`, `enabledTools: ["*"]`) | `wire-claude-hooks.ts:186` | yes |
| C15 | Doctor backups | `~/.claude/.luca-legacy-backup/{agents,rules}/` (from `luca doctor --fix`) | `utils/doctor/checks/legacy-claude-artifacts.ts:32` | yes |
| C16 | Update check cache | update-notifier's configstore file (only when `luca version` runs) | `utils/version-check.ts` (`checkForUpdates`), called from `luca version` | yes |
| C17 | Handoff mailbox | `~/.luca/handoff/` | `luca-core/src/handoff/constants.ts:12` | **no** (tag only) |
| C18 | Retired-artifact quarantine | `~/.claude/.luca-retired-backup/` | `install-skills.ts:202` | **no** (tag only) |

Also printed, not written: if `~/.luca/bin` isn't on `PATH`, v13 tells the user to add `export PATH="$HOME/.luca/bin:$PATH"` to `~/.zshrc` / `~/.bashrc` / fish config (`utils/path-check.ts:53,62`). Some users will have that line in a shell file.

The 13.0.1 names, from the tarball:

- **Skills (41):** arch-audit, bug-diagnose, caveman, choose, gh-issue-triage, gh-pr-address, gh-prepare, grill-me, lu, lu-review, luca-init, luca-telemetry-report, luca-write-surface, memory-audit, milestone-audit, milestone-complete, milestone-gaps, milestone-new, note, phase-add, phase-assumptions, phase-discuss, phase-execute, phase-insert, phase-plan, phase-remove, phase-research, post-init-tour, progress, project-new, quick, rename-audit, repo-audit, repo-cleanup, seed-memory, session-pause, session-plan, session-resume, todo-add, todo-check, workflow-save. (13.1.0-alpha.0 adds trace-insights.)
- **Agents (20):** architect, build, debater, discuss, discussion, execute, executor, fast, finalize, learner, plan-reviewer, plan, research, researcher, review, reviewer, shadow-scanner, test-writer, triage, verifier.
- **Commands (17):** bug-diagnose, gh-issue-triage, gh-pr-address, gh-prepare, grill-me, lu-review, lu, luca-init, luca-telemetry-report, memory-audit, milestone-new, phase-discuss, phase-execute, phase-plan, repo-cleanup, todo-add, todo-check.

v13 installs by **overwriting** any file of the same name (`install-skills.ts:379`). Several names are generic (`grill-me`, `caveman`, `quick`, `note`, `progress`, `choose`, `research`, `review`, `plan`, `build`). So a user's own skill or agent with one of those names may have been replaced, and a same-named file today may or may not be v13's.

### MuninnDB: what v13 really did

See the sibling research, `docs/research/luca-v14-on-npm/muninndb-installer.md` (branch `research/muninndb-installer`), for the full test. In short:

- v13's download works. Its start step is broken on today's MuninnDB: `muninn --port 8476 --data-dir ~/.luca/muninndb-data` isn't a valid command (today's flags are `muninn start`, or `--daemon --data <dir>`, per `muninn --help`).
- So a v13 user's memories live where **MuninnDB** put them: `~/.muninn/data`, with the token at `~/.muninn/mcp.token`. `~/.luca/muninndb-data/`, if it exists, is most likely empty.
- v13 only wires Claude Code (C11) when `muninn init` already made the token.

## Per repo: what v13 writes

| # | What | Where | Written by (tag path) | In 13.0.1? |
|---|---|---|---|---|
| R1 | Old-style config | `.luca/config.json` = `{ lucaVersion, oversight: "full-auto", muninn: { vault } }`. Real repos also have `preferences` and `muninn.todoBacklog: { vault, rootId }`. An older v13 put the vault at top-level `vault`. | `init/helpers/write-project-skeleton.ts:58-68`; `vault-setup.ts` (`writeVaultConfig`) | yes |
| R2 | Run state | `.luca/state.json`, `.luca/state.json.lock`, `.luca/lock.json` | `write-project-skeleton.ts:40`; state helpers | yes |
| R3 | Run history | `.luca/ledger.jsonl`, `.luca/telemetry/<runId>.jsonl`, `.luca/tmp/` (incl. `tmp/previews/`) | luca-core ledger/telemetry | yes |
| R4 | Planning files (meant to be committed) | `.luca/phases/<slug>/…`, `.luca/archive/<slug>/`, `.luca/milestones/`, `.luca/roadmap.md`, `.luca/rules/`, `.luca/quick/`, `.luca/verification-wave-*.json` | the v13 skills and write surface | yes |
| R5 | `.gitignore` block | a `# Luca workflow runtime state…` header and 7 lines: `.luca/state.json`, `.luca/state.json.lock`, `.luca/lock.json`, `.luca/ledger.jsonl`, `.luca/telemetry/`, `.luca/tmp/`, `.playwright-cli/` | `write-project-skeleton.ts:89-100` (`ensureLucaGitignore`) | yes |
| R6 | Project hook scripts | `.claude/hooks/pipeline-guard.ts`, `continuation-messages.ts`, `context-refresher.ts` (about 530 KB each, bundled, self-contained) | `init/helpers/install-hooks.ts:91-92` | yes |
| R7 | Project hook wiring | `.claude/settings.json` → `PreToolUse[Bash]` pipeline-guard, `PostToolUse[Bash]` continuation-messages, `PostToolUse[*]` context-refresher, each `bun "$CLAUDE_PROJECT_DIR"/.claude/hooks/<name>.ts`. **This file is usually tracked in git.** | `install-hooks.ts:108-109` (merge keyed on `/.claude/hooks/`, line 55) | yes |
| R8 | Hook sidecar | `.claude/cache/context-refresher-state.json`, rewritten on **every** tool call while R7 is wired | bundled `context-refresher.ts` (`SIDECAR_RELATIVE_PATH`) | yes |
| R9 | Vault key | `.env` → `MUNINN_DB_API_KEY=<key>` (mode 0600) and `.env` added to `.gitignore` | `vault-setup.ts:348,385,412`; `vault-init.ts:98,117` | yes (only via `luca vault:init` with a key) |
| R10 | LangSmith tag | `.claude/settings.local.json` → `env.CC_LANGSMITH_METADATA` (adds `repo`, `luca_version`) | `init/helpers/enrich-trace-metadata.ts` | 13.1.0-alpha.0 only, only when LangSmith tracing is on |
| R11 | `CLAUDE.md` block | `## Compact Instructions` (creates `CLAUDE.md` if missing) | `init/helpers/ensure-compact-instructions.ts:9` | **no** (tag only) |
| R12 | Quarantine | `.claude/.luca-retired-backup/` | `stray-local-install.ts` fix | **no** (tag only) |

Older, pre-v13 leftovers that can also sit in a v13 user's repo: `.planning/` (v12's folder; v13's `luca migrate-planning` moved its root files into `.luca/` and left `.planning/phases/`), per-repo copies of skills/agents in `.claude/`, and `.claude/hooks/stage-gate.sh` (v13's `stray-local-install` check targets these, `stray-local-install.ts:224`).

## What this Mac has today (read-only check, 2026-09-26)

- `~/.bun/bin/luca` → `@alecsibilia/luca` **13.1.0-alpha.0**.
- `~/.claude/settings.json`: no `hooks` (the freeze removed C9). `statusLine` still runs `bun "~/.claude/luca-statusline.ts"` (C10 kept, per #350).
- `~/.claude/{skills,agents,commands}`: no v13 names left (the freeze moved 86 items to `~/.claude-old-luca-backup-2026-09-22/`). `skills/restructure-driver` (hand-made) and `rules/hook-skill-boundary.md` remain.
- `~/.claude/.luca-legacy-backup/` (1 file) and `~/.claude/.legacy-backup-2026-06-09/` (13 files) remain.
- `~/.claude.json` `mcpServers.muninn` = `{ type: "sse", url: "http://127.0.0.1:8750/mcp", headers: { Authorization } }` (C11). No `luca` MCP server.
- **Antigravity was never cleaned.** `~/.gemini/antigravity-cli/hooks.json` still has `luca-stage-gate` running `luca hook stage-gate`; `mcp_config.json` has `muninn`; `agents/` has the 20 v13 agents (plus `luca-executor.md` from v12); `skills/` has 42 entries.
- `~/.luca/`: `bin/` (empty), plus `backups/` (5 copies of `~/.claude/settings.json`, mode 0600) and `manifests/deploy-manifest.json`. Those two came from a pre-v13 dev deploy (manifest says `package_version: 5.4.0`, 99 artifacts); v13 doesn't write them. 15 of that deploy's 22 rules are still in `~/.claude/rules/`.
- MuninnDB runs as `muninn --daemon --data ~/.muninn/data` from `~/.local/bin/muninn`. No `~/.luca/muninndb-data`, no `~/.luca/muninndb.pid`.
- No `/tmp/luca-*.json`. `~/.local/state/luca/{runs,board}` exists (that's v14's).

Repos (`~/Github/*`, read-only):

| Repo | `.luca/` | config shape | `.claude/hooks/` + wiring | `.claude/cache/` | `.gitignore` block | `.planning/` |
|---|---|---|---|---|---|---|
| movie-rankings | 1.3 MB: config, ledger, phases, state (idle), telemetry, tmp | old (`lucaVersion`, `oversight`, `muninn.todoBacklog`) | 3 hooks, tracked | yes | yes | no |
| ramora | 8.4 MB: + archive, milestones, quick | old (+ `preferences`) | 3 hooks, tracked | yes | yes | 12 KB |
| joes-book--next | 28 KB: config, state (idle), tmp, verification-wave-*.json | old | 3 hooks, tracked | yes | yes | 6.6 MB |
| heartgold-plus | none | — | none | no | no | 3.1 MB |
| relic-run-2 | none | — | none | no | no | 1.2 MB |
| luca-framework | config only | new (v14) | unwired | — | yes | no |

This matches the table in #344. All three `state.json` files say `idle`.

## Which pieces clash with v14

v14, per the map (#438): `luca init` (installs and starts MuninnDB, adds it to Claude Code, puts the board plugin into Paseo), `luca setup` (today's `luca-setup`), `luca doctor`. Runs start from `/luca-run` in Paseo. v14 keeps run data in `~/.local/state/luca/` and reads only `.luca/config.json` in a repo.

### Real clashes (break something or need a decision)

1. **Same package, same command (C1).** v14 is `@alecsibilia/luca` too, with a `luca` bin. `bun add -g @alecsibilia/luca@alpha` replaces v13 in place. So v13 and v14 can't both be installed globally on one computer. "v13 users can stay on v13" means per computer, not per repo. If one was installed with npm and the other with Bun, two `luca` commands sit on `PATH` and the first one wins. `@alecsibilia/luca-framework` (v12) also ships `luca`.
2. **The global hook calls `luca` (C9, C13).** After the upgrade, `luca hook stage-gate` runs v14's CLI before every Edit, Write, NotebookEdit and Bash call, in every Claude Code session (including the Paseo session where the user types `/luca-run`), and in Antigravity. Claude Code's rule: exit 0 = allow; **exit 2 = block the tool call**; any other non-zero = non-blocking error, the call goes ahead ("Without valid JSON on stdout, Claude Code treats exit code 1 as a non-blocking error", code.claude.com/docs/en/hooks). If the user removes v13 first, the hook fails with "command not found" (127): an error on every call, not a block.
   - While v13 itself is still installed, its hook **blocks** (exit 2, even when idle) any tool write under `~/.claude/` or `~/.luca/`, under `.git/`, system dirs, and `/tmp/luca-*` (`handle-stage-gate-hook.ts:182-191`; `luca-core/.../classify-write-path.ts:61`). The freeze agent hit this: it couldn't edit `~/.claude/settings.json` to remove the hook (#344). So cleanup must run from the user's own terminal (a CLI writing files), not as an agent's Edit.
3. **`.luca/config.json` (R1).** Same path, different shape. v14's `luca-setup` spots an old config by any key not in the new schema (`lucaVersion`, `oversight`, `preferences`, `muninn.todoBacklog`) and rewrites it to `{ checks: <guessed>, muninn: { vault } }` (`packages/engine/src/cli/setup.ts`, `findConfig` / `oldVault` / `startingConfig`). Two gaps:
   - It reads only `muninn.vault`. An old config with only a top-level `vault` (pre-`muninn.vault` v13) loses its vault. v13's own doctor folds that case (`vault-config-location.ts`).
   - The rewrite is a change to a committed file, so it needs a PR. `luca-setup` says so and never commits.
4. **MuninnDB in Claude Code (C11).** Not a clash in data, but a clash in writers. v14's `luca init` "adds MuninnDB to Claude Code", and v14's engine reads exactly this entry (`packages/engine/src/memory/muninn-mcp-client.ts`, `muninnSettings`: top-level `mcpServers.muninn` `url` + `headers.Authorization`). v13 wrote `type: "sse"` and would rewrite an `http` entry back to `sse`. v14 should keep a working entry and its token, not add a second one. (Sibling #441 research covers the exact command.)
5. **MuninnDB install (C3, C4).** v14's `luca init` installs and starts MuninnDB. A v13 user usually already has it (`~/.local/bin/muninn` or `/usr/local/bin/muninn`, data in `~/.muninn/data`), plus maybe a stale second binary at `~/.luca/bin/muninn` that `muninn upgrade` never updates, plus maybe `~/.luca/bin` on `PATH` ahead of it. v14 must find and reuse the running one. Deleting `~/.luca/` is safe for memories only after checking `~/.luca/muninndb-data/` is empty or absent.

### Leftovers that don't break v14 but should go (or be offered)

6. **v13 skills, agents, commands (C6-C8, C12).** v14 run agents never see them (`settingSources: []`, `skills: []`, `packages/engine/src/agents/claude-options.ts:207-212`). But the user's own Claude Code and Antigravity sessions still list them, and they tell the model to run v13 verbs (`luca state advance`, `luca phase …`, `luca roadmap …`) that v14 doesn't have. `/lu` and `/luca-init` still look like the way to start Luca. The map says these are gone in v14.
7. **Project hooks (R6-R8).** v14 run agents don't load project settings, so these don't touch runs. In the user's own sessions they start a ~530 KB Bun script on every Bash call (two) and every tool call (one), and rewrite `.claude/cache/context-refresher-state.json` each time. With `state.json` idle they inject nothing. If a repo was left mid-run (non-idle), context-refresher injects old `<luca-reminder>` text into every session. Remove the wiring **before or with** the scripts: wiring left pointing at deleted scripts makes every tool call error (non-blocking). R7 is in a tracked file, so removal is a commit.
8. **Status line (C10).** Self-contained and still works after v13 is gone. Its "pipeline step" segment reads `.luca/state.json`, which v14 never writes, so that part goes blank. The 13.0.1 copy lacks the `opus-5` fix (shows Opus 5 with a 200k limit, #350). The map says the status line doesn't carry over; it can be kept or removed.
9. **The rest of `.luca/` (R2-R4) and the `.gitignore` block (R5).** v14 ignores them. R4 is committed planning history (phases, archive, milestones, roadmap); some users will want to keep it. The `.gitignore` lines are harmless.
10. **Doctor and freeze backups** (C15, C18, `~/.claude-old-luca-backup-*`, `~/.claude/.legacy-backup-*`): v13's own backup folders. Dot-folders, not loaded by Claude Code. Safe to leave; offer deletion.
11. **`.env` `MUNINN_DB_API_KEY` (R9).** v14 doesn't read it (v14 uses `LUCA_MUNINN_URL` / `LUCA_MUNINN_TOKEN` or `~/.claude.json`). Harmless. It's a secret, so doctor should report it, never print it.
12. **`~/.luca/`** (C2-C4, C17, plus pre-v13 `backups/` and `manifests/`). v14 doesn't use `~/.luca/`. `backups/` holds old copies of `~/.claude/settings.json`, which can contain secrets in `env`.

### Shared, not a clash

- **Memory vaults.** v14's `luca-setup` keeps the vault name, and v14 recalls from that vault plus `default`, filtered only by a minimum score, not by concept (`packages/engine/src/memory/memory-recall.ts`). So v13's old `session:*`, `todo:*` and `brain:*` memories can come back in v14 runs. Useful for patterns and pitfalls, noisy for old todos. (Alec archived his 86 old todos, #344.)
- **v14's own folders** (`~/.local/state/luca/`, `~/.local/share/luca/`, `~/.paseo/`) are new. v13 never wrote there.

## Facts later decisions depend on

For `luca doctor`:

- **v14's `luca` must answer `luca hook stage-gate` with exit 0.** It should read stdin and ignore it, and perhaps print a one-line nudge to run `luca doctor`. It must never exit 2 there, or it blocks every Edit/Write/Bash in every repo for anyone who upgrades before cleaning up. This is a CLI requirement, not only a doctor check.
- **How to find each piece:**
  - Global hook: any `hooks.PreToolUse[].hooks[].command` containing `stage-gate` in `~/.claude/settings.json` (v13's own test, `stray-local-install.ts` `isStageGateEntry`).
  - Antigravity hook: the `luca-stage-gate` key in `~/.gemini/antigravity-cli/hooks.json`.
  - Project hooks: any hook command containing `/.claude/hooks/` whose file name is one of the three (v13's own marker, `install-hooks.ts:55`).
  - Skills, agents, commands: the name lists above. Because v13 overwrote same-named files and the names are generic, match by content (hash against the 13.0.0, 13.0.1 and 13.1.0-alpha.0 tarballs), not by name alone.
  - Status line: `statusLine.command` containing `luca-statusline.ts` (`statusline-registered.ts`).
  - Old config: `.luca/config.json` with keys outside the v14 schema. Handle top-level `vault` too.
- **Move, don't delete.** v13's doctor already did this (`.luca-legacy-backup/`, `.luca-retired-backup/`), and the freeze did too. Reuse that pattern: back up, then move.
- **Scope it by computer vs repo**, like v13's doctor (`scope: 'global' | 'project'`, `run-doctor.ts:49`). Per-repo fixes to tracked files (`.claude/settings.json`, `.luca/config.json`) are changes the user commits; doctor never commits.
- **Order matters:** strip hook wiring before deleting hook scripts; strip the global stage-gate before (or right after) replacing the `luca` command.
- **Don't touch MuninnDB's own files** (`~/.muninn/`, its binary, its data). Only flag `~/.luca/bin/muninn` (stale copy), `~/.luca/muninndb-data/` (check it's empty), and a `~/.luca/bin` `PATH` line.
- v13's doctor checks worth porting (they already cover pieces of this): `legacy-package`, `stale-global-symlinks`, `stale-mcp-server`, `muninn-mcp`, `shared-tmp-payloads`, `vault-config-location`, `stray-local-install` (tag `packages/luca-cli/src/utils/doctor/checks/`).

For the migration guide:

- Upgrading **replaces** v13 on that computer. There's no side-by-side.
- `luca init` changes meaning: v13's did computer **and** repo work (Step 5 wrote `.luca/` and `.claude/` into the current folder). v14's is per computer only. Per repo is now `luca setup`.
- Gone: all v13 skills, agents and commands (`/lu`, `/luca-init`, …), the stage-gate hook, the three project hooks, `luca vault:init`, the `.luca/` planning files, the status line, Antigravity support.
- Kept: MuninnDB and its data, the vault name (moved into the new `.luca/config.json` by `luca setup`), the `~/.claude.json` `muninn` entry.
- Per repo, the user commits two changes: the rewritten `.luca/config.json` and the de-hooked `.claude/settings.json`. Deleting the rest of `.luca/` is optional (it holds planning history).
- Run cleanup from a terminal, not by asking an agent: while v13's hook is live it blocks agent writes under `~/.claude/`.
- When `latest` moves to v14, a v13 user who runs `luca version` sees "New Luca CLI version available … Run: bun add -g @alecsibilia/luca@latest" (13.0.1 `dist/chunks/version.mjs`). That's the only v13 nudge; nothing else checks for updates.

## Uncertain

- **What v14's `luca` does with unknown commands** isn't built yet, so the exit code of `luca hook stage-gate` under v14 is a decision, not a fact.
- **Paseo loading user hooks.** I assumed the Paseo-hosted Claude Code session loads `~/.claude/settings.json` like any Claude Code session. Not tested.
- **Other users' `~/.luca/muninndb-data/`.** On today's MuninnDB the start step fails, so it should be empty. An older MuninnDB may have taken those flags; I couldn't check.
- **npm-installed v13.** Where npm puts the global package depends on the user's npm prefix. Not checked; doctor should look up every `luca` on `PATH`.
- **Antigravity** is out of v14's scope, but v13 wrote into it and its hook also calls `luca`. How far doctor goes there is a decision.
- **Pre-v13 leftovers** (`@alecsibilia/luca-framework`, `.planning/`, `~/.luca/backups`, `~/.luca/manifests`, v12's `luca-*.md` agents and 4 rules). The ticket asks about v13, so these are listed but not traced in full.

## Sources

- v13 code at tag `old-luca-final` (read with `git show old-luca-final:<path>`):
  - `packages/luca/package.json` (`bin`, version `13.1.0-alpha.0`)
  - `packages/luca-cli/src/commands/init.ts`, `commands/vault-init.ts`, `utils/version-check.ts`
  - `packages/luca-cli/src/init/helpers/{harness,install-skills,wire-claude-hooks,install-statusline,install-hooks,write-project-skeleton,ensure-compact-instructions,enrich-trace-metadata}.ts`
  - `packages/luca-cli/src/utils/{luca-home,muninndb-download,muninndb-service,muninndb-schemas,muninndb-health,muninn-token,muninn-mcp-registration,vault-setup,path-check}.ts`
  - `packages/luca-cli/src/utils/doctor/checks/*.ts`, `utils/doctor/run-doctor.ts`, `utils/doctor/types.ts`
  - `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`; `packages/luca-core/src/luca-dir/helpers/classify-write-path.ts`; `packages/luca-core/src/handoff/constants.ts`
  - `packages/luca/CHANGELOG.md` (13.0.0 / 13.0.1 entries)
- npm registry: `https://registry.npmjs.org/@alecsibilia%2fluca` and `@alecsibilia%2fluca-framework` (dist-tags, versions, `bin`); tarballs `luca-13.0.1.tgz`, `luca-13.1.0-alpha.0.tgz` (bundled skills/agents/commands/hooks, `dist/claude/.claude/settings.json`, `luca-statusline.ts`, `dist/chunks/init.mjs`, `dist/chunks/version.mjs`, README).
- v14 on `main` (`3ba954ac2`): `packages/engine/src/cli/setup.ts`, `config/engine-config.ts`, `memory/muninn-mcp-client.ts`, `memory/memory-recall.ts`, `agents/claude-options.ts`, `journal/journal.ts`, `cli/release.ts`; `packages/board/paseo-plugin.json`, `packages/board/server/engine-launch.ts`.
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks (exit codes; `~/.claude/settings.json` applies to all projects). Accessed 2026-09-26.
- `muninn --help` (`~/.local/bin/muninn`, v0.11.0), accessed 2026-09-26.
- Sibling research: `docs/research/luca-v14-on-npm/muninndb-installer.md` on branch `research/muninndb-installer` (#441).
- Issues #344 (freeze, other-repo table) and #350 (leftovers).
- This Mac, read-only: `~/.claude/settings.json` (keys only), `~/.claude.json` (`mcpServers.muninn` shape, token not read out), `~/.gemini/antigravity-cli/{hooks,mcp_config}.json`, `~/.luca/`, `~/.muninn/`, `ps`, and the six repos above.
