# What can MuninnDB's REST API do for the engine?

> Research for the wayfinder ticket "What can MuninnDB's REST API do for the engine?" on "Map: Luca v1 on Pi". Date: 2026-09-22.

## Answer

- REST covers only part of MuninnDB: write (single/batch), read, delete, link, recall/activate. **No route** for `evolve`, `feedback`, `recall_tree`, `remember_tree`, `consolidate`, `decide`, `traverse`, or most graph/entity tools — MCP-only.
- Vault is chosen per call via `?vault=`. A vault-scoped API key must match that param or the call is rejected.
- Auth is a bearer `mk_...` key: `Authorization: Bearer mk_...`. A second type, `cap_...` workflow capabilities, works over MCP only — REST/gRPC reject it.
- Docs say `mk_` keys are **vault-scoped** (one key, one vault). This repo's code comments instead claim one "instance-level" key reaches every vault — a real conflict, flagged in Unverified since it matters for Luca's two vaults.
- Vendor-stated targets (not measured here): write ACK <10ms, point read <2ms, activation query <20ms. REST is called the "slowest" of the four protocols (JSON overhead, no pipelining).
- `evolve`/`recall_tree`/`remember_tree`/`feedback` being MCP-only means a REST-only engine can't do in-place updates, brain-tree read/write, or procedure-ranking feedback — all things current Luca code relies on. Needs an MCP-capable path for those.

## Endpoint table

Base URL: `http://127.0.0.1:8475`. Ports and paths below are from `architecture.md`, `quickstart.md`, and `feature-reference.md` (§ Findings notes a stale port table in the latter — paths, not ports, are used from it).

| Operation | Method + path | Key params | Notes |
|---|---|---|---|
| Remember (single) | `POST /api/engrams` | `concept`, `content`, `tags`, `type`, `confidence`, `created_at`, `idempotent_id`, `?vault=` | — |
| Remember (batch) | `POST /api/engrams/batch` | array, max 50 | per-item errors; 1 rate-limit event |
| Recall / activate | `POST /api/activate` | `context[]`, `max_results`, `threshold`, filters | 6-phase pipeline |
| Read | `GET /api/engrams/{id}` | `?vault=` | — |
| Forget (soft/hard) | `DELETE /api/engrams/{id}` / `?hard=true` | — | soft = archived, recoverable |
| Link | `POST /api/link` | `source_id`, `target_id`, `relation`, optional `weight` | 16 built-in relation types |
| List engrams / links | `GET /api/engrams`, `GET /api/engrams/{id}/links` | `vault`, `limit`, `offset`, `tags` | — |
| Session / stats / health | `GET /api/session`, `/api/stats`, `/api/health`, `/api/ready`, `/api/workers` | — | health/ready/workers need no auth |
| Vaults | `GET /api/vaults` | — | counts + sizes |
| Subscribe (push) | `GET /api/subscribe` (SSE) | context | long-lived stream |
| Admin: keys, vault config, plasticity | `POST/GET/DELETE /api/admin/keys`, `PUT /api/admin/vaults/config`, `GET/PUT /api/admin/vault/{name}/plasticity` | `vault`, `label`, `mode`, `public`, preset | admin-session only |
| **Evolve, feedback, trees** | none | — | MCP-only: `muninn_evolve`, `muninn_feedback`, `muninn_remember_tree`, `muninn_recall_tree`, `muninn_add_child` |
| Consolidate, decide, state, traverse, explain, restore, list_deleted, retry_enrich, contradictions, entity graph (9 tools), provenance, replay_enrichment, where_left_off, guide | none | — | all MCP-only |

## Findings

