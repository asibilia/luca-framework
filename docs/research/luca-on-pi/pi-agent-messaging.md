# How do agents on Pi talk to each other today?

> Research for the wayfinder ticket "How do agents on Pi talk to each other today?" on "Map: Luca v1 on Pi". Date: 2026-09-22.

## Answer

- Three real messaging layers exist: **pi-messenger** (shared-directory mailbox, no daemon), **pi-intercom** (a local broker for 1:1 DMs), **agent-comms** (a localhost TCP peer mesh, cross-harness). `@tintinweb/pi-subagents`'s `pi.events` RPC is *not* agent-to-agent messaging — an in-process control API for one session's own child subagents, unable to cross a process boundary.
- All three real layers land in the model the way core Pi's SDK does: a **steer** (mid-turn) or a fresh **next turn** (idle). agent-comms alone also exposes a distinct **follow-up** hint, matching the SDK's `followUp()`.
- Only **pi-messenger** ships a built-in, always-on append-only log of message events (`feed.jsonl`) — but as a 200-character preview, not the full body; full text lives only in a maildir file deleted once delivered.
- **agent-comms** and **pi-intercom** keep message state in memory only, by design; neither gives an engine anything to replay after a crash.
- All four accept Pi 0.87 on paper via peer ranges, but 0.87 shipped one day before this research (2026-09-21), so none is confirmed on it yet.
- None is a ready-made, replayable journal. The engine should use one as a transport and own the durable log itself, the same way it will own its MuninnDB calls.

## Comparison table

| Option | Topology | Delivery | Persistence | Journal-able? | Maturity | Pi 0.87 |
|---|---|---|---|---|---|---|
| **pi-messenger** | No daemon — shared `.pi/messenger/` dir; maildir inbox + JSON registry, lock file | `deliverAs: "steer"`, `triggerTurn: true`, on `fs.watch` of inbox | Body: ephemeral JSON file, deleted on delivery. `feed.jsonl`: append-only, 200-char preview | Partial — event log yes, verbatim body no | 710★, created 2026-01-23, v0.15.2 (2026-08-27) | peerDep `"*"` |
| **pi-intercom** | Hub — one local broker per machine; local IPC | `ask`/`send`; idle → new turn now, busy → steering queue at next safe boundary | In-memory only. Mailbox for disconnected sessions explicitly not durable across broker restarts | No | 521★, v0.13.0 (2026-09-02) | peerDep `"*"` |
| **agent-comms** | Hybrid — first process to bind port 19876 becomes coordinator (intros only); then direct P2P over TCP | `streamingBehavior: steer\|followUp\|info`; Pi bridge maps to `deliverAs` | In-memory mesh; only local identity/trust keypair on disk | No, by design | 21★, created 2026-04-26, v8.0.8 (2026-09-22, same-day) | peerDep `">=0.79.0"` |
| **`pi.events` RPC** (`@tintinweb/pi-subagents`) | None — in-process, same event loop; no cross-process | Synchronous `emit`/reply; not injected into any conversation | `pi.appendEntry("subagents:record", …)` on the spawning session's own transcript, not a shared log | No — wrong layer | 1,208★, v0.19.0 (2026-08-27) | peerDep `">=0.84.0"` |
| oh-my-pi built-in DMs (brief) | Unverified | Unverified | Unverified | Unverified | Fork of Pi; 32.7k★ is the whole fork | Separate scope, `@oh-my-pi/pi-coding-agent` |

## Findings

