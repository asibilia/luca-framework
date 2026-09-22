# What guard tools does Claude Code give each agent?

> Research for [#347](https://github.com/asibilia/luca-framework/issues/347) on the map "Map: Luca v1 on Paseo + Claude Code" (#325). Date: 2026-09-22.
>
> Versions checked: Claude Code 2.1.280 (`claude --version`), Paseo 0.9.1 (app bundle, `paseo --version`, and source tag `v0.9.1` of `getpaseo/paseo`), Claude Agent SDK 0.3.246 (the version Paseo 0.9.1 pins, `packages/server/package.json:107`). Codex CLI is not installed on this machine (`codex: command not found`), so Codex guards are out of scope here.
>
> Docs: every `code.claude.com` page cited was fetched live on 2026-09-22 and matched, byte for byte, the copies saved earlier in `/tmp/ccg-docs/`. Paseo pages on `paseo.sh` were checked the same way. No model session was started for this research.

## Answer

- **Claude Code has five guard layers per agent.** Permission rules (allow, ask, deny), a permission mode, PreToolUse hooks plus the SDK's `canUseTool`, an OS sandbox for shell commands, and the choice of which settings, plugins, skills, and MCP servers load at all.
- **Deny always wins, and a hook's deny is final.** A deny rule from any source blocks. A PreToolUse hook that returns `deny` (or exits 2) can't be overridden by allow rules, other hooks, or any permission mode. A hook's `allow` can't override a deny or ask rule either.
- **Rules on file tools hold. Rules on Bash don't.** The docs say a Bash deny rule "isn't a security boundary": `Bash(git push *)` does not stop `git -C . push`. Edit rules do catch `sed`, `tee`, and `>` targets, but not `python -c`, `bun -e`, or any code the test command runs.
- **Only the OS sandbox holds for Bash, and it covers Bash only.** Set up right, it stops writes outside the worktree, all network (so no `git push`, no `gh`, no MuninnDB over loopback), and edits to settings and hook files. It does not cover the Edit tool, MCP tools, or hooks.
- **The sandbox lets git commit by default in a worktree.** It deliberately allows writes to the main repo's shared `.git`. The engine must add a `denyWrite` for that `.git` directory to block commits, branches, stashes, and resets at the OS level.
- **Test-file rules need two layers.** The implementer's "no test files" rule can be enforced by the Edit rules plus a sandbox `denyWrite` glob (globs work on macOS only). The test-writer's "only test files" rule can't be made fully OS-level, because the sandbox always lets Bash write the working directory. A plain-code check after each turn has to catch the rest.
- **MCP isolation needs `strictMcpConfig`.** User MCP servers in `~/.claude.json` load even with `settingSources: []`. Only `--strict-mcp-config` / `strictMcpConfig: true` drops them, together with project `.mcp.json`, plugin servers, and claude.ai connectors. This very session was launched by the Paseo daemon and has the user's `mcp__muninn__*` tools, so the leak is live today.
- **Paseo 0.9.1 can't give the strictest setup.** Per agent it accepts only `allowedTools`, `disallowedTools`, `additionalDirectories`, `sandbox`, and `settings.permissions`/`settings.sandbox`. It hard-codes `settingSources: user, project, local`, rejects `dontAsk` mode, has no strict-MCP option, and gives no hook callbacks. Worse, its own injected `paseo` MCP tools let an agent switch itself to `bypassPermissions` or approve its own permission prompts. Those tools must be off for engine agents.
- **Recommendation.** Launch engine agents with the Agent SDK (or `claude -p`) where the engine sets every knob: `dontAsk`, a per-role tool list and allow list, strict MCP with no servers, no setting sources, an SDK PreToolUse callback (it fails closed on timeout), and a sandbox with no network and a denied `.git`. Then run a plain-code backstop after every turn. How the engine drives those sessions is #346's question.

| Layer | What it stops | Where it leaks | Per agent from the SDK / `claude -p` / Paseo 0.9.1 |
|---|---|---|---|
| Permission rules | Named tools and paths; Edit rules also cover `sed`, `tee`, `>` targets | Bash rules match text only; other programs and scripts get past them | yes / yes / yes (via `providerOptions`) |
| Permission mode | `dontAsk` denies anything not pre-approved | Other modes prompt or auto-approve; `Agent` calls need no approval | yes / yes / only plan, default, acceptEdits, auto, bypass |
| PreToolUse hook, `canUseTool` | Sees every tool call; deny is final | Command hooks fail open on crash or timeout; can't see inside scripts | callbacks / settings JSON only / settings files only |
| OS sandbox (Bash) | Writes outside the worktree, network, settings files | Worktree `.git` writable by default; Bash only; Linux ignores write globs | yes / yes / yes |
| Sources: settings, MCP, plugins, skills | Keeps the user's hooks, allow rules, MCP servers, and skills out | `~/.claude.json` MCP and auto memory load regardless of `settingSources` | yes / yes / no (fixed) |

## Findings

### 1. What Claude Code offers per agent

#### Permission rules

- **Syntax.** A rule is `Tool` or `Tool(specifier)`: `Bash(npm run *)`, `Edit(/src/**)`, `Read(./.env)`, `WebFetch(domain:example.com)`, `mcp__server__tool`, `Agent(Explore)` ([permissions](https://code.claude.com/docs/en/permissions#permission-rule-syntax)). A trailing `:*` equals a trailing ` *` ([wildcard patterns](https://code.claude.com/docs/en/permissions#wildcard-patterns)). Deny and ask rules can also match one top-level input field, such as `Bash(run_in_background:true)` or `Agent(isolation:worktree)` ([match by input parameter](https://code.claude.com/docs/en/permissions#match-by-input-parameter)).
- **Order.** "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome." An allow rule can't carve an exception out of a deny rule ([manage permissions](https://code.claude.com/docs/en/permissions#manage-permissions)).
- **A bare deny removes the tool.** A bare name such as `Bash`, or a glob such as `"*"` or `"mcp__*"`, removes the tool from Claude's context. A scoped rule such as `Bash(rm *)` leaves the tool and blocks matching calls ([manage permissions](https://code.claude.com/docs/en/permissions#manage-permissions), [tool name wildcards](https://code.claude.com/docs/en/permissions#tool-name-wildcards)).
- **The model can't change them.** "Permission rules are enforced by Claude Code, not by the model" ([manage permissions](https://code.claude.com/docs/en/permissions#manage-permissions)).
- **Merging.** Deny rules from every source apply. "If a tool is denied at any level, no other level can allow it", and a managed deny can't be overridden by `--allowedTools` ([settings precedence](https://code.claude.com/docs/en/permissions#settings-precedence)). List keys such as `permissions.allow` merge across files ([lists merge](https://code.claude.com/docs/en/settings#lists-merge-instead-of-overriding)).
- **Bash rules.** Claude Code splits compound commands on `&&`, `||`, `;`, `|`, `&`, and newlines, and checks each part; deny rules also match inside subshells and `$(...)`. It strips a fixed list of wrappers (`timeout`, `nice`, `nohup`, bare `xargs`, and a few more) ([compound commands](https://code.claude.com/docs/en/permissions#compound-commands), [wrappers](https://code.claude.com/docs/en/permissions#process-wrappers)). But a rule "isn't a security boundary around the program": `Bash(git push *)` misses `git -C . push origin main`, `git -c push.default=current push`, and `git 'push' origin main`; `Bash(rm *)` misses `/bin/rm` and `bash -c 'rm …'` ([what a Bash rule doesn't match](https://code.claude.com/docs/en/permissions#bash-rule-limits)).
- **Read and Edit rules.** Use `Edit(path)` for every file-writing tool; a `Write(path)` rule is never consulted ([Read and Edit](https://code.claude.com/docs/en/permissions#read-and-edit)). Edit and Read deny rules also cover "file commands Claude Code recognizes in Bash, such as `cat`, `head`, `tail`, `sed`, and `tee`, and … the targets of Bash redirections", but "not … arbitrary subprocesses that read or write files indirectly, like a Python or Node script" (same page).
- **Path anchors.** `//path` is absolute, `~/path` is home, `/path` is relative to the settings source, and `path` is relative to the current directory. For CLI flags and session rules, `/path` means the primary working directory. For a file passed with `--settings`, `/path` means that file's directory ([Read and Edit](https://code.claude.com/docs/en/permissions#read-and-edit)). A relative allow rule such as `Edit(src/**)` only matches under `<cwd>/src`, while the same one-segment pattern as a deny rule matches a `src` directory at any depth. Patterns starting with `**/` match at any depth in both (same page).
- **Symlinks.** Allow rules need both the link and its target to match; deny rules fire if either matches (same page).
- **Redirects and `tee`.** Output redirect targets and `tee` targets are checked against Edit rules, protected paths, and the working directories ([redirections](https://code.claude.com/docs/en/permissions#redirections)).
- **Working directories.** Reads are free inside the working directory and added directories. `--add-dir` and `additionalDirectories` widen that scope, for file tools and for sandbox writes ([working directories](https://code.claude.com/docs/en/permissions#working-directories), [sandbox filesystem](https://code.claude.com/docs/en/sandboxing#filesystem-isolation)).

#### Permission modes

| Mode | What runs without asking ([available modes](https://code.claude.com/docs/en/permission-modes#available-modes)) |
|---|---|
| `default` (Manual) | Reads only |
| `acceptEdits` | Reads, file edits, and `mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed` inside the working directories |
| `plan` | Reads; edits blocked until a plan is approved |
| `auto` | Everything, reviewed by a classifier model |
| `dontAsk` | Reads and pre-approved tools; "anything that would prompt is denied" |
| `bypassPermissions` | Everything, except the actions no mode auto-approves |

- `claude -p` and SDK sessions start in `default` on every plan; interactive terminals start in `auto` on Pro, Max, and Team ([which mode a session starts in](https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in)).
- `dontAsk` "auto-denies every tool call that would otherwise prompt", but still runs file reads in the working directories, the built-in read-only Bash commands, allow-rule matches, and calls a PreToolUse hook approved ([dontAsk mode](https://code.claude.com/docs/en/permission-modes#allow-only-pre-approved-tools-with-dontask-mode)). `Agent` calls need no approval either ([SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions#allow-and-deny-rules)).
- **Protected paths** are never auto-approved except in `bypassPermissions`, and `dontAsk` denies them. Allow rules don't pre-approve them. They include `.git`, `.claude` (except `.claude/worktrees`), `.husky`, `.vscode`, `.gitconfig`, `.mcp.json`, `.claude.json`, `bunfig.toml`, `.npmrc`, `lefthook.yml`, and shell rc files ([protected paths](https://code.claude.com/docs/en/permission-modes#protected-paths)).
- **Critical paths**: `rm` or `rmdir` of `/`, top-level dirs, home, or the working directory is never approved by an allow rule or a hook's allow ([critical paths](https://code.claude.com/docs/en/permission-modes#critical-paths)).
- **`--permission-prompts none`** (SDK `permissionPrompts: 'none'`) denies whatever would prompt, instead of asking the host. A `-p` run with no permission host denies those calls anyway ([turn off permission prompts](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs)). Denials show up as `permission_denied` messages and in `permission_denials` in the result (same page), which the engine can journal.

#### Hooks and `canUseTool`

- **SDK order.** Hooks run first, then deny rules, ask rules, the permission mode, allow rules, and last `canUseTool`. "A hook that returns `allow` does not skip the deny and ask rules." Auto-approved calls "never reach `canUseTool`" ([SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions#how-permissions-are-evaluated)). In `dontAsk`, `canUseTool` is never called (same page).
- **Deny is final.** With several PreToolUse hooks, "precedence is `deny` > `defer` > `ask` > `allow`" ([PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)). Exit code 2 "blocks … even a JSON `permissionDecision` of `"allow"` can't override it" ([exit code 2](https://code.claude.com/docs/en/hooks#exit-code-2)). "A blocking hook also takes precedence over allow rules" ([extend permissions with hooks](https://code.claude.com/docs/en/permissions#extend-permissions-with-hooks)). A hook deny applies even in `bypassPermissions` ([SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions#allow-and-deny-rules)).
- **Command hooks fail open.** Exit code 1 without JSON is "a non-blocking error" and the call proceeds. A hook that can't start, or that times out, doesn't block ([other exit codes](https://code.claude.com/docs/en/hooks#other-exit-codes), [timeouts](https://code.claude.com/docs/en/hooks#timeouts)). The docs warn: "a mistyped path in `settings.json` leaves the gate silently disabled" (same section).
- **SDK callback hooks fail closed on timeout.** A PreToolUse callback that times out means "Claude Code doesn't run the tool call" ([SDK hook timeout](https://code.claude.com/docs/en/agent-sdk/hooks#hook-timeout)).
- **Nothing in a settings file can switch SDK callbacks off.** `disableAllHooks` in any non-managed file disables user, project, local, and plugin hooks, but "Agent SDK hooks … keep running". `allowManagedHooksOnly` also keeps SDK hooks ([disableAllHooks](https://code.claude.com/docs/en/settings-reference#disableallhooks), [allowManagedHooksOnly](https://code.claude.com/docs/en/settings-reference#what-runs-under-allowmanagedhooksonly)).
- **Hooks run inside subagents**, with `agent_id` and `agent_type` in the input ([hook locations](https://code.claude.com/docs/en/hooks#hook-locations)).
- **File paths arrive absolute.** "Claude Code expands `~` and relative paths before hooks run, so a hook that matches on paths can't be bypassed via `~` or a relative spelling" ([PreToolUse input](https://code.claude.com/docs/en/hooks#pretooluse-input)). Symlinks are not resolved for you.
- **The `if` filter is best-effort.** "Use the permission system rather than a hook to enforce a hard allow or deny" ([common fields](https://code.claude.com/docs/en/hooks#common-fields)). Match hooks on the tool name, then decide in code.
- **`ConfigChange` hooks can block a settings change** from reaching the running session, for user, project, local, and skills sources ([ConfigChange](https://code.claude.com/docs/en/hooks#configchange)).

#### The OS sandbox

- **Scope.** It "applies only to Bash, PowerShell, and Monitor commands and their child processes". Read, Edit, and Write "use the permission system directly" ([permission rules](https://code.claude.com/docs/en/sandboxing#permission-rules), [scope](https://code.claude.com/docs/en/sandboxing#scope)). macOS uses Seatbelt; Linux uses bubblewrap ([OS-level enforcement](https://code.claude.com/docs/en/sandboxing#os-level-enforcement)).
- **Writes.** By default, sandboxed commands can write the working directory, the session temp dir, and added directories. Reads are allowed almost everywhere, credential files such as `~/.ssh/` included ([filesystem isolation](https://code.claude.com/docs/en/sandboxing#filesystem-isolation)).
- **The worktree exception.** "When the working directory is a linked git worktree, the sandbox also allows writes to the main repository's shared `.git` directory so commands such as `git commit` can update refs and the index. Writes to `hooks/` and `config` inside that directory remain denied" ([filesystem isolation](https://code.claude.com/docs/en/sandboxing#filesystem-isolation); also [worktrees](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout)).
- **Deny beats allow.** `denyWrite` blocks "paths inside a directory that is otherwise writable" ([denyWrite](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-denywrite)). Edit allow and deny rules are also added to `allowWrite` and `denyWrite` ([sandbox.filesystem](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem)). The open-source runtime says the same: "`denyWrite` takes precedence over `allowWrite`" ([sandbox-runtime README](https://github.com/anthropic-experimental/sandbox-runtime/blob/ddbeb74711c4097014ef3056791efa83f553116c/README.md), and the deny rules come after the allow rules in `src/sandbox/macos-sandbox-utils.ts:869-930` at that commit).
- **Globs.** In `allowWrite` and `denyWrite`, "on macOS, wildcards work. On Linux and WSL2 … Claude Code skips an entry that contains `*`, `?`, or `[`" ([sandbox path prefixes](https://code.claude.com/docs/en/settings-reference#sandbox-path-prefixes)).
- **Built-in protected files.** Even inside writable dirs, the sandbox denies writes to `.claude` settings files, `.claude/skills|agents|commands|hooks`, `.mcp.json`, shell rc files, `.gitconfig`, `.git/hooks`, `.git/config`, and most of `~/.claude` plus `~/.claude.json`. "There is no way to exempt one of these paths" ([protected paths](https://code.claude.com/docs/en/sandboxing#protected-paths)).
- **Network.** All traffic goes through a proxy. "Claude Code pre-allows no domains by default." With `strictAllowlist`, or in `dontAsk` mode, hosts off the list are denied instead of prompting ([network isolation](https://code.claude.com/docs/en/sandboxing#network-isolation), [strictAllowlist](https://code.claude.com/docs/en/settings-reference#sandbox-network-strictallowlist)). On macOS, "the Seatbelt profile allows communication only to a specific localhost port", and the proxy won't dial a loopback address unless that address is on the allowlist. But `allowLocalBinding` "lets the sandboxed process connect to loopback ports without going through the proxy at all" ([sandbox-runtime README](https://github.com/anthropic-experimental/sandbox-runtime/blob/ddbeb74711c4097014ef3056791efa83f553116c/README.md)).
- **Escape hatches to close.** `allowUnsandboxedCommands` (default `true`) lets the model retry a blocked command outside the sandbox; set it to `false` ([unsandboxed retry](https://code.claude.com/docs/en/sandboxing#the-unsandboxed-retry-escape-hatch)). `excludedCommands` run unsandboxed and have no lock ([excludedCommands](https://code.claude.com/docs/en/settings-reference#sandbox-excludedcommands)). If the sandbox can't start, the CLI "runs commands without sandboxing" unless `failIfUnavailable` is `true` ([get started](https://code.claude.com/docs/en/sandboxing#get-started)); the SDK's `failIfUnavailable` defaults to `true` ([SandboxSettings](https://code.claude.com/docs/en/agent-sdk/typescript#sandboxsettings)).
- **Auto-allow changes the Bash allow list.** With `autoAllowBashIfSandboxed` at its default `true`, sandboxed commands run without a prompt, and "auto-allow mode works independently of your permission mode setting" ([sandbox modes](https://code.claude.com/docs/en/sandboxing#sandbox-modes)). So a sandbox with auto-allow lets any shell command run, contained only by the sandbox. Set it to `false` to keep the Bash allow list in charge ([autoAllowBashIfSandboxed](https://code.claude.com/docs/en/settings-reference#sandbox-autoallowbashifsandboxed)).
- **Limits.** "Sandboxing reduces risk but is not a complete isolation boundary." Domain fronting can reach hosts off the allowlist, since the proxy doesn't inspect TLS by default ([security limitations](https://code.claude.com/docs/en/sandboxing#security-limitations)).

#### Settings sources, precedence, and managed settings

- **Precedence**, highest first: managed settings, command-line arguments (including `--settings`), local, project, user ([settings precedence](https://code.claude.com/docs/en/settings#settings-precedence)). `--settings` takes inline JSON or a file path ([change a setting for one session](https://code.claude.com/docs/en/settings#change-a-setting-for-one-session)).
- **Live reload.** Claude Code watches settings files and applies edits to `permissions` and `hooks` to the running session ([when edits take effect](https://code.claude.com/docs/en/settings#when-edits-take-effect)). That is why the protected paths matter.
- **`settingSources` / `--setting-sources`** choose `user`, `project`, and `local`. `[]` loads none. But "managed policy settings and the global `~/.claude.json` config are read regardless", and so are auto memory and claude.ai connectors ([what settingSources does not control](https://code.claude.com/docs/en/agent-sdk/claude-code-features#what-settingsources-does-not-control)). The docs warn not to rely on default options for isolation (same section).
- **Untrusted folders in `-p` and SDK runs.** Hooks and `env` from project settings still run; project `permissions.allow` rules are not used; `.mcp.json` servers connect "without asking" ([what runs before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)).
- **Local settings and worktrees.** The CLI reads `.claude/settings.local.json` from the repository root, which "in a worktree … uses the file at the main checkout's root". SDK sessions "load it from the working directory in all versions" ([additional directories](https://code.claude.com/docs/en/permissions#additional-directories-grant-file-access-not-configuration), [where Claude Code keeps the local file](https://code.claude.com/docs/en/settings#where-claude-code-keeps-the-local-file-in-a-git-repository)). This repo's main-checkout local file holds 198 allow rules, 12 naming git and 2 for `gh` (counted, not printed), so a `claude -p` agent in a worktree would inherit them unless `local` is excluded.
- **Managed settings** are machine-wide (file, MDM, or server) and can't be overridden by user files or `--settings` ([managed settings](https://code.claude.com/docs/en/managed-settings)). This machine has none (`/Library/Application Support/ClaudeCode/` is absent; no `com.anthropic.claudecode` defaults domain).
- **SDK `managedSettings`** lets the launching host supply "policy-tier settings" per session. Claude Code ignores them when an admin source exists, unless that source opts in ([SDK options](https://code.claude.com/docs/en/agent-sdk/typescript#options), [let an embedding host add policy](https://code.claude.com/docs/en/managed-settings#let-an-embedding-host-add-policy)). With no admin source here, this could give each agent a policy its own files can't loosen. Which keys it accepts without an admin source is not documented (see Unknowns).
- **Presets.** `--restricted` (v2.1.248+) removes the tools that run commands or code unless `--tools` names them, "ignores user, project and local settings files", confines file tools to the working directories, refuses `bypassPermissions`, and "lets only a person or the configured permission handler approve writes to settings, git and tool-configuration files" (`claude --help`, 2.1.280; [CLI reference](https://code.claude.com/docs/en/cli-reference)). `--bare` also skips hooks, plugins, and MCP discovery, but it "never reads OAuth credentials": it needs `ANTHROPIC_API_KEY`, which bills per token, so it's out ([bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode); billing is #345's topic).

### 2. What can be set per agent, by launch path

| Knob | Agent SDK `query()` | `claude -p` | Paseo 0.9.1 stock Claude provider |
|---|---|---|---|
| Built-in tool list | `tools` | `--tools` | not accepted |
| Allow rules | `allowedTools`, `settings.permissions.allow` | `--allowedTools`, `--settings` | `providerOptions.allowedTools`, `settings.permissions.allow` |
| Deny rules | `disallowedTools`, `settings.permissions.deny` | `--disallowedTools`, `--settings` | `providerOptions.disallowedTools`, `settings.permissions.deny`, provider-wide `disallowedTools` in `~/.paseo/config.json` |
| Permission mode | `permissionMode`, all six | `--permission-mode`, all six | `modeId`: plan, default, acceptEdits, auto, bypassPermissions (no `dontAsk`) |
| Prompt handling | `canUseTool`, `permissionPrompts: 'none'` | `--permission-prompt-tool`, `--permission-prompts none` | Paseo's own `canUseTool`; prompts wait for a person or a plugin |
| PreToolUse hook | callback in `hooks` (fails closed on timeout), or command hooks in `settings` | command or HTTP hooks in `--settings` JSON | only from settings files Claude loads (user, or the worktree's `.claude/settings*.json`); Paseo adds its own no-op observe hooks |
| Sandbox | `sandbox`, `settings.sandbox` | `--settings '{"sandbox":…}'` | `providerOptions.sandbox`, `settings.sandbox` |
| Setting sources | `settingSources` | `--setting-sources` | fixed at `user, project, local` |
| MCP servers | `mcpServers` + `strictMcpConfig` | `--mcp-config` + `--strict-mcp-config` | `mcpServers` adds servers but can't remove the user's; no strict option; Paseo injects its own `paseo` server |
| Environment | `env` | the process env | provider `env`; plugin `agent.create` and `agent.session_open` hooks |
| Policy tier | `managedSettings` | none | none |
| Hardened preset | `extraArgs` (for example `restricted`; untested) | `--restricted` | none, except by prefixing the binary's argv (below) |

Sources for the SDK and CLI columns: [SDK options](https://code.claude.com/docs/en/agent-sdk/typescript#options), [CLI reference](https://code.claude.com/docs/en/cli-reference), `claude --help` on 2.1.280.

How Paseo 0.9.1 launches Claude, from its source at tag `v0.9.1`:

- **It runs the user's own `claude` binary through the SDK.** This session's process (PID 77290, parent "Paseo Daemon") is `/Users/alecsibilia/.local/bin/claude … --permission-prompt-tool stdio --mcp-config {"mcpServers":{"paseo":…}} --setting-sources=user,project,local --permission-mode auto --allow-dangerously-skip-permissions --settings {"fastMode":false}`, with no `--strict-mcp-config` (from `ps`; the URL and bearer token were redacted, not printed). So guard behavior follows whatever Claude Code version the user has installed.
- **Fixed options** in `packages/server/src/server/agent/providers/claude/agent.ts`: `settingSources: ["user","project","local"]` (lines 145-149, used at 3291), `allowDangerouslySkipPermissions: true` always (3280, "so later setPermissionMode(\"bypassPermissions\") calls do not fail"), `canUseTool: this.handlePermissionRequest` (3282), and Paseo's own `hooks` (3307), which are observe-only callbacks that return `{}` (4774-4794).
- **Per-agent options** are the strict schema `ClaudeProviderOptionsSchema` in `providers/claude/options.ts:46-88`: `allowedTools`, `disallowedTools`, `additionalDirectories`, `sandbox` (including `filesystem.denyWrite` and `network.strictAllowlist`), and `settings` with only `permissions.{allow,ask,deny}` and `sandbox`. The docs say "Paseo-owned controls such as cwd, model, prompt, environment, session identity, MCP transport, callbacks, and hooks cannot be passed here" (`docs/providers.md:5-27`).
- **Modes.** The Claude provider's modes are plan, default, acceptEdits, auto, and bypassPermissions (`agent.ts:322-348`). Any other `modeId` throws "Invalid mode … for Claude provider" (`agent.ts:2141-2146`). So `dontAsk` is not reachable.
- **Prompts wait forever.** `handlePermissionRequest` publishes a pending request and waits for an answer or an abort, with no timeout (`agent.ts:4619-4700`). A plugin can answer it from an `agent.permission_requested` event ([plugin reference](https://paseo.sh/docs/plugins/reference)).
- **Ways to set options per agent.** The MCP `create_agent` tool and agent profiles only carry provider, model, `modeId`, thinking, and features (the tool's own schema in this session; [agent profiles](https://paseo.sh/docs/agent-profiles)). A plugin's `agent.create` before-hook can edit the "public agent config except `cwd`" plus `env`, which includes `providerOptions` and `mcpServers`; `agent.session_open` can edit only `env` ([plugin reference](https://paseo.sh/docs/plugins/reference); called at `packages/server/src/server/agent/agent-manager.ts:1221` and `5146`).
- **Custom providers** in `~/.paseo/config.json` can set `command`, `env`, `disallowedTools`, and a `paseoTools` policy per provider ID (`packages/protocol/src/provider-config.ts:51-64`; [custom providers](https://paseo.sh/docs/custom-providers)). A `command` array becomes a "replace" launch whose extra elements go before the SDK's own arguments (`provider-registry.ts:261-276`, `providers/claude/query.ts:32-55`). So a provider such as `"command": ["claude", "--strict-mcp-config"]` would add that flag. This is an untested hack, and which copy wins when a flag is passed twice is not documented.
- **A Paseo plugin can also register a whole provider** (`server.registerProvider()`, [plugin reference](https://paseo.sh/docs/plugins/reference)). A Luca provider that calls the SDK with its own options would keep Paseo's UI and get every knob in the SDK column. That belongs to #346.

### 3. MCP isolation

Every place an agent's MCP servers can come from, and what removes each one:

| Source | Where it lives | Loads under `settingSources: []`? | Removed by |
|---|---|---|---|
| User scope | `~/.claude.json` top-level `mcpServers` | yes ("always read") | `strictMcpConfig` / `--strict-mcp-config` |
| Local scope | `~/.claude.json` under `projects[<path>]` | yes, for that path | strict config |
| Project scope | `.mcp.json` in the repo; `-p` and SDK connect it "without asking" | no | strict config, dropping `project`, or `disabledMcpjsonServers` |
| Plugins | enabled plugins' `.mcp.json` or `plugin.json` | no (plugins are enabled in settings) | strict config, or dropping the sources that enable them |
| claude.ai connectors | fetched when signed in with claude.ai | yes; "passing `mcpServers: {}` does not suppress" them | strict config, `disableClaudeAiConnectors: true`, or `ENABLE_CLAUDEAI_MCP_SERVERS=false` |
| Subagent frontmatter | `mcpServers` in an agent definition | depends on source | strict config covers file-based agents, not `--agents` or SDK `agents` |
| Managed | `managed-mcp.json`, `managedMcpServers` | yes | admins only; `--strict-mcp-config` exits if `managed-mcp.json` exists |
| Launcher | SDK `mcpServers`, `--mcp-config`; Paseo's injected `paseo` server | yes | don't pass them; Paseo: `paseoTools.enabled: false` |

Sources: [MCP scopes](https://code.claude.com/docs/en/mcp#mcp-installation-scopes), [scope precedence](https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence), [project scope](https://code.claude.com/docs/en/mcp#project-scope), [plugin servers](https://code.claude.com/docs/en/mcp#plugin-provided-mcp-servers), [disable connectors](https://code.claude.com/docs/en/mcp#disable-claude-ai-connectors), [what settingSources does not control](https://code.claude.com/docs/en/agent-sdk/claude-code-features#what-settingsources-does-not-control), [scope MCP servers to a subagent](https://code.claude.com/docs/en/sub-agents#scope-mcp-servers-to-a-subagent), [managed MCP](https://code.claude.com/docs/en/managed-mcp). The SDK's `strictMcpConfig` is defined as: "Use only the servers passed in `mcpServers` and ignore project `.mcp.json`, user settings, plugin-provided MCP servers, and claude.ai connectors" ([SDK options](https://code.claude.com/docs/en/agent-sdk/typescript#options)).

What this machine has today (key names only, no values):

- `~/.claude.json` user scope: `aidesigner`, `comfyui`, `mobbin`, `muninn`, `openai-image`, `paper`. `muninn` is an `sse` server on a loopback URL with an `Authorization` header. The `~/Github/luca-framework` project also has a local-scope `muninn`.
- `~/.claude/settings.json` enables 12 of 14 listed plugins. Cached plugins ship MCP servers (figma, vercel, others) and hooks (warp, langsmith-tracing, superpowers, vercel).
- This session was launched by the Paseo daemon, and its tool list includes `mcp__muninn__*`, `mcp__paseo__*`, `mcp__comfyui__*`, `mcp__paper__*`, `mcp__mobbin__*`, `mcp__openai-image__*`, and several `mcp__claude_ai_*` connectors. That is the leak #340 worried about, observed live.

The Paseo `paseo` MCP server matters most:

- Paseo adds it to every agent with a per-agent bearer token (`packages/server/src/server/agent/runtime-mcp-config.ts:29-57`) unless `daemon.mcp.injectIntoAgents` is off or the provider's `paseoTools.enabled` is `false` (`agent-manager.ts:5087-5108`, `paseo-tool-policy.ts:27-29`). On this machine injection is on and no provider has a `paseoTools` policy.
- Its catalog includes `set_agent_mode` for any `agentId`, with no caller check (`packages/server/src/server/agent/tools/paseo-tools.ts:3074-3096`, `lifecycle-command.ts:206-215`), `respond_to_permission` for any pending request (`paseo-tools.ts:3133-3160`), and `create_agent`. An agent can switch itself to `bypassPermissions` (reachable because Paseo always passes `allowDangerouslySkipPermissions`), approve its own prompts, or start an unguarded child. Paseo's docs say the policy "is not a security boundary for an agent that can access the host through a shell" and that "custom profiles do not inherit this policy from `extends`" ([Paseo MCP reference](https://paseo.sh/docs/mcp)).

Recommended setup per launch:

1. SDK: `strictMcpConfig: true` with `mcpServers: {}`. CLI: `--strict-mcp-config` with no `--mcp-config`.
2. Belt and braces: `disallowedTools: ["mcp__*", "ListMcpResourcesTool", "ReadMcpResourceTool"]` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`. A bare-name glob deny removes the tools from context ([tool name wildcards](https://code.claude.com/docs/en/permissions#tool-name-wildcards)); the two resource tools read from connected servers ([tools reference](https://code.claude.com/docs/en/tools-reference)).
3. Under stock Paseo, where strict config isn't available: a custom provider ID with `"paseoTools": {"enabled": false}`, the deny list above set through an `agent.create` plugin hook, and `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the provider's `env`. User and plugin servers still connect in that setup; the model just can't call them.
4. Loopback: MuninnDB also answers on localhost, and its token sits in `~/.claude.json`, which sandboxed commands can read by default. Keep `allowLocalBinding` off, list no loopback hosts, and add `denyRead` for `~/.claude.json`, `~/.claude`, and `~/.paseo` (or turn on [`blockReadsOutsideWorkingDirectories`](https://code.claude.com/docs/en/settings-reference#permissions-blockreadsoutsideworkingdirectories)).
5. Auto memory is another memory channel that ignores `settingSources`: `~/.claude/projects/<project>/memory/` is loaded into the system prompt. Set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` ([what settingSources does not control](https://code.claude.com/docs/en/agent-sdk/claude-code-features#what-settingsources-does-not-control)).

### 4. Can an agent get around each guard?

| Attempt | Stopped by rules or hooks? | Does the OS sandbox close it? | What's left |
|---|---|---|---|
| Edit a forbidden file with `sed -i`, `>`, or `tee` | Yes: those targets are checked against Edit rules | Yes, for the implementer's test files via `denyWrite` globs (macOS only) | Linux ignores write globs |
| Edit it with `python -c`, `bun -e`, `node -e`, `perl`, `cp`, `mv`, `git checkout -- f`, `patch` | Not by Edit rules. In `dontAsk` they're denied unless the Bash allow list matches, and only while auto-allow is off | Implementer: yes (globs, macOS). Test-writer: no, the worktree stays writable | The backstop |
| Run code through the allowed test command (tests or code that write files, run git, open sockets) | No: `bun test` is allowed and runs whatever the repo holds | Partly: blocks network, writes outside the worktree, and `.git` if denied | Test-writer writes to non-test files; the backstop |
| `git commit`, `branch`, `tag`, `stash`, `reset` written plainly | Deny rules, if listed | No by default: the worktree exception allows `.git` writes | Add `denyWrite` on the main repo's `.git` |
| The same via `git -C .`, `sh -c`, a script, an alias, or `xargs git` | Not by rules; a hook that parses shell catches some, not scripts | Yes, once `.git` is in `denyWrite` | The backstop checks refs and the index |
| `git push`, `gh pr create`, `gh api -X POST` | Deny rules catch plain forms only | Yes: no network (unless `gh` is put in `excludedCommands`) | `WebFetch` is an in-process GET; deny it anyway |
| Start a subagent | `Agent` needs no approval in `dontAsk` | Subagents share the sandbox | Subagents keep deny rules and hooks, but an agent definition's `permissionMode` (not bypass) applies when the parent is in `default`, `dontAsk`, or `plan`. Deny `Agent` |
| Edit settings or hook files to switch guards off | Protected paths: never auto-approved, denied in `dontAsk` | Yes: settings, hooks, skills, agents, `.mcp.json`, `~/.claude` | Guards passed inline (SDK options, `--settings` JSON) have no file to edit; a `ConfigChange` hook can block reloads |
| Invoke a skill whose `allowed-tools` pre-approves `Bash(git *)` | The grant lasts until the next prompt, often the rest of the agent's run; deny rules and hooks still win | n/a | Deny `Skill`, pass `skills: []`, or `--disable-slash-commands` |
| Call an MCP tool that writes (MuninnDB, Paseo, Vercel, Gmail…) | Only if MCP tools are denied or not loaded | No: MCP servers run outside the sandbox | Strict MCP config |
| Use the Paseo CLI or daemon over loopback | Paseo tools off; CLI not in the allow list | Yes, unless `allowLocalBinding` is on (macOS) | Tests that need to bind ports conflict with this |
| Read secrets (MuninnDB token, `gh` token, SSH keys) | Read tool outside the working dirs is denied in `dontAsk` | Not by default: sandboxed reads are allowed everywhere | `denyRead` or `blockReadsOutsideWorkingDirectories` |
| Retry outside the sandbox (`dangerouslyDisableSandbox`) | Needs approval, so denied in `dontAsk` | n/a | Set `allowUnsandboxedCommands: false` |
| Leave a background process running past the turn | `Bash(run_in_background:true)` deny rule; deny `Monitor` | n/a | Engine kills the process group after the turn |
| Make the hook crash or time out | Command hooks fail open | n/a | Use an SDK callback (fails closed) and keep rules as the first layer |
| Edit outside the worktree with Edit or Write | Outside the working dirs is denied in `dontAsk`; symlinked denies apply to either end | Bash writes outside the worktree are blocked | Don't pass `--add-dir` |

Sources for the rows: [what a Bash rule doesn't match](https://code.claude.com/docs/en/permissions#bash-rule-limits), [Read and Edit](https://code.claude.com/docs/en/permissions#read-and-edit), [sandbox filesystem isolation](https://code.claude.com/docs/en/sandboxing#filesystem-isolation), [sandbox protected paths](https://code.claude.com/docs/en/sandboxing#protected-paths), [sub-agent tools](https://code.claude.com/docs/en/sub-agents#available-tools), [sub-agent permission modes](https://code.claude.com/docs/en/sub-agents#permission-modes), [skills `allowed-tools`](https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill), [match by input parameter](https://code.claude.com/docs/en/permissions#match-by-input-parameter), and the Paseo source cited in §3.

Two more facts:

- **Claude Code's own worktree isolation is separate.** When a session is isolated in a worktree (`--worktree`, `EnterWorktree`, or an `isolation: worktree` subagent), Claude Code blocks edits into the main checkout, git redirects into it (`-C`, `--git-dir`, `GIT_DIR`), and any command whose git use it can't verify from the text. "You can't turn this check off" ([how Claude Code enforces isolation](https://code.claude.com/docs/en/worktrees#how-claude-code-enforces-isolation)). This research session runs under it: it refused a `python3 -c` script that only contained the string `git`, a `for` loop around `git show`, and a `sed` whose program came from `$HOME`. It keeps writes out of the main checkout; it doesn't stop `git commit` inside the worktree. The docs tie it to sessions Claude Code isolated itself, so a Paseo-made worktree probably doesn't get it (unverified).
- **Plugins and skills leak in through the main checkout.** Worktree sessions load project-scope plugins and untracked skills, agents, and commands from the main checkout ([what worktrees share](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout)).

### 5. Prior art: old Luca's stage-gate hook

What it was (tag `old-luca-final`): one global PreToolUse command hook, `luca hook stage-gate`, registered in `~/.claude/settings.json` (`packages/luca/CHANGELOG.md:540`). It read `.luca/state.json`, mapped the step to a coarse phase, classified each call, and looked up a phase-by-category matrix (`packages/luca-core/src/state/configs/stage-tool-matrix.ts`). It blocked with exit 2 (`packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`).

What worked:

- **Exit 2 is a hard block** that no allow rule overrides, and the model sees the reason.
- **A security floor that runs in every phase**, before the permissive idle shortcut: `.git/` anywhere, `~/.claude/`, `~/.luca/`, system dirs (`handle-stage-gate-hook.ts:182-197`, `classify-write-path.ts:59-61`). An earlier version ran it after the shortcut and let a forged mailbox write through (comment at `handle-stage-gate-hook.ts:168-181`).
- **Conservative defaults in the Bash classifier**: unknown commands, unknown git and gh subcommands, and unparseable input all count as "mutate" (`classify-bash-command.ts:569`, `591`, `734`, `868`). `eval`, `source`, `.`, and pipe-to-shell are always denied (`:198`, `:818-850`).
- **Binary-independent path scanning** for the handoff mailbox: any token mentioning the path counts, whatever program carries it (`classify-bash-command.ts:764-798`). It was added after `tee` and `Bun.write` one-liners slipped past the per-program extractors (comment at the same lines).
- **Regression tests for each bypass**, such as the `-v` flag that let `luca doctor --fix -v` pass as read-only (`CHANGELOG.md:624`).

What leaked or hurt:

- **It failed open.** Empty or unparseable input, a write tool without a path, and any unclassified call were allowed (`handle-stage-gate-hook.ts:77`, `89`, `219`, `325`). The companion pipeline-guard says so outright: "Failure-open philosophy: if ANYTHING unexpected happens … we exit 0" (`packages/luca-tools/src/hooks/pipeline-guard/handler.ts:41`).
- **Only Edit, Write, NotebookEdit, and Bash were gated.** Every other tool, MCP tools and `Task`/`Agent` included, was allowed (`handle-stage-gate-hook.ts:302-308`).
- **Git classification read only the first word after `git`** (`classify-bash-command.ts:526`). `git -C . commit` fell to "unknown → mutate", which the EXECUTING phase allowed (`stage-tool-matrix.ts:91-92`). So did `sh -c 'git commit'`, `env git commit`, and `/usr/bin/git commit`. `git branch` and `git config` were treated as read-only (`:90`, `:94`), though `git branch x` and `git config k v` write. Unknown `gh` forms such as `gh api -X POST` also passed in EXECUTING.
- **No worktree boundary.** Any path not denied was ordinary "code", so edits outside the repo passed in EXECUTING. Paths weren't normalized for `..` or symlinks (`classify-write-path.ts:320-321`).
- **The guard read state the agent could reach.** Phase came from `.luca/state.json` in the repo, and `luca state advance` counted as `luca-write`, which the matrix allowed in every non-idle phase (`stage-tool-matrix.ts`). Only the separate pipeline-guard hook checked that the jump was legal (`pipeline-guard/handler.ts`).
- **It over-blocked, over and over, and stalled live runs**: `cd`, `sed -n`, `sort`, `open`, absolute paths, and hooks fired from subdirectories were all misread as writes (`CHANGELOG.md:305-313`, `349-366`). MuninnDB records that verification probes like `bun test` and `git diff` were blocked in review steps and silently skipped (`process:stage-gate-blocks-bash-mutate-in-coarse-phases`, vault `default`, `01KWZ9NFW08GRANEK1PFBZWTY4`).
- **A global hook fired in every session on the machine**, so it needed session-owner stamping to leave other terminals alone (`CHANGELOG.md:314-347`). The stocktake counts about 66% of ledger rows as hook noise (`docs/research/luca-on-pi/stocktake.md:63`).
- **The reason it existed still stands**: subagents "commit, push, and open a pull request even when the orchestrating prompt says DO NOT COMMIT in capitals" (`pitfall:subagents-take-outward-facing-actions-without-authorization`, vault `default`, `01M0AEYCZ8N9M8N4EN6916EJ4Q`).

What to copy:

- The hard floor that runs first, before anything role-specific.
- Deny on unknown or unparseable input (fail closed), and gate every tool, not just four.
- The binary-independent scan for forbidden paths in any command's text.
- The table of known git and gh subcommands, fixed to skip global options (`-C`, `-c`, `--git-dir`, `--work-tree`) and wrappers before reading the subcommand, and with `branch`, `config`, `remote`, `worktree`, `update-ref`, `notes`, and `symbolic-ref` counted as writes unless clearly read-only.
- A regression test per known bypass.

What not to copy:

- A global hook reading state from the repo. Give each agent its guard at launch, from the engine, per role.
- A phase-by-category matrix. Roles are simpler: one allow set per role.
- Treating the hook as the only guard. It sits on top of `dontAsk`, the tool list, and the sandbox, with the backstop after.

## What this means for the engine

**Launch path.** The guards the engine needs are all available from the Agent SDK and `claude -p`, and not from Paseo's stock Claude provider. That favors the engine starting sessions itself (SDK, or a Paseo provider plugin that wraps the SDK), which is #346's call. If agents must run through stock Paseo, the engine loses `dontAsk`, strict MCP, clean setting sources, and hook callbacks. It must then (a) use a custom provider ID with `paseoTools.enabled: false`, (b) set tools, rules, and sandbox through an `agent.create` plugin hook, (c) auto-deny every permission request from a plugin, and (d) accept that the user's hooks, plugins, and MCP servers still load. Billing doesn't separate the two paths: Paseo also runs Claude through the SDK, and #345's draft finds SDK and `claude -p` sessions on the plan login draw from the plan today, with a paused Anthropic change that could later move headless use to a separate credit.

**Guard setup for every role** (SDK names; `claude -p` flags are the same ideas):

- `permissionMode: "dontAsk"` and `permissionPrompts: "none"`.
- `tools`: only the role's built-in tools. `disallowedTools`: `Agent`, `Workflow`, `Skill`, `WebFetch`, `WebSearch`, `Monitor`, `PowerShell`, `NotebookEdit`, `SendMessage`, `Artifact`, `RemoteTrigger`, `CronCreate`, `PushNotification`, `SendUserFile`, `EnterWorktree`, `ExitWorktree`, `mcp__*`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, and `Bash(run_in_background:true)`.
- `settingSources: []`, `strictMcpConfig: true`, `mcpServers: {}`, `skills: []`. The engine passes the repo's `CLAUDE.md` text in the prompt instead of loading the project source. (Loading `project` would also run the target repo's own hooks and `.mcp.json`.)
- `env`: the normal env plus `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (a key silently wins over the plan login in `-p`; see #345).
- `sandbox`: `enabled: true`, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, `autoAllowBashIfSandboxed: false`, no `excludedCommands`, `network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false }`, `filesystem: { denyWrite: [<main repo>/.git], denyRead: ["~/.claude.json", "~/.claude", "~/.paseo", "~/.ssh", "~/.config/gh"] }`. Add `<worktree>/node_modules` to `denyWrite` if the test runner doesn't write caches there; otherwise leave it to the backstop.
- `hooks.PreToolUse`: one engine callback, matching every tool. It resolves real paths, checks them against the worktree and the role, parses Bash with the fixed classifier, journals every decision, and returns `deny` on anything unknown. It wraps its own errors so it never throws.
- `hooks.ConfigChange`: block every change. This matters only if some settings source is loaded, as on the Paseo path.
- Optional: a `PostToolUse` callback after each Bash call that runs the cheap backstop checks below and returns `continue: false` on a violation, so the turn stops at the first bad write instead of at its end ([JSON output](https://code.claude.com/docs/en/hooks#json-output)).

**Per role:**

| Role | Tools | Allow rules | Extra deny rules | Extra sandbox | Hook check |
|---|---|---|---|---|---|
| test-writer | Read, Grep, Glob, Edit, Write, Bash | `Edit(<test glob>)` for each engine-config glob; `Bash(<test command>)` and `Bash(<test command> *)` | none | none possible for "tests only" | every file path is inside the worktree and matches a test glob; Bash is read-only or the test command |
| implementer | Read, Grep, Glob, Edit, Write, Bash | `Edit(**)`; the test command | `Edit(<test glob>)` | `denyWrite` for each test glob (macOS) | every file path is inside the worktree and matches no test glob |
| reviewers, learner | Read, Grep, Glob, plus Bash if they may run tests | the test command only | `Edit`, `Write` | `denyWrite: ["."]`, so even the test run can't write the worktree | no file writes at all |

**Backstop after every agent turn** (plain code, outside the sandbox):

1. Before launch, record: `HEAD`, `git for-each-ref` (branches, tags, `refs/stash`, notes), `git worktree list --porcelain`, `git diff --cached --name-only` (should be empty), a hash of `<common .git>/config` and `hooks/`, and `git status --porcelain` in the main checkout.
2. After the turn, fail if any of those changed. Agents never move refs, stage, stash, or touch the main checkout.
3. Run `git status --porcelain=v1 -z --untracked-files=all` in the worktree and check each path, deletes and renames included: test-writer, only test globs; implementer, no test globs; reviewer and learner, nothing.
4. Also check ignored files that matter: nothing new under `node_modules/`, and no changes to test infrastructure (setup and preload files, `bunfig.toml`, test config). The default glob `**/*.test.ts` doesn't cover those, so the engine config needs a second glob list for test infrastructure.
5. On a violation, revert the paths and refs, journal the event with the tool calls that caused it, and count it as a failed round in the fix loop (#336). The leftover scan (#337) runs after this and handles stray files the role was allowed to write.

**Tickets this feeds:**

- **#334 "Tracer bullet"**: prove the SDK launch with `dontAsk`, strict MCP, the sandbox with a denied `.git`, and one PreToolUse callback, and run the experiments below in it.
- **"Exact guard rules for each role"** (not yet specified): the two tables above are the input. Open choices: the test-infrastructure glob list, and whether reviewers may run tests.
- **#346** (how the engine drives agents): the stock Paseo provider can't carry these guards; an SDK launch or a Paseo provider plugin can. #346's section on keeping the user's MCP servers and skills out overlaps §3 here.
- **#345** (billing): `--bare` needs an API key, so it's out. Relocating `CLAUDE_CONFIG_DIR` for a clean config home may lose the subscription login; untested.
- **#340's added scope** (no global MuninnDB connection in agents): answered in §3. Strict MCP plus a loopback-closed sandbox keeps MuninnDB out.
- **#336 and #337**: the backstop is shared plumbing with the red check and the leftover scan.

**For the user to decide:**

1. Launch agents outside Paseo's stock Claude provider (SDK or a provider plugin), or accept weaker guards inside it.
2. Turn off Paseo's tool injection for engine agents (a custom provider with `paseoTools.enabled: false`). Your own sessions can keep it.
3. Whether reviewers may run the test command.
4. Whether tests that need to bind localhost ports are allowed. On macOS that reopens loopback, so MuninnDB would need a different guard.

## Unknowns and experiments to run later

None of these were run, because they need a model session. Each one fits the tracer bullet (#334).

1. **Worktree `.git` deny.** With `denyWrite: [<main>/.git]` in a Paseo-style worktree, check that `git commit`, `git stash`, `git branch x`, and `git checkout <ref>` fail, and that `git status` and `git diff` still work. Also check that Edit to the worktree's `.git` file is denied.
2. **Auto-allow in `dontAsk`.** With the sandbox on and `autoAllowBashIfSandboxed: true`, does `dontAsk` still deny `python3 -c '…'`? The docs imply it runs; confirm, then confirm `false` restores the allow list.
3. **Test globs and read-only reviewers.** On macOS, check that `denyWrite: ["**/*.test.ts"]` blocks a new and an existing test file from `bun -e` and from code run by `bun test`, that `Edit(**)` plus a deny of the test glob behaves as the tables above assume, and that a reviewer's `denyWrite: ["."]` still lets `bun test` run.
4. **Loopback.** From a sandboxed command, try MuninnDB's port and Paseo's `127.0.0.1:6767`, with `allowLocalBinding` off and on.
5. **Strict MCP under Paseo.** Does a custom provider with `"command": ["claude", "--strict-mcp-config"]` start cleanly, keep the `paseo` server only when wanted, and drop `muninn` and the connectors?
6. **SDK `managedSettings` with no admin source.** Which keys apply (deny rules, sandbox, `allowManaged*Only`, `allowedMcpServers: []`)? If most do, it's a policy layer the agent's own files can't loosen.
7. **SDK callback errors.** A PreToolUse callback that throws: does the call run or not? (Timeouts are documented to block; throws aren't documented.)
8. **Hook `allow` on protected paths.** Can a hook's `allow`, or `canUseTool`, approve an implementer's edit to `bunfig.toml` or `.husky/*` when a ticket needs it? In `dontAsk` those are denied.
9. **Empty setting sources on the CLI.** Is `--setting-sources ""` accepted? The SDK documents `[]`; the CLI form is untested.
10. **Paseo worktrees and Claude Code's worktree isolation.** Do the `-C`/`GIT_DIR` redirect checks apply to a session whose cwd is a worktree Paseo created? The docs suggest not.
11. **Codex reviewers.** This doc covers Claude Code only. Paseo's Codex options (`sandbox_mode`, `approval_policy`, `sandbox_workspace_write.network_access`, per `docs/providers.md:15-21` at `v0.9.1`) are the equivalent layer for a GPT reviewer and need their own check once Codex is installed.

## Sources

Claude Code docs (all fetched 2026-09-22; index at https://code.claude.com/docs/llms.txt):

- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/managed-mcp
- https://code.claude.com/docs/en/managed-settings
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/tools-reference
- https://code.claude.com/docs/en/claude-apps-gateway (restrict parent settings)
- https://code.claude.com/docs/en/agent-sdk/permissions
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://code.claude.com/docs/en/agent-sdk/typescript (Options, SandboxSettings)
- https://code.claude.com/docs/en/agent-sdk/claude-code-features
- `claude --help` and `claude --version` (2.1.280)

Sandbox runtime:

- https://github.com/anthropic-experimental/sandbox-runtime at `ddbeb74711c4097014ef3056791efa83f553116c` (v0.0.77, 2026-09-21): `README.md`, `src/sandbox/macos-sandbox-utils.ts`. Claude Code bundles its own copy; the version inside 2.1.280 was not checked.

Paseo (app 0.9.1; source `getpaseo/paseo` at tag `v0.9.1`):

- `packages/server/src/server/agent/providers/claude/agent.ts` (lines 145-149, 322-348, 2141-2146, 3276-3313, 4619-4700, 4774-4794)
- `packages/server/src/server/agent/providers/claude/options.ts:46-88`
- `packages/server/src/server/agent/providers/claude/query.ts:32-55`
- `packages/server/src/server/agent/provider-registry.ts:261-276`
- `packages/protocol/src/provider-config.ts:25-64`
- `packages/server/src/server/agent/runtime-mcp-config.ts:29-57`
- `packages/server/src/server/agent/agent-manager.ts:1221-1227, 5087-5108, 5146`
- `packages/server/src/server/agent/paseo-tool-policy.ts:27-29`
- `packages/server/src/server/agent/tools/paseo-tools.ts:3074-3096, 3133-3160`
- `packages/server/src/server/agent/lifecycle-command.ts:206-215`
- `docs/providers.md`, `public-docs/mcp.md`
- https://paseo.sh/docs/plugins/reference, https://paseo.sh/docs/agent-profiles, https://paseo.sh/docs/custom-providers, https://paseo.sh/docs/mcp
- The `create_agent`, `set_agent_mode`, and `respond_to_permission` tool schemas as exposed to this session

Local machine (read only; key names, counts, and booleans only):

- `ps` for the Paseo-launched `claude` processes, including this session's PID 77290
- `~/.claude.json` (MCP server names), `~/.claude/settings.json` (keys, plugin names), `~/.claude/plugins/cache/**/.mcp.json` and `hooks/hooks.json` (file list), `~/.paseo/config.json` (keys), `/Users/alecsibilia/Github/luca-framework/.claude/settings.local.json` (rule counts)

Old Luca (tag `old-luca-final` in this repo):

- `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`
- `packages/luca-cli/src/hook/helpers/classify-bash-command.ts`
- `packages/luca-core/src/state/configs/stage-tool-matrix.ts`
- `packages/luca-core/src/luca-dir/helpers/classify-write-path.ts`
- `packages/luca-tools/src/hooks/pipeline-guard/handler.ts`
- `packages/luca/CHANGELOG.md`
- `docs/research/luca-on-pi/stocktake.md` (on `main`)
- MuninnDB, vault `default`: `process:stage-gate-blocks-bash-mutate-in-coarse-phases` (`01KWZ9NFW08GRANEK1PFBZWTY4`), `pitfall:subagents-take-outward-facing-actions-without-authorization` (`01M0AEYCZ8N9M8N4EN6916EJ4Q`)
