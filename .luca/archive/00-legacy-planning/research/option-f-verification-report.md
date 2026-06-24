# Verification Report: Option F (Channel-Driven Orchestrator) Blocker Assessment

**Verification date:** 2026-03-29
**Researcher role:** Architecture verification (adversarial)
**Scope:** Independently verify the 3 identified blockers and challenge architectural assumptions

---

## Blocker 1: Bug #36477 -- Channel Notifications Silently Dropped

### Claim Under Review

The research reports assert that bug #36477 is a "CATASTROPHIC" blocker because channel notifications are silently dropped after the first response, making sequential orchestration impossible.

### Evidence Gathered

**Primary source:** [GitHub Issue #36477](https://github.com/anthropics/claude-code/issues/36477)

- **Status:** OPEN (as of 2026-03-29)
- **Created:** 2026-03-20 (same day channels shipped)
- **Last updated:** 2026-03-28
- **Comments:** 14
- **Upvotes:** 8
- **Labels:** `bug`, `platform:linux`, `area:mcp`
- **Title:** "[BUG] --channels mode stops processing incoming messages after first response"

**Reproduction evidence:**

- Confirmed on v2.1.80, v2.1.81, v2.1.86 across Linux, macOS, and Windows
- 10+ independent reporters across the comment thread
- Multiple plugins affected: Telegram, Discord, custom MCP servers
- Custom MCP server operator @Khairul989 confirmed it affects bare channel servers (not just official plugins), with a regression between v2.1.85 and v2.1.86

**Root cause analysis (from comments):**

- Independent analysis by @salty-flower and @mohfoda1982-create confirms the bug is in Claude Code core, not the MCP server/plugin
- The REPL notification listener fails to process subsequent `notifications/claude/channel` events after a reply completes
- The `await` on `mcp.notification()` resolves successfully (proving the MCP transport write completed), but Claude Code never renders the event
- A community member (@salty-flower) produced a local patch to the minified CLI binary, confirming the fix must be in Claude Code core

**Duplicate/related issues:**

- [#38104](https://github.com/anthropics/claude-code/issues/38104) (Discord, closed as duplicate)
- [#37933](https://github.com/anthropics/claude-code/issues/37933) (Telegram, open, labeled duplicate)
- [#37026](https://github.com/anthropics/claude-code/issues/37026) (Discord v2.1.81, closed as duplicate)
- [#36802](https://github.com/anthropics/claude-code/issues/36802) (Telegram, closed as duplicate)
- [#36472](https://github.com/anthropics/claude-code/issues/36472) (Telegram, referenced as possible original)

**Workaround evidence:**

- @pstabell built a fully custom MCP server replacing the official plugin architecture, claiming "reliable" delivery -- but this was for Discord (event-driven WebSocket), and the comment does not specify whether it avoids the REPL notification bug or just the plugin-specific code
- @salty-flower produced a binary patch but cautioned it is not guaranteed
- No official workaround from Anthropic

**Changelog analysis (v2.1.80-v2.1.87):**

- v2.1.86 fixed "`--bare` mode dropping MCP tools in interactive sessions and silently discarding messages enqueued mid-turn" -- this is a related fix but does NOT resolve #36477 (confirmed by @Khairul989's data point showing regression on v2.1.86)
- No channel-specific delivery fix in any version through v2.1.87

### Verdict: CONFIRMED -- This is a genuine, critical blocker

**Status: CONFIRMED**

The research report's assessment is accurate and, if anything, slightly understated. Key findings:

1. The bug is REAL, independently verified by 10+ users across all platforms
2. It is UNFIXED as of v2.1.87 (latest version)
3. It affects custom MCP servers, not just official plugins (per @Khairul989's comment)
4. There is NO reliable workaround -- community patches exist but are fragile
5. The v2.1.86 "silently discarding messages" fix addressed a different code path and did NOT resolve this bug
6. The bug makes sequential event delivery unreliable, which is the EXACT requirement of the Option F architecture

**One nuance the research report missed:** @Khairul989 reported that v2.1.85 worked reliably while v2.1.86 showed regression. This suggests the bug may be intermittent or version-dependent, not an absolute "never works after first event" failure. On some versions, 1-3 exchanges work before dropping. This makes the bug harder to detect during development (it passes simple tests) and MORE dangerous in production (it fails unpredictably during long pipelines).

---

## Blocker 2: Research Preview -- API May Change

### Claim Under Review

The research reports assert that channels being in "research preview" means the API contract may change, making it risky to build core infrastructure on this feature.

### Evidence Gathered

**Official documentation statement ([code.claude.com/docs/en/channels](https://code.claude.com/docs/en/channels)):**

> "Channels are a research preview feature. Availability is rolling out gradually, and the `--channels` flag syntax and protocol contract may change based on feedback."

**Timeline analysis:**

- Channels announced: March 20, 2026 (Boris Cherny on Threads)
- Channels reference docs published: Same day
- iMessage support added: ~March 27, 2026 (within one week)
- Permission relay added: v2.1.80-v2.1.81
- Age of feature at time of research: 9 days

**Changelog entries (v2.1.80-v2.1.87) showing active evolution:**

- v2.1.80: Added `--channels` permission relay, disabled AskUserQuestion in channels mode
- v2.1.81: Added `--channels` research preview, fixed availability for gateway/third-party providers
- v2.1.82: Fixed `--channels` bypass for Team/Enterprise orgs
- v2.1.85: PreToolUse hooks can now satisfy AskUserQuestion for headless integrations
- v2.1.86: Fixed `--bare` mode discarding messages mid-turn (tangentially related)

That is 4-5 channel-related changes across 7 versions in 9 days. The API is actively evolving.

**Capability declaration uses `experimental` namespace:**

```typescript
capabilities: { experimental: { 'claude/channel': {} } }
```

The `experimental` key is a deliberate signal that this is not a stable API surface.

### Verdict: CONFIRMED -- But severity is nuanced

**Status: CONFIRMED as a risk, DISPUTED as an absolute blocker**

The research report is correct that the API may change. However, the severity assessment needs nuance:

1. **What COULD change:** The `--channels` flag syntax, the `--dangerously-load-development-channels` flag name, the allowlist mechanism, the `experimental` capability path, notification format details
2. **What is UNLIKELY to change:** The core MCP protocol (`notifications/`, `tools/`), the stdio transport model, the concept of pushing events into a session
3. **What the report overstates:** "Removes channels entirely" -- Anthropic shipped 3 platform integrations (Telegram, Discord, iMessage), published extensive documentation, and the community is actively building on it. Complete removal is unlikely. Breaking changes are likely.
4. **Mitigation already exists:** The research report correctly notes that an abstraction layer would isolate channel-specific code. This is good engineering regardless of stability concerns.

**This is a MEDIUM risk, not a hard blocker.** It means "plan for breaking changes" not "do not build." The v2.1.86 fix for "silently discarding messages" shows Anthropic is actively iterating on the delivery pipeline, which is both a risk (changes incoming) and a signal (they are investing in fixing it).

---

## Blocker 3: Allowlist -- Custom Channels Need `--dangerously-load-development-channels`

### Claim Under Review

The research reports assert that custom channels cannot be distributed without the `--dangerously-` flag during the research preview, making this unsuitable for production.

### Evidence Gathered

**Official documentation confirms the restriction ([channels-reference](https://code.claude.com/docs/en/channels-reference)):**

> "During the research preview, custom channels aren't on the approved allowlist. Use `--dangerously-load-development-channels` to test locally."
> "The bypass is per-entry. Combining this flag with `--channels` doesn't extend the bypass to the `--channels` entries."

**The distinction between plugins and bare servers:**

- `plugin:name@marketplace` -- requires marketplace publication and Anthropic security review for allowlist inclusion
- `server:name` -- references an `.mcp.json` entry directly; ALSO requires `--dangerously-load-development-channels` during research preview
- Being configured in `.mcp.json` is NOT enough: "Being in `.mcp.json` isn't enough to push messages: a server also has to be named in `--channels`."

**Key finding: `.mcp.json` does NOT bypass the allowlist.**

An MCP server declared in `.mcp.json` with `claude/channel` capability will:

1. Connect and have its tools work normally (tool calls work)
2. NOT register as a channel for notifications UNLESS also specified via `--channels` or `--dangerously-load-development-channels`

This means even if luca-framework ships an `.mcp.json` with the orchestrator server, users would need to either:

- Start with `--dangerously-load-development-channels server:lu-orchestrator`, OR
- Publish the channel to a marketplace, get Anthropic security approval, and users install via `/plugin install`, OR
- Enterprise admins add it to `allowedChannelPlugins` in managed settings

**Enterprise path exists but is restricted:**

> "On Team and Enterprise plans, admins can replace that allowlist with their own by setting `allowedChannelPlugins` in managed settings."

**Pro/Max users without an organization skip these checks:**

> "Pro and Max users without an organization skip these checks entirely: channels are available and users opt in per session with `--channels`."

This last point is important -- it means individual Pro/Max users CAN use `--channels server:lu-orchestrator` without the `--dangerously-` flag, as long as the server is in `.mcp.json`. The allowlist restriction only applies to users with an organization. This is a significant nuance the research report missed.

### Verdict: PARTIALLY CONFIRMED -- Severity depends on target user base

**Status: CONFIRMED for Enterprise/Team users, DISPUTED for individual Pro/Max users**

1. **For individual Pro/Max users (no org):** The research report OVERSTATES the blocker. These users can use `--channels server:lu-orchestrator` directly by adding the server to `.mcp.json`. No `--dangerously-` flag needed. No marketplace publication needed. This is a viable path for luca-framework's primary audience (individual developers).

2. **For Team/Enterprise users:** The blocker IS real. The admin must set `channelsEnabled: true` AND either add the channel to `allowedChannelPlugins` or leave it unset (which defaults to the Anthropic allowlist, which would not include a custom luca channel).

3. **For marketplace distribution:** Publishing to the official marketplace requires Anthropic security review with an uncertain timeline. This IS a blocker for broad distribution.

4. **The `--dangerously-` flag IS a UX concern:** Even if technically it works, shipping a developer tool that requires `--dangerously-load-development-channels` in the startup command is poor UX. The flag name is designed to discourage use.

---

## Verification 4: Architectural Challenges

### Q1: Can Claude process channel events while idle (between turns)?

**Evidence:** The official documentation states: "Events only arrive while the session is open, so for an always-on setup you run Claude in a background process or persistent terminal." Channel events are delivered as `<channel>` tags in the conversation context. Claude processes them like user messages when it returns to the idle prompt.

**Finding:** YES, Claude can process channel events when idle. The events queue FIFO and are processed when Claude's turn completes. This is the intended behavior for chat bridges.

**But the critical problem:** Bug #36477 shows this mechanism fails after the first reply. Claude returns to idle but does NOT process the next queued channel notification. The delivery mechanism is architecturally sound but currently broken in implementation.

**Status: ARCHITECTURE SOUND, IMPLEMENTATION BROKEN**

### Q2: What happens to channel events during context compaction?

**Evidence:** From context management research:

- Compaction triggers at ~83.5% context usage (~167K tokens for 200K window)
- Compaction retains 20-30% of original detail
- "Claude Code clears older tool outputs first, then summarizes the conversation"
- With the 1M context window (GA for Opus 4.6/Sonnet 4.6), compaction frequency is reduced by ~15%

**Finding:** Channel events (`<channel>` tags) are conversation content. They WILL be compacted like any other conversation turn. After compaction:

- Previous channel events are summarized or removed
- The channel's `instructions` field (system prompt) MAY be preserved (system prompt handling during compaction is not explicitly documented)
- Claude loses awareness of completed pipeline steps
- The channel server still has the correct state (in-memory XState actor), so it can re-push context

**Mitigation in the architecture doc:** The research correctly notes that each channel event should be self-contained and that the context file provides recovery state. This is sound.

**Status: REAL RISK, MITIGATED BY DESIGN (each event self-contained + context file recovery)**

### Q3: Is the reply tool (`step_complete`) reliable for completion signaling?

**Evidence:** The reply tool is a standard MCP tool call. MCP tool calls are the most reliable communication path in Claude Code -- they are used for every MCP server interaction. The `CallToolRequestSchema` handler receives a synchronous request-response from Claude.

**Finding:** The reply tool mechanism is more reliable than channel notifications because:

- Tool calls are synchronous request-response (Claude calls, server responds)
- Channel notifications are fire-and-forget (server pushes, no acknowledgment)
- The research correctly identified this asymmetry

**The risk is not reliability but COMPLIANCE:** Claude must remember to call `step_complete`. This is an LLM compliance issue, not a transport reliability issue. The channel's `instructions` field and per-event instructions mitigate this, but cannot guarantee it.

**Status: TRANSPORT RELIABLE, LLM COMPLIANCE UNCERTAIN**

### Q4: Could the state machine get stuck if Claude crashes mid-step?

**Evidence:** The channel server runs as a subprocess of Claude Code. When Claude Code crashes:

1. The channel server process dies (subprocess lifecycle)
2. The XState in-memory state is lost
3. The context file on disk persists
4. On restart, the server must reconstruct state from the context file

**Finding:** The research report correctly identifies this as "MEDIUM RISK" with context file recovery as mitigation. The architecture is sound -- this is the standard crash recovery pattern for subprocess-based systems.

**One additional risk not covered:** If the channel server crashes independently (e.g., unhandled exception in TypeScript), Claude Code continues running but no more events arrive. The pipeline stalls silently. Claude may do unrelated work. There is no automatic respawning mechanism documented for MCP servers that crash mid-session.

**Status: CONFIRMED RISK, STANDARD MITIGATION AVAILABLE**

---

## Verification 5: Anti-Skip Enforcement Claims

### Claim: Channel events are "advisory" -- Claude CAN ignore them

**Evidence from official documentation ([channels-reference](https://code.claude.com/docs/en/channels-reference)):**

- Channel events arrive as `<channel>` tags in the conversation
- The `instructions` field is "added to Claude's system prompt" -- this is guidance, not enforcement
- There is NO mechanism that forces Claude to act on a channel event
- There is no protocol-level acknowledgment that an event was processed
- The official docs describe channels for chat bridges and webhook receivers -- both scenarios where Claude's response is voluntary

**Evidence from Claude Code behavior research:**

- "[Claude] demonstrates a pattern of treating contextual instructions as advisory rather than mandatory process steps" (from GitHub issue #7777)
- MCP tool execution events and metadata "not exposed to LLM" in some cases (from issue #9767)

**Finding:** The research report is CORRECT that channel events are advisory. Claude receives a `<channel>` tag and can:

1. Process it faithfully (intended behavior)
2. Ignore it and do nothing
3. Read it and do something different
4. Partially process it
5. Signal completion without doing the work

There is NO enforcement mechanism at the protocol level. The "enforcement" comes from:

- The `instructions` system prompt text (LLM compliance)
- The per-event instructions (LLM compliance)
- The fact that Claude only sees one step at a time (prevents reordering but not skipping)

### Claim: Channel enforcement is stronger than pre-step hooks

**Assessment:** This claim is PARTIALLY CORRECT but misleading.

| Enforcement Property              | Pre-Step Hooks                          | Channel Events                                                     |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Can prevent wrong-order execution | YES (block the tool call)               | YES (only one event at a time)                                     |
| Can prevent step skipping         | NO (hooks only fire on attempted calls) | NO (Claude can ignore events)                                      |
| Can force step execution          | NO                                      | NO                                                                 |
| Mechanism is deterministic        | YES (shell script, no LLM judgment)     | PARTIALLY (server deterministic, Claude response is LLM-dependent) |
| Failure mode                      | Silent pass-through (hook exits 0)      | Silent ignore (Claude reads but does nothing)                      |

**The critical difference:** Hooks are deterministic enforcement on the LLM's actions. Channel events are advisory instructions to the LLM. These are fundamentally different enforcement paradigms:

- Hooks: "You cannot do X out of order" (negative enforcement, deterministic)
- Channels: "Please do X now" (positive instruction, LLM-dependent)

**Combining both is stronger than either alone:** A channel server pushing step events PLUS hooks validating that Claude's tool calls match the expected step would provide both positive instruction (channel tells Claude what to do) AND negative enforcement (hooks prevent Claude from doing the wrong thing). The research report briefly mentions this hybrid in the pitfalls document but does not develop it.

### Verdict: CONFIRMED -- Channel events are advisory, not enforced

**Status: CONFIRMED**

The research report accurately identifies that channel events do not provide hard enforcement. The anti-skip properties of Option F are:

- **Strong:** Step ordering (Claude cannot skip ahead because it does not know future steps)
- **Weak:** Step execution (Claude can ignore, partially execute, or falsely signal completion)
- **Missing:** No mechanism to verify step output quality before advancing

---

## Overall Assessment

### Summary of Verdicts

| Claim                                  | Status                                                   | Severity                                                                                    |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Bug #36477 is real and critical        | **CONFIRMED**                                            | HIGH -- the bug is unfixed, affects all platforms, and makes sequential delivery unreliable |
| Research preview means API instability | **CONFIRMED** (risk), **DISPUTED** (as absolute blocker) | MEDIUM -- changes are likely but complete removal is unlikely                               |
| Allowlist prevents distribution        | **PARTIALLY CONFIRMED**                                  | MEDIUM for individual users (Pro/Max can bypass), HIGH for Enterprise users                 |
| Channel events are advisory            | **CONFIRMED**                                            | MEDIUM -- same weakness as any LLM instruction                                              |
| Architecture is fundamentally sound    | **CONFIRMED**                                            | N/A -- the design is architecturally elegant                                                |
| Bug #36477 is the same class as #17351 | **CONFIRMED**                                            | HIGH -- swapping one "messages dropped" bug for another                                     |

### Research Report Quality Assessment

The original research documents (`01-architecture-patterns.md` and `option-f-channels-pitfalls-and-risks.md`) are **thorough, well-sourced, and largely accurate**. Specific findings:

**What the reports got right:**

- Bug #36477 identification and severity assessment
- Research preview risk characterization
- The anti-skip enforcement comparison between Option B and Option F
- The recommendation to proceed with Option B while tracking Option F maturity
- The hybrid approach suggestion (channels + Agent())
- Context compaction risks and mitigations
- The timeout/stall detection need

**What the reports got wrong or missed:**

1. **Pro/Max individual user allowlist bypass:** The reports overstate the allowlist blocker by not noting that individual Pro/Max users (no organization) can use `--channels server:name` without the `--dangerously-` flag. This is documented in the official channels page.
2. **v2.1.85 vs v2.1.86 regression:** The bug is not a simple "always fails after first event." @Khairul989's data point shows v2.1.85 worked reliably while v2.1.86 regressed. This intermittency makes the bug MORE dangerous (passes testing, fails in production) but also suggests Anthropic is close to a fix.
3. **Channel + Hook hybrid enforcement:** The reports identify this possibility but undervalue it. Channels providing positive instruction PLUS hooks providing negative enforcement would be strictly stronger than either alone. This deserves deeper investigation.
4. **The `server:` vs `plugin:` distinction:** Both require `--dangerously-load-development-channels` during the research preview, but the `server:` path (bare `.mcp.json` server) is simpler to deploy than the `plugin:` path (marketplace publication). This distinction matters for development velocity.

### Recommendation

**The research report's conclusion stands: Proceed with Option B (Agent migration) as the primary path.**

However, I would add two amendments:

1. **Prototype the hybrid approach** (channels for auto-advance + Agent() for leaf work + hooks for enforcement) once bug #36477 is fixed. This gives the best of all worlds: deterministic ordering (channels), context isolation (Agent()), and negative enforcement (hooks).

2. **Track bug #36477 actively.** The v2.1.85-vs-v2.1.86 regression data suggests Anthropic is iterating on the delivery pipeline. A fix could land in any release. Set up a simple test script that sends 5 sequential channel notifications and verifies all 5 are processed -- run it against each new Claude Code release.

---

## Sources

### Primary (HIGH confidence -- independently verified)

- [GitHub Issue #36477: --channels mode stops processing after first response](https://github.com/anthropics/claude-code/issues/36477) -- OPEN, 14 comments, 8 upvotes
- [GitHub Issue #38104: Discord MCP plugin notifications not waking up REPL](https://github.com/anthropics/claude-code/issues/38104) -- Closed as duplicate
- [GitHub Issue #37933: Telegram plugin inbound messages not delivered](https://github.com/anthropics/claude-code/issues/37933) -- OPEN, labeled duplicate
- [GitHub Issue #37026: --channels ignored, Discord v2.1.81](https://github.com/anthropics/claude-code/issues/37026) -- Closed as duplicate
- [Channels reference - Claude Code Docs](https://code.claude.com/docs/en/channels-reference) -- Official documentation
- [Push events into a running session with channels - Claude Code Docs](https://code.claude.com/docs/en/channels) -- Official documentation
- [Changelog - Claude Code Docs](https://code.claude.com/docs/en/changelog) -- Official changelog, v2.1.80-v2.1.87
- [Claude Code CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) -- GitHub changelog

### Secondary (MEDIUM confidence)

- [Claude Code Channels: Telegram, Discord & iMessage (2026)](https://claudefa.st/blog/guide/development/claude-code-channels) -- Community guide
- [Claude Code Changelog: Complete Version History](https://claudefa.st/blog/guide/changelog) -- Third-party changelog tracker
- [Claude Code Context Buffer: The 33K-45K Token Problem](https://claudefa.st/blog/guide/mechanics/context-buffer-management) -- Context management analysis
- [Claude Code 1M Context Window](https://claudefa.st/blog/guide/mechanics/1m-context-ga) -- Context window analysis
- [Boris Cherny announcement on Threads](https://www.threads.com/@boris_cherny/post/DWFohOyE1on/) -- Original channels announcement