**pi-messenger.** "No daemon, no server, just files" ([README](https://github.com/nicobailon/pi-messenger)). `sendMessageToAgent()` writes each DM to a per-recipient maildir file ([store.ts#L1031](https://github.com/nicobailon/pi-messenger/blob/main/store.ts#L1031)), delivered via `{ triggerTurn: true, deliverAs: "steer" }` ([index.ts#L190](https://github.com/nicobailon/pi-messenger/blob/main/index.ts#L190)); the inbox is watched with `fs.watch(...)`, debounced 50 ms ([store.ts#L1068](https://github.com/nicobailon/pi-messenger/blob/main/store.ts#L1068)). `feed.ts` is commented "Append-only JSONL feed stored at `<cwd>/.pi/messenger/feed.jsonl`" with a `"message"` event type ([feed.ts](https://github.com/nicobailon/pi-messenger/blob/main/feed.ts)); `logFeedEvent` gets a preview capped at 200 characters ([handlers.ts#L406](https://github.com/nicobailon/pi-messenger/blob/main/handlers.ts#L406)) — the durable trail records that a message happened plus a snippet, not the full payload. "Crew" mode (PRD → task graph → parallel waves, planner/reviewer loop) logs to `.pi/messenger/crew/planning-progress.md` per project (README).

**pi-intercom.** A "tiny local broker" sessions connect to over local IPC; `intercom` exposes `send` (fire-and-forget) and `ask` (blocks for a reply, returned in the same turn) ([README](https://github.com/nicobailon/pi-intercom)). "Idle recipients get a new turn immediately; busy interactive recipients receive the message through Pi's steering queue at the next safe model boundary" (same README). The mailbox for disconnected sessions is explicitly "per-broker runtime state, not durable storage across broker restarts" (same README). It integrates with `nicobailon/pi-subagents` (3,739★, v0.70.1, 2026-09-21) to give spawned children a `contact_supervisor` tool, gated on `PI_SUBAGENT_*` env vars.

**agent-comms.** A cross-harness TCP mesh on localhost; the first bridge to bind port 19876 becomes coordinator for introductions only — "it is not a router" — after which peers hold direct connections ([README](https://github.com/ExaDev/agent-comms)). `send`/`dm` accept `streamingBehavior: steer|followUp|info`, and the Pi bridge "honours the hint natively via `deliverAs`" (same README). "All state is held in memory and synchronised between peers... the only thing on disk is the local key credential" (same README); source comments confirm identity/trust grants persist per slot while mesh state does not ([mesh-store.ts#L138](https://github.com/ExaDev/agent-comms/blob/main/src/core/mesh-store.ts#L138)). Most actively developed of the four — three releases the same day as this research — but smallest footprint (21 stars).

**`pi.events` RPC (`@tintinweb/pi-subagents`).** "The bus is in-process. Every 'RPC' call here is a synchronous `pi.events.emit` into the same event loop... none of this survives a real process boundary" ([docs/rpc.md](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md)). Four request/reply channels (`ping|spawn|stop|consume`) and eleven lifecycle events let one extension drive another's child subagents inside the same session ([cross-extension-rpc.ts](https://github.com/tintinweb/pi-subagents/blob/master/src/cross-extension-rpc.ts)). Its only durable trace is `pi.appendEntry("subagents:record", …)` on the spawning session's own transcript — "append-only history, not something to react to" (docs/rpc.md) — a private audit trail, not a shared journal. This confirms against source, not just assertion, the stocktake's note that "`pi.events` is in-process only. There is no cross-process bus" (`docs/research/luca-on-pi/stocktake.md:132`).

**Core Pi SDK, for contrast.** `steer()` enters "after the current assistant turn and its tool calls"; `followUp()` enters "after the current run finishes its pending work" ([sdk.md#L66](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#L66)). `pi.events` sits under "Communicate with another extension," not another agent ([extensions.md#L84](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#L84)). Sessions persist their transcript as JSONL (`sdk.md`), so a tool-call message is captured in the *sender's own* per-session log automatically — but that's N separate files, not one merged run journal.

**oh-my-pi.** Self-describes as "Fork of Pi by [@mariozechner]" ([README](https://github.com/can1357/oh-my-pi)), though GitHub reports it standalone (`isFork: false`) under a different scope, `@oh-my-pi/pi-coding-agent`. No built-in DM code turned up in a source search; treat as unverified, per the brief-mention instruction.

## Unverified / open

- oh-my-pi's built-in DM mechanism — not located in source, only the fork lineage is confirmed.
- Whether pi-messenger, pi-intercom, or agent-comms have run against Pi 0.87.0 (released 2026-09-21) — peer ranges allow it, but no changelog names 0.87.
- pi-messenger's and pi-intercom's on-disk/mailbox behavior under concurrent multi-agent load, and whether agent-comms' dashboard event stream (oRPC `subscribeEvents`) could double as a replay feed — both read from source, not observed live.

## Sources

- `CONTEXT.md` — vocabulary
- `docs/research/luca-on-pi/stocktake.md` — section 6, "Pi"
- https://github.com/nicobailon/pi-messenger — README, `store.ts`, `feed.ts`, `handlers.ts`, `index.ts`
- https://github.com/nicobailon/pi-intercom — README
- https://github.com/nicobailon/pi-subagents — repo metadata, releases
- https://github.com/ExaDev/agent-comms — README, `src/core/mesh-store.ts`
- https://github.com/tintinweb/pi-subagents — `docs/rpc.md`, `src/cross-extension-rpc.ts`
- https://github.com/earendil-works/pi — `sdk.md`, `extensions.md`
- https://github.com/can1357/oh-my-pi — README
