# Rename `cc-openai-bridge` → `luca-code` + add `luca code` command

## Context

`packages/cc-openai-bridge/` is a brand-new, **git-untracked** Bun package that
proxies Claude Code onto a ChatGPT subscription (OpenAI Responses API). It
currently exposes a standalone `cc-openai-bridge` bin with a `claude`
subcommand that starts a loopback gateway and launches `claude` against it.

The user wants to:
1. Rename the package directory to `packages/luca-code` (full internal rename).
2. Expose a `luca code` CLI subcommand that launches Claude Code under one of
   three model providers selected by a flag:
   - `luca code --openai`  → the current `cc-openai-bridge claude` flow (gateway + launch)
   - `luca code --ollama`  → `ollama launch claude --model glm-5.2:cloud`
   - `luca code` / `luca code --claude` → plain `claude`

**Rename depth (user-confirmed): full internal rename**, but **PRESERVE the
load-bearing OpenAI-facing fingerprint values**: the `cc-openai-bridge/<version>`
User-Agent (`DEFAULT_UA`) and the `cc-openai-bridge` `originator` default. These
are fingerprinted by Cloudflare per the README's "Known risks"; renaming them
risks breaking OpenAI auth. Everything else (package name, bin, env prefix,
profile dir, credential filename, public model-id prefix, tests, README) is
renamed.

## Approach

### 1. Move the directory

`mv packages/cc-openai-bridge packages/luca-code` (untracked, so plain `mv`;
no `git mv` history to preserve).

### 2. Package identity — `packages/luca-code/package.json` + `bunfig.toml`

- `name`: `@alecsibilia/cc-openai-bridge` → `@alecsibilia/luca-code`
- `bin`: `cc-openai-bridge` → `luca-code` (points at `./src/cli.ts`)
- `scripts.build` outfile: `dist/cc-openai-bridge.js` → `dist/luca-code.js`
- `scripts.compile` outfile: `dist/cc-openai-bridge` → `dist/luca-code`
- `description`/`keywords`: swap "cc-openai-bridge" wording for "luca-code"
  (keep the OpenAI/ChatGPT/anthropic/responses-api keywords).
- `bunfig.toml`: update the header comment.

### 3. Internal renames in `src/`

**`src/config.ts`** (load-bearing file — handle by hand, NOT blanket sed):
- `defaultProfileDir()` leaf: `cc-openai-bridge` → `luca-code`
  (`~/.config/luca-code`)
- env-var names in `envToRawConfig`: `CCOB_*` → `LUCA_CODE_*` (all 8 knobs:
  PROFILE_DIR, DEFAULT_EFFORT, MAX_CONCURRENT_SUBSCRIPTION, MAX_BODY_BYTES,
  REQUEST_TIMEOUT_SEC, REQUEST_TIMEOUT_MS, ORIGINATOR, USE_CODEX_UA)
- **KEEP** `DEFAULT_UA = cc-openai-bridge/${CLIENT_VERSION}` and `originator`
  default `"cc-openai-bridge"` (load-bearing OpenAI fingerprint). Add a comment
  explaining these are intentionally preserved despite the package rename.
- Update the module header comment "cc-openai-bridge — runtime configuration"
  → "luca-code — runtime configuration".

**`src/cli.ts`**:
- `PUBLIC_ID_PREFIX = "claude-ccob-"` → `"claude-luca-code-"`
- `printHelp`: `cc-openai-bridge v${VERSION}` → `luca-code v...`;
  `cc-openai-bridge <command>` → `luca-code <command>`; `CCOB_*` env note →
  `LUCA_CODE_*`.
