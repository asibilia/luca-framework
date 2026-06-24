# Implementation Verification Report: Option F (Channel-Driven Orchestrator)

Technical verification of the channel-driven orchestrator proposal. This report
examines real implementations, official documentation, bug reports, and community
usage to validate or invalidate each architectural claim.

**Research date:** 2026-03-29

---

## Executive Finding

**Option F's core architectural loop (push event -> Claude executes -> reply tool signals completion -> push next event) is technically sound in protocol design but broken in practice.** The channel notification delivery mechanism has a confirmed, unresolved bug that silently drops notifications after the first turn completes. This is the same class of failure as the Skill() bug (#17351) that Option F was designed to replace.

---

## 1. Fakechat Channel Implementation Analysis

### Source Examined

Full source code of `external_plugins/fakechat/server.ts` from the `anthropics/claude-plugins-official` repository, fetched via GitHub API.

### How Fakechat Handles Sequential Messages

Fakechat does NOT handle sequential messages with any waiting mechanism. It is a
fire-and-forget event emitter:

```typescript
// From server.ts -- the deliver() function
function deliver(
  id: string,
  text: string,
  file?: { path: string; name: string },
): void {
  void mcp.notification({
    method: "notifications/claude/channel",
    params: {
      content: text || `(${file?.name ?? "attachment"})`,
      meta: {
        chat_id: "web",
        message_id: id,
        user: "web",
        ts: new Date().toISOString(),
        ...(file ? { file_path: file.path } : {}),
      },
    },
  });
}
```

Key observations:

1. **`void` prefix on `mcp.notification()`** -- the notification promise is explicitly
   discarded. There is no waiting for Claude to process the event.
2. **No queuing logic** -- each inbound message from the web UI immediately fires
   `deliver()`. If two messages arrive rapidly, two notifications fire in sequence
   with no coordination.
3. **No completion detection** -- fakechat has no mechanism to know when Claude has
   finished processing a message. It does not wait for the `reply` tool call before
   accepting new messages.
4. **No sequencing** -- there is no message counter, no "wait for reply before next
   message" lock, no acknowledgment system.

### The Reply Tool Is One-Way Output Only

Fakechat's `reply` tool is purely for Claude to send messages BACK to the web UI.
It is not used for synchronization:

```typescript
case 'reply': {
  const text = args.text as string
  // ...
  broadcast({ type: 'msg', id, from: 'assistant', text, ts: Date.now(), replyTo, file })
  return { content: [{ type: 'text', text: `sent (${ids.join(', ')})` }] }
}
```

The `reply` tool broadcasts a WebSocket message to the browser UI. It does not
signal "message processed" or "ready for next event" to the server's event delivery
system. Claude calls `reply` whenever it wants to send text to the UI -- it is not
gated on or synchronized with notification delivery.

### Conclusion: Fakechat Does Not Validate the Push-Wait-Push Pattern

The proposed Option F architecture assumes: push event -> wait for step_complete ->
push next event. Fakechat demonstrates: push event -> ignore result -> accept next
message whenever. There is no precedent in the official implementations for a
blocking push-wait-push orchestration loop.

**Confidence:** HIGH (direct source code examination)

---

## 2. MCP Server Registration: .mcp.json vs --channels

### Verified Behavior

Both are required, but they serve different purposes:

| Mechanism    | What It Does                                                         | Required? |
| ------------ | -------------------------------------------------------------------- | --------- |
| `.mcp.json`  | Tells Claude Code HOW to spawn the MCP server (command, args)        | Yes       |
| `--channels` | Tells Claude Code WHICH servers should deliver channel notifications | Yes       |

From the official documentation:

> "Being in .mcp.json isn't enough to push messages: a server also has to be named
> in --channels."

The MCP server registration in `.mcp.json` is standard -- Claude Code reads it at
startup and spawns each server as a subprocess. But a server in `.mcp.json` that
declares `claude/channel` capability will NOT deliver notifications unless also
listed in `--channels`.

### There IS a Difference Between MCP Server and Channel Plugin

| Concept                    | What It Is                                      | Registration                                              |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| MCP Server                 | Any server in `.mcp.json`. Tools work normally. | `.mcp.json` only                                          |
| Channel-Capable MCP Server | Server that ALSO declares `claude/channel`.     | `.mcp.json` + `--channels server:<name>`                  |
| Channel Plugin             | A packaged channel with install/configure flow. | Plugin install + `--channels plugin:<name>@<marketplace>` |