- **Ports**: REST 8475, gRPC 8477, MBP 8474 (binary), MCP 8750 (JSON-RPC), Web UI/health 8476. Local `muninn --help` and `docs/architecture.md` §6 agree; `docs/quickstart.md` §2 matches. `feature-reference.md` gives different numbers and is treated as stale since two independent, consistent sources disagree with it.
- **REST is a subset of MCP.** MCP exposes 35 named tools; REST's "Other Core Operations" table lists ~17 non-admin routes. Every `—` row in the endpoint table above is MCP-only. Source: [feature-reference.md §5](https://github.com/scrypster/muninndb/blob/develop/docs/feature-reference.md) "Other Core Operations" and "MCP Tool Summary (35 tools)".
- **Vault selection**: `?vault=` on the request. A vault-scoped key implicitly identifies its vault; `?vault=` naming a different vault than the key's own is rejected. Some routes also accept `vault` in the JSON body "for compatibility" (being deprecated; must match the query param if both present). Source: [docs/auth.md](https://github.com/scrypster/muninndb/blob/develop/docs/auth.md).
- **Auth, two layers.** (1) Admin credentials (`root` + generated password, shown once) authenticate the Web UI (24h session cookie) and `muninn shell` — not vault data. (2) Vault API keys, prefixed `mk_` (46 chars, stored server-side only as a SHA-256 hash), sent as `Authorization: Bearer mk_...`, used for REST/gRPC vault-data calls, mode `full` (read+write cognitive state) or `observe` (read-only; mutating REST routes 403 before reaching the engine). This repo's own doctor-check fallback already documents the same header: `claude mcp add ... --header "Authorization: Bearer <your-muninn-api-key>"` (`packages/luca-cli/src/utils/doctor/checks/muninn-mcp.ts`). Source: [docs/auth.md](https://github.com/scrypster/muninndb/blob/develop/docs/auth.md).
- **`cap_` workflow capabilities** are TTL-bound (default 7d), minted via MCP tool `muninn_create_workflow_vault` (opt-in, `MUNINN_AGENT_VAULT_CREATE=1`), and explicitly MCP-transport-only: REST/gRPC "call only `ValidateAPIKey`... a `cap_` bearer on REST/gRPC is rejected as an invalid key." Source: docs/auth.md.
- **`default` vault ships public** (no key needed); every other vault starts locked until opened via `PUT /api/admin/vaults/config {"name":...,"public":true}`. Source: docs/auth.md.
- **This repo's own assumption may be stale.** `muninn-mcp-registration.ts` states a registered MCP server "authenticates with a single, INSTANCE-level API key and reaches EVERY vault." Official `auth.md` describes `mk_` keys as bound to one vault, with a mismatched `?vault=` rejected — see Unverified. The local CLI's admin commands (`muninn vault`, `muninn api-key`) default to `-h 127.0.0.1:8475` with separate admin username/password flags (`-u`, default `root`; `-p`) — the Layer-1 credential, not a bearer key.
- **Latency — vendor targets, not measured here** (local ports not probed, per task rules): write ACK <10ms, point read <2ms, activation query <20ms, FTS-only <5ms, vector-only <10ms, BFS depth-2 <5ms. Source: [architecture.md §9](https://github.com/scrypster/muninndb/blob/develop/docs/architecture.md) "Performance Targets". Same doc: REST is "slowest... JSON serialization overhead and no pipelining" vs MBP as lowest-latency. `feature-reference.md` separately notes FTS indexing lags the write ACK by "~100ms" (async).
- **Health/readiness are unauthenticated** (`GET /health`, `/api/ready`, `/api/workers`), matching this repo's `checkMuninndbService()`. This repo's MCP doctor check treats a 401/403 from the MCP port as "up, needs auth" — consistent with bearer-gating.

## Unverified / open

- **Vault scope of a single `mk_` key**: one-key-per-vault (per `auth.md`) or instance-wide (per this repo's comments)? Matters for Luca's two vaults (`luca-monorepo`, `default`) — if scoped, the engine needs two keys (or an admin credential) to reach both over REST. Docs alone don't resolve this; would need a live authenticated call against a second vault (out of scope — no credential files opened, no local ports probed).
- Exact error status/body for a vault/key mismatch — `auth.md` says "rejected" but doesn't show the response shape.
- Whether `POST /api/link` accepts an explicit numeric `weight` at creation — implied by prose but no REST example was found.
- Latency figures are vendor design targets, not measured against a running instance.
- Rate limits: batch writes count as "1 event, not N," implying a limiter exists, but no numeric ceiling was found.
- `feature-reference.md` self-labels a "Personal reference doc" with a demonstrably stale port table; its endpoint paths were cross-checked against `quickstart.md`'s live curl examples and held up, but anything sourced only from that file merits extra caution.

## Sources

- `muninn --help` (`~/.local/bin/muninn`) — local installed CLI (accessed 2026-09-22)
- [architecture.md](https://github.com/scrypster/muninndb/blob/develop/docs/architecture.md), [auth.md](https://github.com/scrypster/muninndb/blob/develop/docs/auth.md), [feature-reference.md](https://github.com/scrypster/muninndb/blob/develop/docs/feature-reference.md), [quickstart.md](https://github.com/scrypster/muninndb/blob/develop/docs/quickstart.md) — scrypster/muninndb, `develop` branch
- [muninndb.com/docs](https://muninndb.com/docs/)
- `mcp__muninn__muninn_guide` tool output (accessed 2026-09-22)
- `packages/luca-cli/src/utils/muninn-mcp-registration.ts`, `doctor/checks/muninn-mcp.ts`, `muninndb-health.ts`, `write-surface/helpers/resolve-repo-vault.ts`
- `packages/luca-core/src/vault/helpers/resolve-project-vault.ts` (same repo)
- `docs/research/luca-on-pi/stocktake.md`