- error messages: "run `cc-openai-bridge login` first" → "run `luca-code
  login` first"; `cc-openai-bridge: unknown command` → `luca-code: ...`.
- `cmdStatus` "Provider: openai" stays. Header comment updated.

**`src/launcher/profile.ts`**: `PROFILE_LEAF = join("cc-openai-bridge",
"profile")` → `join("luca-code", "profile")`. Update header comment.

**`src/auth/credentials.ts`**: `CREDENTIAL_FILENAME = "cc-openai-bridge-cred.json"`
→ `"luca-code-cred.json"`. Update the JSDoc naming the file.

**`src/provider/openai.ts`** and **`src/gateway/server.ts`**: rename `CCOB_*`
env reads → `LUCA_CODE_*`. Update header comments.

**Comment-only touches** in: `src/effort.ts`, `src/auth/jwt.ts`,
`src/provider/models.ts`, `src/index.ts`, `src/constants.ts`,
`src/protocol/types.ts`, `src/protocol/to-responses.ts`,
`src/launcher/claude.ts`, `src/gateway/stream.ts`, `src/gateway/handlers.ts` —
replace `cc-openai-bridge` mentions in comments/prose with `luca-code`. **Do
not touch `CLIENT_VERSION`, `CODEX_CLI_RS_UA`, or the `cc-openai-bridge` inside
`DEFAULT_UA`.**

### 4. Expose the OpenAI launch flow from `@alecsibilia/luca-code`

`src/index.ts` currently only re-exports `VERSION`. Add re-exports so `luca-cli`
can drive the bridge programmatically without shelling out:
- export `main` (existing CLI entry; `main(["claude", ...args])` runs the full
  gateway + launch flow) and the `createDeps` factory.
- keep `VERSION`.

`luca code --openai [args...]` will call `main(["claude", ...rest])` — reuses
the entire existing `cmdClaude` path (credential check, model fetch, gateway,
profile, launch, teardown) verbatim, zero new logic.

### 5. Wire `@alecsibilia/luca-code` into the workspace

- `packages/luca-cli/package.json` `dependencies`: add
  `"@alecsibilia/luca-code": "workspace:*"`.
- `packages/luca/package.json` `devDependencies`: add
  `"@alecsibilia/luca-code": "workspace:*"`. The umbrella
  `build.config.ts` uses `inlineDependencies: true`, so the new sibling is
  inlined into `dist/index.mjs` automatically (it is not in `externals`, which
  lists only npm runtime deps). No `build.config.ts` change needed.

### 6. New `luca code` command — `packages/luca-cli/src/commands/code.ts`

Follow the `citty` `defineCommand` pattern used by `commands/runner.ts` /
`commands/version.ts`. Provider selection parses `rawArgs` manually (we want
to forward arbitrary args to the underlying binary, so `rawArgs` + a small
hand-rolled parser is the right shape — matches how `runner.ts` uses
`rawArgs`).

Behavior:
- `consumeProviderFlag(rawArgs)` scans for the first of `--openai` /
  `--ollama` / `--claude`, removes that one token, returns `{ provider, rest }`.
  No flag → `provider = "claude"`. Unknown flags are forwarded untouched.
- `claude` (default): resolve `claude` via `Bun.which`, spawn with inherited
  stdio and `rest` forwarded; map `130`→`0` and `null`→`1` (local mapper, same
  semantics as `launcher/claude.ts` `mapExitCode`). Exit `127` when `claude`
  not on PATH.
- `ollama`: spawn `ollama launch claude --model glm-5.2:cloud` with `rest`
  appended, inherited stdio. (Fixed model per the user's spec; forwarded args
  follow it.) Exit `127` when `ollama` absent.
- `openai`: `import { main as runLucaCode } from '@alecsibilia/luca-code'` and
  `await runLucaCode(['claude', ...rest])`. The bridge's own stderr surfaces
  errors; the command propagates the returned exit code.
- `process.exit(code)` at the end (same pattern as `runner.ts`).
- `meta.description`: "Launch Claude Code under a chosen model provider
  (--openai / --ollama / --claude)."

Register in `packages/luca-cli/src/cli.ts` `CLI_SUBCOMMANDS`:
```ts
code: () => import('./commands/code').then((m) => m.codeCommand),
```

### 7. Update tests under `packages/luca-code/test/`

- `CCOB_*` env-var names → `LUCA_CODE_*` (config.test.ts,
  provider-openai.test.ts, cli.test.ts, gateway-server.test.ts).
- `claude-ccob-` model-id assertions → `claude-luca-code-` (cli.test.ts,
  provider-openai.test.ts, launcher-claude.test.ts, gateway-handlers.test.ts,
  launcher-profile.test.ts — wherever they assert against `PUBLIC_ID_PREFIX`).
- `cc-openai-bridge-cred` → `luca-code-cred` (auth-credentials.test.ts).
- Help/command-name assertions `cc-openai-bridge` → `luca-code` (cli.test.ts).
- **KEEP** any assertion that `DEFAULT_UA === "cc-openai-bridge/" +
  CLIENT_VERSION` or `originator === "cc-openai-bridge"` (UA/originator are
  preserved).
- Arbitrary fixture paths like `/tmp/ccob-fake-profile` are cosmetic; rename
  to `/tmp/luca-code-fake-profile` for consistency where present.

Run `bun test` in the package after edits to catch anything missed.

### 8. Update `packages/luca-code/README.md`

- Title/intro: `cc-openai-bridge` → `luca-code` (package/bin name).
- Commands section: `cc-openai-bridge <command>` → `luca-code <command>`.
- Config-knobs table: env column `CCOB_*` → `LUCA_CODE_*`; profile-dir default
  `~/.config/cc-openai-bridge` → `~/.config/luca-code`; `originator` default
  stays `cc-openai-bridge` (note it's preserved load-bearing).
- Credentials section: filename `cc-openai-bridge-cred.json` →
  `luca-code-cred.json`; location `~/.config/luca-code/`.
- UA prose: keep `DEFAULT_UA = cc-openai-bridge/<version>` verbatim and add a
  one-line note that the UA/originator values are intentionally kept as
  `cc-openai-bridge` for OpenAI fingerprint compatibility.
- Add a short "## `luca code` integration" section noting `luca code
  --openai/--ollama/--claude` drives this package and that `--openai` requires
  `luca-code login` first.
- Diagram/flow text: rename the `cc-openai-bridge claude` label to
  `luca-code claude` (cosmetic).

### 9. Install + verify

- `bun install` at repo root to refresh `bun.lock` for the new package name +
  new workspace dep.
- `cd packages/luca-code && bunx --bun tsc --noEmit && bun test` (expect 364
  tests green, typecheck clean).
- `bunx --bun tsc --noEmit` at repo root (the repo-wide gate) — ensure the new
  `luca-cli` → `luca-code` import typechecks and the `code` command registers.

## Critical files

- `packages/cc-openai-bridge/` → `packages/luca-code/` (whole tree moves)
- `packages/luca-code/package.json`, `packages/luca-code/bunfig.toml`
- `packages/luca-code/src/config.ts`, `src/cli.ts`, `src/launcher/profile.ts`,
  `src/auth/credentials.ts`, `src/index.ts` (+ comment touches in ~10 others)
- `packages/luca-code/README.md`
- `packages/luca-code/test/*.test.ts`
- `packages/luca-cli/src/commands/code.ts` (new)
- `packages/luca-cli/src/cli.ts` (register subcommand)
- `packages/luca-cli/package.json`, `packages/luca/package.json` (workspace dep)

## Verification (end-to-end)

1. `cd packages/luca-code && bunx --bun tsc --noEmit` — clean.
2. `cd packages/luca-code && bun test` — 364 pass / 0 fail (after fixture
   updates).
3. `bunx --bun tsc --noEmit` at repo root — clean (proves the `luca-cli` →
   `luca-code` import and the new `code` command typecheck against the
   umbrella).
4. `luca code --help` (via `bun packages/luca/bin/luca.js code --help`) —
   prints usage naming the three providers.
5. `luca code` with no `claude` binary on PATH → exit `127` (proves the
   `--claude` default path resolves and spawns `claude`).
6. `luca code --openai` with no credential → exits non-zero with "run
   `luca-code login` first" (proves the `--openai` path delegates into the
   bridge's `main(["claude"])`).
7. `luca-code --help` (the standalone bin) — prints `luca-code v0.1.0` and the
   renamed command list (proves the rename took on the bin itself).
8. `luca code --ollama` → attempts `ollama launch claude --model
   glm-5.2:cloud` (the spawned argv is the contract; if `ollama` is absent it
   exits `127`, but the resolved argv must be exactly that).

Manual (not in CI; needs real credentials + binaries): `luca-code login`,
then `luca code --openai` launches Claude Code through the gateway; `luca code
--ollama` launches via `ollama`.