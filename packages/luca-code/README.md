# luca-code

A local Bun/TypeScript proxy that runs **Claude Code on a ChatGPT subscription**
(OpenAI Responses API, GPT-5.x) — without installing macaz-cli and without Codex
support. It is also the engine behind the `luca code --openai` command.

`luca-code` speaks the Anthropic Messages API on the front (what Claude
Code expects) and the OpenAI Responses API on the back (what a ChatGPT
subscription exposes). It runs entirely on `127.0.0.1`, stores one OAuth
credential at `0600`, and launches `claude` pointed at its own loopback gateway.

- Runtime: **Bun** (no `node:http`, `express`, or `dotenv`).
- Runtime deps: **`zod`** only. Everything else is a Bun built-in (`Bun.serve`,
  `Bun.spawn`, `Bun.which`, `Bun.file`, `fetch`, global `crypto` / Web Crypto).
- Style: schema-first (Zod owns every default), functional (closures/factories,
  no classes), kebab-case files, extensionless relative imports.

## What it is

A single-binary bridge that lets a ChatGPT (Plus/Pro/Team) subscription power
Claude Code. It is **not** an official OpenAI or Anthropic product. It ports the
device-flow, endpoint dialect, and gateway architecture of the upstream macaz
client to a small, self-contained Bun package.

> Status: scaffold complete (step 18/18). 364 tests green; `tsc --noEmit` clean.

## `luca code` integration

This package is the OpenAI provider engine for the `luca` CLI. From any repo with
`@alecsibilia/luca` installed:

```
luca code --openai [args...]   # run Claude Code through this bridge (gateway + launch)
luca code --ollama [args...]   # `ollama launch claude --model glm-5.2:cloud`
luca code --claude [args...]   # plain `claude` (also the default: `luca code`)
```

`luca code --openai` delegates into this package's `main(["claude", ...args])`,
so it runs the exact same gateway + launch flow as `luca-code claude` below. The
first time you use `--openai` you must authorize once with `luca-code login`
(the `luca code` command does not manage credentials — run the standalone
`luca-code` bin for `login` / `status` / `logout`).

## Install

```bash
bun install
bun run build        # bundle to dist/luca-code.js
bun run compile      # single binary at dist/luca-code
```

`bun run build` produces `dist/luca-code.js` (a Bun-target bundle).
`bun run compile` produces a standalone executable at `dist/luca-code`
via `bun build --compile`. Either artifact can be put on `PATH`; the source tree
can also be run directly with `bun run src/cli.ts` (or `bun run dev`).

## Commands

```
luca-code <command> [args...]
```

| Command | Purpose |
|---|---|
| `login` | Run the OpenAI device-authorization flow against `auth.openai.com`, persist the credential, and print the connected email + plan. |
| `claude [args...]` | Ensure a credential (else: "run `luca-code login` first"), fetch the subscription model list, start the loopback gateway, prepare an isolated Claude profile, and launch `claude` with `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`. Forwards `args...` verbatim. |
| `status` | Show provider, connected account email + plan, and the available subscription models. |
| `logout` | Delete the stored credential (idempotent). |
| `help` / `--help` / `-h` | Print help. |
| `version` / `--version` | Print version (`0.1.0`). |