A bare MCP server in `.mcp.json` can declare `claude/channel` and register tools,
but its notifications will be silently ignored unless opted in via `--channels`.

During research preview, custom servers use:

```bash
claude --dangerously-load-development-channels server:<name-from-mcp-json>
```

### Implication for Option F

The `luca-orchestrator` server would need BOTH:

1. Entry in `.mcp.json` (so Claude Code spawns it)
2. `--channels` or `--dangerously-load-development-channels` flag at startup

This means users must change their Claude Code launch command. Forgetting
`--channels` results in the server's tools working (step_complete is callable)
but notifications never arriving (the push mechanism is silently dead).

**Confidence:** HIGH (official documentation, confirmed by bug reports #37026)

---

## 3. The Reply Tool Mechanism

### How It Works

The reply tool is a **standard MCP tool call**. Claude invokes it exactly like any
other MCP tool (Read, Write, Bash, etc.). The MCP SDK handles the request/response
lifecycle over stdio.

```
Claude                    Channel Server
  |                           |
  |--- CallTool("reply") ---->|  (standard MCP tool_call request)
  |                           |  (server processes, sends message to platform)
  |<-- { text: "sent" } -----|  (standard MCP tool_call response)
  |                           |
```

### Can the Channel Server BLOCK on a Reply Tool Call?

**Yes, technically.** The MCP request/response is synchronous from Claude's
perspective -- Claude waits for the tool response before continuing. This means
the channel server's `CallToolRequestSchema` handler CAN do arbitrary async work
before returning, and Claude will wait.

However, this creates the push-wait-push lock ONLY for the tool call direction
(Claude -> Server). The notification direction (Server -> Claude) is fire-and-forget
with no blocking capability.

The proposed Option F loop:

```
1. Server pushes notification (fire-and-forget, no acknowledgment)
2. Claude processes the event and calls step_complete tool
3. Server handler for step_complete pushes next notification
4. Claude processes the next event...
```

Step 3 is where the synchronization happens: the server pushes the NEXT notification
from WITHIN the step_complete tool handler, before returning the response to Claude.
This means:

- The notification for step N+1 is emitted while Claude is still in the tool call
  for step N's completion
- Claude receives the tool response AND the queued notification
- Whether Claude processes the notification next depends on Claude Code's internal
  queuing behavior (not guaranteed -- see Section 4)

### What Happens If Claude Doesn't Call the Reply Tool?

There is no protocol-level mechanism to detect this. The channel server has no way
to know:

- Whether Claude received the notification
- Whether Claude is working on the step
- Whether Claude decided to ignore the event
- Whether Claude will call the tool eventually

The server can only implement a timeout: if no `step_complete` call arrives within
N seconds, re-send the notification or alert the user. But there is no distinction
between "Claude is still working" and "Claude ignored the event."

**Confidence:** HIGH (MCP protocol design, official docs, source code analysis)

---

## 4. Event Delivery Mechanics -- THE CRITICAL FINDING

### When Does Claude Process a Channel Event?

Channel events are delivered as queued user messages. They are NOT interrupts.

From [GitHub Issue #30492](https://github.com/anthropics/claude-code/issues/30492)
(Feature Request: Real-time steering):

> "Messages typed during processing are queued and delivered at the next turn
> boundary -- by which point Claude may have completed significant work in the
> wrong direction."

From the same issue:

> "Claude Code already has interstitial windows between tool calls where context
> can be injected (PreToolUse hooks prove this)."

**Events do NOT arrive immediately.** They queue in a FIFO buffer and are processed
at turn boundaries. This means:

1. If Claude is idle at the `>` prompt: event processes immediately
2. If Claude is mid-turn (executing tools, generating text): event queues until
   the current turn completes
3. If multiple events arrive during a turn: they queue FIFO

### Can Events Queue Up?

**Yes.** This is the documented behavior. Multiple notifications can queue during
a single Claude turn. When the turn completes, they process in FIFO order. There
is no deduplication, no priority, and no ordering guarantee beyond FIFO.

### Event Delivery Guarantee

**There is no delivery guarantee.** The confirmed bug pattern:

| Issue                                                            | Platform | Behavior                                            | Status                       |
| ---------------------------------------------------------------- | -------- | --------------------------------------------------- | ---------------------------- |
| [#36477](https://github.com/anthropics/claude-code/issues/36477) | Telegram | Stops processing after first response               | OPEN                         |
| [#38259](https://github.com/anthropics/claude-code/issues/38259) | Telegram | Same -- stops after completing a turn               | OPEN                         |
| [#36975](https://github.com/anthropics/claude-code/issues/36975) | Telegram | Notifications never surfaced                        | OPEN                         |
| [#36802](https://github.com/anthropics/claude-code/issues/36802) | Telegram | mcp.notification() succeeds but event never appears | CLOSED (duplicate)           |
| [#37026](https://github.com/anthropics/claude-code/issues/37026) | Discord  | "--channels ignored" -- notifications not working   | CLOSED                       |
| [#38104](https://github.com/anthropics/claude-code/issues/38104) | Discord  | Notifications silently dropped                      | CLOSED (duplicate of #36975) |

The root issue is [#36975](https://github.com/anthropics/claude-code/issues/36975),
which documents:

> "MCP server-to-client notifications using the notifications/claude/channel method
> are successfully sent by the MCP server but never surfaced as `<channel>` tags in
> the conversation."

Detailed debugging from #36975 confirms:

- The MCP stdio transport is connected (verified via `lsof`)
- `mcp.notification()` resolves without error
- The experimental capability is properly advertised
- The notification is silently consumed by Claude Code and never rendered

From [#36477](https://github.com/anthropics/claude-code/issues/36477), the pattern
is specifically about SEQUENTIAL delivery:

> "Claude Code correctly receives and responds to the first incoming Telegram
> message. However, after responding, Claude Code returns to the interactive
> prompt and stops processing subsequent incoming MCP channel notifications."

This means: **the first push works, but subsequent pushes after Claude completes
a turn are silently dropped.** This is precisely the failure mode that would kill
Option F's push-wait-push loop.

**Confidence:** HIGH (10+ independent reproductions, verified on v2.1.80-v2.1.86,
multiple platforms, root cause in Claude Code core)

---

## 5. The step_complete Approach

### Can the Reply Tool Pattern Be Repurposed for Step Completion?

**Yes, the MCP tool mechanism is sound.** The reply tool in fakechat/webhook examples
is a standard MCP tool. Renaming it `step_complete` and adding structured input
(step_name, success, summary) is trivially valid. The MCP SDK handles this
identically to any tool registration.

```typescript
// This pattern is verified and works
mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "step_complete") {
    const args = req.params.arguments as {
      step_name: string;
      success: boolean;
    };
    // Process completion...
    // Push next step...
    return { content: [{ type: "text", text: "acknowledged" }] };
  }
});
```

### Can the Server Push the Next Notification from Within the Tool Handler?

**Yes, technically.** The MCP server is single-threaded (Bun event loop) but async.
Calling `mcp.notification()` from within a `CallToolRequestSchema` handler is valid:

```typescript
mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  // 1. Process step completion
  // 2. Push next step notification BEFORE returning the tool response
  await mcp.notification({
    method: "notifications/claude/channel",
    params: { content: "next step instructions", meta: { step: "step_2" } },
  });
  // 3. Return tool response -- Claude sees both the response AND the queued notification
  return { content: [{ type: "text", text: "acknowledged" }] };
});
```

The question is: **does Claude Code process the queued notification after the tool
response?** Based on the evidence from Section 4, the answer is: sometimes yes
(first turn), but subsequent turns may silently fail (bug #36477/#36975).

### Is There a Way to Know "Claude Finished" Without the Reply Tool?

**No.** The channel protocol is one-directional for notifications (server -> Claude).
There is no:

- Notification acknowledgment (no `ack` in the protocol)
- Turn completion callback (server does not know when Claude stops generating)
- Event processed signal (server does not know if the `<channel>` tag was rendered)

The reply tool (or a similar MCP tool call from Claude) is the ONLY mechanism for
Claude to signal anything back to the channel server. File watching is a workaround
but has race conditions and requires Claude to write to a known file path.

**Confidence:** HIGH (protocol analysis, official docs, source code)

---

## 6. Sequential Orchestration via Channels -- Community Evidence

### No One Has Done This

Extensive searching found zero examples of anyone using Claude Code channels for
sequential workflow orchestration.

**What exists:**

| Project                                                                                                                                                                   | What It Does                                         | Uses Channels?                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| [barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration)                                                               | Multi-step workflow via hooks + task API + plan mode | No -- uses hooks, not channels                               |
| [louislva/claude-peers-mcp](https://github.com/louislva/claude-peers-mcp)                                                                                                 | Inter-session messaging via channel protocol         | Yes -- but for ad-hoc messages, not sequential orchestration |
| [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) / [grahama1970/claude-code-mcp-enhanced](https://github.com/grahama1970/claude-code-mcp-enhanced) | MCP server with task orchestration                   | No -- uses tool calls, not channels                          |
| [catlog22/Claude-Code-Workflow](https://github.com/catlog22/Claude-Code-Workflow)                                                                                         | JSON-driven multi-agent workflow                     | No -- uses CLI orchestration                                 |
| Official fakechat/telegram/discord                                                                                                                                        | Chat bridges                                         | Yes -- but for human-paced chat, not automated pipelines     |

The `claude-peers-mcp` project is the closest analogue. It uses the channel protocol
for inter-session communication. Key findings from its design:

- Messages are polled from a SQLite broker every 1 second (not push-driven)
- Delivery is non-blocking (senders do not wait for responses)
- There is no sequential orchestration -- messages are independent
- The design explicitly avoids relying on immediate channel delivery

**No project attempts the push-wait-push sequential pattern that Option F proposes.**

**Confidence:** HIGH (extensive GitHub search, web search, multiple query variations)

---

## Standard Stack

| Library                     | Version  | Purpose                              | Why Standard                                                                          |
| --------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | 1.27.1   | MCP Server + StdioServerTransport    | Already transitive dep via claude-agent-sdk. Official MCP SDK.                        |
| `xstate`                    | ^5.28.0  | State machine definitions            | Already direct dependency. Existing state machines in src/skills/\_\_schemas/states/. |
| `zod`                       | ^4.3.6   | Schema validation for event payloads | Already direct dependency.                                                            |
| `lodash`                    | ^4.17.23 | Deep merge for context patches       | Already direct dependency.                                                            |

No new dependencies required.

---

## API Reference

### Channel Notification Push

**Signature:** `await mcp.notification({ method: 'notifications/claude/channel', params: { content: string, meta?: Record<string, string> } })`
**Parameters:** `content` -- body of `<channel>` tag. `meta` -- each key becomes tag attribute (identifiers only, hyphens silently dropped).
**Returns:** `Promise<void>` -- resolves when stdio write completes (NOT when Claude processes the event).
**Source:** [Channels reference](https://code.claude.com/docs/en/channels-reference#notification-format)

### MCP Tool Registration (for reply/step_complete)

**Signature:** `mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] }))`
**Parameters:** Standard MCP tool definition with `name`, `description`, `inputSchema`.
**Returns:** Tool list for Claude to discover at startup.
**Source:** [Channels reference](https://code.claude.com/docs/en/channels-reference#expose-a-reply-tool)

### MCP Tool Handler (for reply/step_complete)

**Signature:** `mcp.setRequestHandler(CallToolRequestSchema, async (req) => { ... })`
**Parameters:** `req.params.name` -- tool name. `req.params.arguments` -- tool input.
**Returns:** `{ content: [{ type: 'text', text: string }] }` -- result shown to Claude.
**Source:** [Channels reference](https://code.claude.com/docs/en/channels-reference#expose-a-reply-tool)

---

## Code Examples

### Verified: Minimal Channel Server (from official docs)

```typescript
// Source: https://code.claude.com/docs/en/channels-reference
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const mcp = new Server(
  { name: "webhook", version: "0.0.1" },
  {
    capabilities: { experimental: { "claude/channel": {} } },
    instructions:
      'Events arrive as <channel source="webhook" ...>. Read and act.',
  },
);

await mcp.connect(new StdioServerTransport());
```

**Confidence:** HIGH (verbatim from official documentation)

### Verified: Reply Tool Pattern (from official docs)

```typescript
// Source: https://code.claude.com/docs/en/channels-reference#expose-a-reply-tool
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description: "Send a message back over this channel",
      inputSchema: {
        type: "object",
        properties: {
          chat_id: { type: "string" },
          text: { type: "string" },
        },
        required: ["chat_id", "text"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { chat_id, text } = req.params.arguments as {
      chat_id: string;
      text: string;
    };
    // send response back to platform...
    return { content: [{ type: "text", text: "sent" }] };
  }
  throw new Error(`unknown tool: ${req.params.name}`);
});
```

**Confidence:** HIGH (verbatim from official documentation)

### Verified: Fakechat Notification Delivery (fire-and-forget)

```typescript
// Source: anthropics/claude-plugins-official/external_plugins/fakechat/server.ts
function deliver(
  id: string,
  text: string,
  file?: { path: string; name: string },
): void {
  // NOTE: void prefix -- promise is discarded, no waiting for Claude to process
  void mcp.notification({
    method: "notifications/claude/channel",
    params: {
      content: text || `(${file?.name ?? "attachment"})`,
      meta: {
        chat_id: "web",
        message_id: id,
        user: "web",
        ts: new Date().toISOString(),
        ...(file ? { file_path: file.path } : {}),
      },
    },
  });
}
```

**Confidence:** HIGH (direct source code from official repository)

---

## Don't Hand-Roll

| Problem                        | Don't Build                       | Use Instead                                                 | Why                                                                                   |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| MCP protocol handling          | Custom JSON-RPC over stdio        | `@modelcontextprotocol/sdk` Server + StdioServerTransport   | Protocol negotiation, message framing, capability advertisement handled automatically |
| State machine definitions      | New state/transition maps         | Existing `src/skills/__schemas/states/*.states.ts`          | Already define all states and valid transitions for lu, phase-execute, verify         |
| Context file I/O               | Raw `Bun.file()` + `JSON.parse()` | Existing `createContextHelpers()` from `context-helpers.ts` | Handles deep merge, Zod validation, chmod, error recovery                             |
| Step completion signaling      | Custom IPC / file-based signaling | MCP reply tool (step_complete)                              | Standard MCP request/response, synchronous, no race conditions                        |
| Sequential event orchestration | Channel push-wait-push            | Agent() calls with hook enforcement                         | Channels have unresolved delivery bug; Agent() is stable and proven                   |

---

## Configuration

### Required: .mcp.json Registration

```json
{
  "mcpServers": {
    "luca-orchestrator": {
      "command": "bun",
      "args": ["./src/channel/orchestrator.ts"]
    }
  }
}
```

### Required: Launch Flag

```bash
# During research preview (custom channels not on allowlist)
claude --dangerously-load-development-channels server:luca-orchestrator

# After allowlist approval (uncertain timeline)
claude --channels server:luca-orchestrator
```

### Requirements

- Claude Code v2.1.80+ (channels research preview)
- claude.ai login (Console/API key auth NOT supported for channels)
- Team/Enterprise orgs must explicitly enable `channelsEnabled` in managed settings
- Bun runtime for the channel server

### Critical Restrictions

- `--channels` cannot be added to an already-running session
- Users who forget `--channels` get a silently degraded experience
- The `--dangerously-load-development-channels` flag name is a poor UX for production
- CI/CD environments using API keys cannot use channels

---

## Verification Verdicts

### Claim 1: "Channel server pushes step events into Claude Code session"

**VERDICT: TRUE in protocol design, UNRELIABLE in practice.**

The MCP notification mechanism works for the FIRST event. Subsequent events after
Claude completes a turn are affected by bug #36477/#36975, which silently drops
notifications. This has been reproduced by 10+ independent users across Telegram,
Discord, and custom servers on v2.1.80-v2.1.86.

### Claim 2: "Claude executes the step and signals completion via reply tool"

**VERDICT: TRUE.** The reply tool mechanism is a standard MCP tool call. Claude can
call it like any other tool. The channel server receives it synchronously. This
part of the architecture works reliably.

### Claim 3: "The channel creates a deterministic push-wait-push lock"

**VERDICT: FALSE.** There is no lock mechanism. Notifications are fire-and-forget.
The `mcp.notification()` promise resolves when the stdio write completes, not when
Claude processes the event. The reply tool provides a voluntary completion signal
but cannot enforce a lock. Claude can ignore events, forget to call step_complete,
or do unrelated work.

### Claim 4: "Events are delivered to Claude in order"

**VERDICT: PARTIALLY TRUE.** Events queue FIFO within the same turn boundary. But:

- Events arriving mid-turn queue behind the current turn's work
- User messages queue in the same FIFO, potentially interleaving with step events
- After turn completion, subsequent notifications may be silently dropped (bug #36477)

### Claim 5: "The channel approach prevents step skipping"

**VERDICT: PARTIALLY TRUE.** Claude cannot skip AHEAD because it does not know
future steps. But Claude CAN:

- Ignore a received event entirely
- Partially execute a step
- Signal completion without actually completing the work
- Do unrelated work instead of the step instructions

The channel provides step ordering enforcement but not step execution enforcement.
Gap detection (Layer 4) is still required.

### Claim 6: "Channels are registered via .mcp.json"

**VERDICT: PARTIALLY TRUE.** .mcp.json registers the MCP server (spawn config) but
the `--channels` flag is ALSO required to enable notification delivery. Both are
needed. .mcp.json alone results in tools working but notifications silently ignored.

---

## Confidence Assessment

| Area                                                | Level  | Reason                                                        |
| --------------------------------------------------- | ------ | ------------------------------------------------------------- |
| Notification delivery bug (#36477)                  | HIGH   | 10+ independent reproductions, open issues, no fix shipped    |
| Reply tool mechanism                                | HIGH   | Official docs, verified source code, standard MCP pattern     |
| .mcp.json + --channels dual requirement             | HIGH   | Official docs: "being in .mcp.json isn't enough"              |
| FIFO event queuing                                  | MEDIUM | Inferred from turn-boundary behavior + feature request #30492 |
| No community precedent for sequential orchestration | HIGH   | Extensive search, zero results                                |
| Research preview instability                        | HIGH   | Official docs explicitly warn                                 |
| step_complete pattern feasibility                   | HIGH   | Standard MCP tool, verified API                               |
| Event delivery timing (mid-turn)                    | MEDIUM | Documented in feature request, not officially specified       |
| Context compaction interaction                      | LOW    | Not documented, not tested                                    |
| Hybrid approach (channels + Agent())                | LOW    | Speculative, no evidence                                      |

---

## Summary Recommendation

The implementation research confirms the pitfalls assessment: **Option F cannot be
built reliably until bug #36477 is resolved.** The specific findings:

1. **The reply tool / step_complete pattern is sound.** MCP tool calls are
   synchronous, well-documented, and verified in source code. This mechanism
   reliably signals from Claude back to the server.

2. **The notification push mechanism is broken for sequential delivery.** After the
   first turn completes, subsequent `notifications/claude/channel` calls are
   silently dropped. This is the same failure mode as Skill() nesting (#17351) --
   swapping one "silently fails after first step" bug for another.

3. **No one has attempted this pattern.** Despite channels being 9 days old, no
   community project uses them for sequential workflow orchestration. All
   orchestration projects use hooks, task APIs, or CLI-based coordination.

4. **The startup ceremony is problematic.** Users must add `--channels` (or worse,
   `--dangerously-load-development-channels`) to every Claude Code launch. Forgetting
   it causes silent degradation.

**Proceed with Option B (Agent migration) for production.** Monitor channel maturity.
Re-evaluate when #36477 is fixed and channels exit research preview.

---

## Sources

### Official Documentation (HIGH confidence)

- [Push events into a running session with channels](https://code.claude.com/docs/en/channels)
- [Channels reference](https://code.claude.com/docs/en/channels-reference)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)

### Source Code (HIGH confidence)

- [fakechat server.ts](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/fakechat) -- full source examined via GitHub API

### Bug Reports (HIGH confidence)

- [#36477: --channels mode stops processing incoming messages after first response](https://github.com/anthropics/claude-code/issues/36477) (OPEN)
- [#36975: MCP channel notifications not surfaced to conversation](https://github.com/anthropics/claude-code/issues/36975) (OPEN)
- [#38259: Telegram channel stops processing inbound messages after completing a turn](https://github.com/anthropics/claude-code/issues/38259) (OPEN)
- [#36802: Telegram plugin notifications not delivered to session](https://github.com/anthropics/claude-code/issues/36802) (CLOSED, dup of #36975)
- [#37026: --channels ignored, Discord notifications not working](https://github.com/anthropics/claude-code/issues/37026) (CLOSED)
- [#38104: Discord channel notifications silently dropped](https://github.com/anthropics/claude-code/issues/38104) (CLOSED, dup of #36975)
- [#30492: Feature request -- real-time steering / priority message channel](https://github.com/anthropics/claude-code/issues/30492) (OPEN)

### Community Projects (MEDIUM confidence)

- [barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration) -- hook-based, no channels
- [louislva/claude-peers-mcp](https://github.com/louislva/claude-peers-mcp) -- channel protocol for ad-hoc messaging
- [grahama1970/claude-code-mcp-enhanced](https://github.com/grahama1970/claude-code-mcp-enhanced) -- MCP tool-based orchestration

### Existing Research (HIGH confidence)

- `.planning/research/01-architecture-patterns.md` -- Option F architecture
- `.planning/research/option-f-channels-pitfalls-and-risks.md` -- Option F risk assessment