Env overrides use the `LUCA_CODE_*` prefix (see [Config knobs](#config-knobs)).

## How the bridge works

```
                ┌─────────────────────────────────────────────────────────────┐
                │                    your machine (127.0.0.1)                   │
                │                                                             │
  luca-code claude                                         OpenAI Responses │
  ───────────────────────────  ┌──────────────┐    Anthropic  API (chatgpt.com │
  ensure cred + fetch models ─▶│  luca-code   │◀── /v1/messages ── backend-api │
  start loopback gateway       │   gateway    │    (translated)    /codex)    │
  write Claude profile         │  127.0.0.1:  │──────────────────▶           │
  spawn `claude` ─────────────▶│   <random>   │                  Responses SSE │
                               │  bearer token │◀──────────────────           │
  ANTHROPIC_BASE_URL           └──────────────┘     (collector converts back  │
  ANTHROPIC_AUTH_TOKEN                                to Anthropic SSE)        │
                │                       │                                   │
                │    `claude`            └───────────────────────────────────┘
                ▼  (Claude Code)
        posts /v1/messages to the gateway ──▶ gateway translates ──▶ OpenAI
        receives Anthropic SSE ◀── collector converts Responses SSE
```

End-to-end flow for `luca-code claude`:

1. **Ensure credential.** Load `~/.config/luca-code/luca-code-cred.json`;
   if absent, exit with "run `luca-code login` first."
2. **Fetch subscription models.** `GET chatgpt.com/backend-api/codex/models`
   with the bearer access token; auto-refresh on expiry.
3. **Start the loopback gateway.** `Bun.serve` on `127.0.0.1:0` (random port),
   mints a random 32-byte hex bearer token, installs the public model catalog
   (`claude-luca-code-<upstream-slug>`).
4. **Prepare the Claude profile.** An isolated config tree under
   `<configDir>/luca-code/profile/` (mode `0700`), seeded from `~/.claude`,
   scrubbed of gateway/env keys, with model selection written back atomically.
5. **Launch `claude`.** `Bun.spawn` with inherited stdio, `ANTHROPIC_BASE_URL`
   pointing at the gateway, `ANTHROPIC_AUTH_TOKEN` = gateway token, and the public
   model ids pinned via `--managed-settings`.
6. **Serve requests.** Claude Code `POST /v1/messages` → gateway authenticates
   the bearer token → translates the Anthropic request to an OpenAI Responses
   request → streams the Responses SSE → the collector converts it back to
   Anthropic SSE → Claude Code.
7. **Tear down.** On `claude` exit the gateway is closed, the terminal state is
   restored, and `claude daemon stop --any` runs best-effort.

## OAuth login flow

`luca-code login` runs the OAuth 2.0 device authorization grant against
`auth.openai.com`, tuned for the codex backend (client id
`app_EMoamEEZ73f0CkXaXp7hrann`):

1. **start** — `POST https://auth.openai.com/api/accounts/deviceauth/usercode`
   with `{client_id}`, receiving `device_auth_id`, `user_code`, and a polling
   `interval` (seconds, defaults to 10).
2. **ready** — the CLI prints the device URL and user code:
   ```
   Open https://auth.openai.com/codex/device and enter the code: ABCD-1234
   Waiting for authorization...
   ```
3. **poll** — every `interval*1000 + 3000` ms, `POST
   https://auth.openai.com/api/accounts/deviceauth/token` with
   `{device_auth_id, user_code}`. `403`/`404` mean still pending (keep polling);
   any other non-2xx is an error; `200` yields `{authorization_code, code_verifier}`.
4. **exchange** — `POST https://auth.openai.com/oauth/token` with an
   `authorization_code` form body (`code`, `redirect_uri`, `client_id`,
   `code_verifier`) → `{access_token, refresh_token, expires_in, id_token}`.
5. **persist** — the credential is written to disk at `0600` (see
   [Credentials](#credentials)) and the connected email + `chatgpt_plan_type`
   claim are printed.

Refresh is automatic: `getCredentials` loads the credential, returns it if still
valid, otherwise rotates via a `refresh_token` grant and persists. `forceRefresh`
single-flights concurrent refreshes per profile dir and reuses an
already-rotated access token if a concurrent call beat it to it.

## Config knobs

All defaults live on the `ConfigSchema` in `src/config.ts`; `LUCA_CODE_*` environment
variables override them. Invalid values are swallowed (the schema default
applies) — the proxy never crashes on a misconfigured env var.

| Field | Env var | Default | Notes |
|---|---|---|---|
| `profileDir` | `LUCA_CODE_PROFILE_DIR` | `~/.config/luca-code` | Credential + Claude profile live here. |
| `defaultEffort` | `LUCA_CODE_DEFAULT_EFFORT` | `medium` | `low` / `medium` / `high` reasoning effort. |
| `maxConcurrentSubscription` | `LUCA_CODE_MAX_CONCURRENT_SUBSCRIPTION` | `4` | Max concurrent subscription requests. |
| `modelMap` | — | `{}` | Public-id alias chain (resolved case-insensitively, bounded to 8 hops). |
| `maxBodyBytes` | `LUCA_CODE_MAX_BODY_BYTES` | `10485760` (10 MiB) | Request body size cap. |
| `requestTimeoutSec` | `LUCA_CODE_REQUEST_TIMEOUT_SEC` | `120` | Seconds. |
| `requestTimeout` | `LUCA_CODE_REQUEST_TIMEOUT_MS` | `120000` | Milliseconds. |
| `originator` | `LUCA_CODE_ORIGINATOR` | `cc-openai-bridge` | `originator` header value. **Preserved** as `cc-openai-bridge` for Cloudflare fingerprint compatibility — see Known risks. |
| `useCodexCliRsUa` | `LUCA_CODE_USE_CODEX_UA` | `false` | When true, send the `codex_cli_rs/<version>` User-Agent instead of `cc-openai-bridge/<version>`. |

The User-Agent strings (both kept in sync with `CLIENT_VERSION = "0.144.5"`):

- `DEFAULT_UA` = `cc-openai-bridge/0.144.5` (default).
- `CODEX_CLI_RS_UA` = `codex_cli_rs/0.144.5` (fallback, enabled via
  `LUCA_CODE_USE_CODEX_UA=1`).

> The `cc-openai-bridge` literal in the UA / `originator` values is intentionally
> preserved even though the package was renamed to `luca-code`. These header
> values are fingerprinted by the OpenAI / Cloudflare backend (see Known risks);
> only the env-var *knobs* were renamed (`CCOB_*` → `LUCA_CODE_*`), not the
> header *values*. Renaming the values risks breaking auth/requests.

## Credentials

- **Location:** `~/.config/luca-code/luca-code-cred.json`
  (overridable via `LUCA_CODE_PROFILE_DIR`).
- **Mode:** `0600` (owner read/write only). Both the temp file and the final file
  are `chmod`'d to `0600`; the write is atomic (temp-then-rename) so a crash
  mid-write cannot leave a truncated credential.
- **Shape:** `{type:"openai_account_oauth", method:"chatgpt_headless",
  access, refresh, expires_at (ms epoch), account_id, id_token}`.
- **Validation:** `loadCredentials` parses with `safeParse` and degrades to `null`
  on any missing/unreadable/invalid file — a corrupted credential never crashes
  the proxy; it surfaces as "not authorized" so you re-run `login`.
- **Logout:** `luca-code logout` removes the file (idempotent).

## Known risks

This bridge is **unofficial**. Read this section before relying on it.

- **Unofficial subscription endpoint.** All generation goes through
  `https://chatgpt.com/backend-api/codex/responses`, which is not a public,
  documented API. It can change shape, add new anti-abuse checks, or reject the
  client at any time without notice.
- **Tracking the macaz `clientVersion`.** The bridge ports constant values
  verbatim from the upstream macaz client (`src/constants.ts`). When macaz bumps
  its client version, this bridge must track it or the backend may reject the
  fingerprint. `CLIENT_VERSION = "0.144.5"` is load-bearing — bumping it is a
  manual, upstream-coupled operation.
- **GPT tool-call fidelity is the weak link.** Claude Code's agent loop is built
  around Anthropic's tool-use semantics. Translating Anthropic Messages tool
  calls to/from OpenAI Responses tool calls is the inherent lossy surface;
  complex multi-tool, parallel-tool, and partial-streaming tool-call patterns
  may not round-trip perfectly. Expect lower fidelity on agentic tool-heavy
  sessions than on plain chat.
- **Cloudflare fingerprint + `codex_cli_rs` UA fallback.** The backend sits
  behind Cloudflare, which fingerprints `User-Agent` / `originator` headers.
  The default `cc-openai-bridge/<version>` UA mirrors the originator shape; if
  it is ever blocked, set `LUCA_CODE_USE_CODEX_UA=1` to fall back to the
  `codex_cli_rs/<version>` User-Agent that the upstream Rust client advertises.
  Both UAs are kept in sync with `CLIENT_VERSION`. This fingerprint is
  load-bearing — changing it blindly will break auth/requests. The `cc-openai-bridge`
  literal in the UA/originator was intentionally **kept** when the package was
  renamed to `luca-code` for this reason; only the local env-var knobs changed.

## Verification

Automated checks run in CI (no credentials required):

```bash
cd packages/luca-code
bun test                 # 364 tests across 16 files — all green
bunx --bun tsc --noEmit  # clean
```

Current status (step 18): **364 pass / 0 fail**, `tsc --noEmit` exit 0.

## Manual steps (not covered by CI)

The test suite never touches the network, the disk credential store, or a real
`claude` binary — all side effects are injected via `CliDeps` / gateway deps /
spawn seams. To validate end-to-end on a machine with a ChatGPT subscription:

1. `bun install && bun run build`
2. `luca-code login` — complete the device flow in a browser, confirm the
   connected email + plan print.
3. `luca-code status` — confirm the model list prints.
4. `luca-code claude` — confirm Claude Code starts and answers a prompt;
   exit cleanly (Ctrl-C maps to exit code 0). (`luca code --openai` runs the
   same path.)
5. `luca-code logout` — confirm the credential file is removed.

These require real OpenAI credentials and a locally installed `claude` binary;
they are intentionally out of scope for the automated suite.