# Advanced Patterns & Hidden Systems: Beyond the System Prompt

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** Deeper architectural patterns from Claude Code's public source analysis that extend beyond basic prompt engineering — daemon modes, autonomous agents, gamification, IPC, risk classification, Magic Docs, and more

---

## Executive Summary

Public analysis of Claude Code's architecture (512,000+ lines across ~1,900 files) revealed far more than prompt engineering techniques. It exposed a complete **agent platform architecture** with autonomous daemons, inter-process communication, gamification systems, risk-aware permission models, and self-updating documentation. Many of these patterns represent the next generation of agent harness design and are directly applicable to luca-mastracode's evolution.

This document catalogs advanced patterns not covered (or only lightly touched) in the other research documents in this series.

---

## Table of Contents

1. [KAIROS: Autonomous Daemon Architecture](#1-kairos-autonomous-daemon-architecture)
2. [ULTRAPLAN: Remote Planning Offload](#2-ultraplan-remote-planning-offload)
3. [Daemon Mode & Background Execution](#3-daemon-mode--background-execution)
4. [Magic Docs: Self-Updating Documentation](#4-magic-docs-self-updating-documentation)
5. [The YOLO Risk Classifier](#5-the-yolo-risk-classifier)
6. [Coordinator Mode & Task Protocol](#6-coordinator-mode--task-protocol)
7. [Bridge Mode & Remote Control](#7-bridge-mode--remote-control)
8. [UDS Inbox: Inter-Process Communication](#8-uds-inbox-inter-process-communication)
9. [Frustration Detection & Adaptive Behavior](#9-frustration-detection--adaptive-behavior)
10. [BUDDY: Gamification System](#10-buddy-gamification-system)
11. [Hidden Slash Commands & Progressive Disclosure](#11-hidden-slash-commands--progressive-disclosure)
12. [Feature Flag Architecture](#12-feature-flag-architecture)
13. [WebFetchTool Architecture](#13-webfetchtool-architecture)
14. [Implications for luca-mastracode](#14-implications-for-luca-mastracode)
15. [Sources](#15-sources)

---

## 1. KAIROS: Autonomous Daemon Architecture

KAIROS (from Ancient Greek *kairos* — "the right moment") is an unreleased autonomous agent mode referenced 150+ times in the source. It represents a fundamental shift from **reactive** to **proactive** agent behavior.

### Core Architecture

- **Heartbeat prompts**: Every few seconds, KAIROS receives a `<tick>` prompt asking "anything worth doing right now?"
- **Decision loop**: Evaluates current context and decides whether to act (fix errors, respond to messages, update files, run tasks) or remain idle
- **15-second blocking budget**: Prevents resource monopolization during decision-making
- **Append-only logging**: Daily markdown logs at `~/.claude/.../logs/YYYY/MM/DD.md` create immutable audit trails
- **Two status modes**: `normal` (passive memory consolidation) and `proactive` (autonomous action capability)

### Exclusive Tools

KAIROS has four tools unavailable to regular Claude Code:

| Tool | Purpose |
|---|---|
| `SendUserFile` | Proactive file delivery (send outputs without being asked) |
| `PushNotification` | Device alerts when terminal is closed |
| `SubscribePR` | GitHub PR activity monitoring via webhooks |
| `SleepTool` | Daemon pause/resume control |

### autoDream Consolidation (4-Phase Cycle)

When triggered (after 24+ hours or 5+ sessions, gated by file-based advisory lock):

1. **Orient**: Scans recent session logs to establish context
2. **Gather Signal**: Extracts relevant patterns, decisions, and insights
3. **Consolidate**: Compresses into durable memory (<25KB output target)
4. **Prune**: Removes noise while preserving high-value insights, updates MEMORY.md index

Each phase has a 15-second blocking budget. If threshold is exceeded, the process auto-backgrounds to avoid impacting user experience.

### Architectural Insight for luca-mastracode

The separation of **initiative** from **execution** is the key pattern. Regular Claude Code only acts when prompted; KAIROS introduces proactive decision-making with bounded resource consumption. For luca-mastracode, this pattern could enable:

- Background monitoring of CI/CD pipelines with autonomous fix attempts
- Proactive MuninnDB consolidation during idle periods
- Autonomous research continuation when context allows

---

## 2. ULTRAPLAN: Remote Planning Offload

ULTRAPLAN offloads complex planning to a **remote Cloud Container Runtime (CCR) session running Opus 4.6** for up to 30 minutes — far beyond the latency tolerance of interactive sessions.

### Execution Flow

1. User triggers via `/ultraplan` slash command
2. Remote Opus 4.6 session spawns in CCR with full planning context
3. Local terminal polls every 3 seconds for updates
4. Browser-based review interface shows plan in real-time for approval/rejection
5. On approval, a special sentinel value `ULTRAPLAN_TELEPORT_LOCAL` "teleports" the result back to the local terminal
6. Remote session archives; plan executes locally in working directory

### Architectural Insight

The pattern of **async planning with sync execution** is powerful. The planning phase (which benefits most from deep reasoning) gets unlimited time on a capable model, while execution remains local and interactive. For luca-mastracode, this maps to:

- Offloading COMPLEX+ planning to a background Opus session via the lu-planner subagent
- Async plan generation with user approval before execution begins
- Remote model routing for planning-heavy phases without blocking the interactive session

---

## 3. Daemon Mode & Background Execution

Daemon mode enables persistent background Claude sessions running in tmux:

```bash
claude --bg <prompt>        # Spawn persistent background session
claude daemon ps            # List active sessions
claude daemon logs <id>     # View output
claude daemon attach <id>   # Reconnect to session
claude daemon kill <id>     # Terminate session
```

This is partially shipped and already functional. It enables:

- Long-running tasks that survive terminal disconnection
- Multiple concurrent Claude sessions
- Background research while interactive sessions continue

### Architectural Insight

The tmux-based approach is pragmatic — it leverages existing terminal multiplexing rather than building custom process management. For luca-mastracode, background execution could enable parallel phase execution or long-running verification.

---

## 4. Magic Docs: Self-Updating Documentation

A pattern for **documentation that stays current automatically**:

1. Anthropic employees create files with a `MAGIC DOC` header
2. When an internal build of Claude Code is **idle**, it detects these files
3. A dedicated subagent spawns, **scoped to editing that single file only**
4. The subagent reads the file, updates documentation for the specified feature, and writes it back
5. No other files or systems are accessible to the subagent

### Key Design Decisions

- **Idle-triggered**: Documentation updates happen during downtime, never competing with user work
- **Single-file scope**: The subagent cannot modify anything beyond the target document, preventing unintended side effects
- **Self-contained**: The file itself declares what feature it documents
- **No human coordination**: No one needs to remember to update docs

### Architectural Insight for luca-mastracode

This pattern is directly applicable to keeping `.planning/` artifacts current:

- Phase summaries could auto-update during idle periods
- ROADMAP.md could be refreshed when milestones are completed
- Research documents could be enriched with new findings automatically
- The single-file scoping prevents the "cleanup agent" from making unintended changes

---

## 5. The YOLO Risk Classifier

Claude Code's permission system uses a risk-level classifier (internally called "YOLO classifier") that auto-classifies operations:

| Risk Level | Behavior | Example Operations |
|---|---|---|
| LOW | Automatic approval, no user confirmation | Read files, list directories, run tests |
| MEDIUM | Prompt user for confirmation | Edit files, install packages |
| HIGH | Always require explicit confirmation | Delete files, force-push, run arbitrary scripts |

### Implementation Approach

Rather than a static allowlist, Claude Code uses the **critic pattern**: a separate model query evaluates "Is this command safe?" considering:

- The specific command and its arguments
- The current working directory context
- The inferred user intent
- Historical permission decisions

This produces **adaptive, context-aware security** rather than brittle static rules.

### Architectural Insight for luca-mastracode

luca-mastracode's `createScopedTool` currently uses a static permission manifest (`MODE_PERMISSIONS`). The critic pattern could augment this:

- Static manifest for the base allowlist (fast, no API call)
- Critic query for edge cases the manifest doesn't cover
- Historical permission patterns inform future auto-approvals
- Risk classification enables a "speed mode" that auto-approves LOW-risk operations

---

## 6. Coordinator Mode & Task Protocol

The coordinator mode reveals how Claude Code orchestrates multiple worker agents:

### Architecture

- One Claude instance acts as **coordinator**
- Workers spawn with **isolated scratch directories** via `tengu_scratch`
- Communication uses XML-based `<task-notification>` messages
- Coordinator has a 4-phase workflow: **Research -> Specification -> Implementation -> Verification**

### Task Notification Protocol

```xml
<task-notification>
  <task-id>a32db9d847e8411e2</task-id>
  <status>completed</status>
  <summary>Agent "Research: cache boundary" completed</summary>
  <result>...</result>
  <usage>
    <total_tokens>88560</total_tokens>
    <tool_uses>28</tool_uses>
    <duration_ms>328535</duration_ms>
  </usage>
</task-notification>
```

### Key Coordinator Prompt Directives

- "Do not rubber-stamp weak work"
- "Never write 'based on your findings' — that pushes synthesis onto the worker"
- "Never hand off understanding to another worker"
- Workers must self-compress results before returning to coordinator

### Activation

Environment variable: `CLAUDE_CODE_COORDINATOR_MODE=1`

### Architectural Insight for luca-mastracode

The coordinator pattern maps directly to luca's lu-executor orchestrating subagents. Key adoptable patterns:

- **Structured task notifications** with token usage and duration tracking
- **Isolated scratch directories** per subagent to prevent file conflicts
- **Self-compression requirement** — workers summarize their own output before returning
- **Active synthesis** — coordinator must understand results, not just relay them

---

## 7. Bridge Mode & Remote Control

Bridge Mode enables remote control of Claude Code from mobile/browser devices:

```
POST /v1/environments/bridge  →  WebSocket upgrade
```

### Control Messages

| Message | Purpose |
|---|---|
| `initialize` | Set up remote session |
| `set_model` | Change active model remotely |
| `can_use_tool` | Permission approval from remote device |

### Use Case

A daemon running on a workstation can be monitored and controlled from a phone. Permission prompts (e.g., "Should I delete this file?") are forwarded to the mobile device for approval.

### Architectural Insight

For luca-mastracode, a bridge pattern could enable:

- Monitoring phase execution from mobile
- Approving oversight checkpoints remotely
- Viewing pipeline progress without terminal access

---

## 8. UDS Inbox: Inter-Process Communication

Unix Domain Socket (UDS) layer enabling agent-to-agent messaging:

- **Socket location**: `~/.claude/sessions/`
- **Addressing**: Local paths (`uds:/.../sock`) and remote endpoints (`bridge:...`)
- **Discovery**: `ListPeersTool` enables instance discovery for multi-agent coordination

### Architectural Insight

This is the plumbing for multi-agent systems. luca-mastracode's subagents currently communicate through the orchestrator (hub-and-spoke). UDS-style IPC would enable:

- Direct subagent-to-subagent communication (mesh topology)
- Instance discovery for parallel subagent coordination
- Session handoff between agents without context loss

---

## 9. Frustration Detection & Adaptive Behavior

Claude Code implements **regex-based frustration detection** via `userPromptKeywords.ts`:

### Patterns Monitored

- Profanity and expletives
- Excessive punctuation (!!!, ???)
- Ellipsis overuse (...)
- Explicit frustration phrases ("this sucks", "doesn't work", "broken")

### Behavioral Modifications

When frustration is detected, Claude Code adapts:

- **Tone modulation**: More empathetic, less verbose
- **Simplified solutions**: Offer direct fixes rather than explanations
- **Increased verbosity on errors**: More detail about what went wrong

### Why Regex Over Inference

Regex is **instant** (no API call) and **deterministic** (no model variance). For detecting frustration — a binary signal that doesn't require nuanced understanding — regex is faster and cheaper than inference-based sentiment analysis.

### Architectural Insight for luca-mastracode

This pattern is lightweight and high-impact:

- Detect user frustration in triage/discussion modes
- Adjust oversight mode (more confirmations when frustrated = less trust in agent)
- Switch to more cautious execution (smaller changes, more verification) when user is frustrated
- No model call needed — pure regex on user input

---

## 10. BUDDY: Gamification System

An unreleased gamification system with pet mechanics:

### Specifications

- **18 species**: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk
- **6 rarity tiers**: Common (60%), Uncommon (25%), Rare (10%), Epic (4%), Legendary (1%), Shiny (1%)
- **Per-pet stats**: Debugging, Patience, Chaos, Wisdom, Snark
- **Animation**: 500ms sprite ticks with 10-second speech bubbles
- **Target launch**: May 2026

### Architectural Insight

While gamification isn't directly relevant to luca-mastracode's technical goals, the concept of **making developer tools engaging** is worth noting. The stat system (Debugging, Patience, etc.) could inspire visibility into agent performance characteristics.

---

## 11. Hidden Slash Commands & Progressive Disclosure

26 slash commands discovered, many gated behind feature flags:

### Always Available

| Command | Purpose |
|---|---|
| `/ctx-viz` | Context window usage visualization |
| `/btw` | Side questions without derailing main thread |
| `/env` | Environment info and active flag display |
| `/version` | Detailed version/build metadata |

### Feature-Gated

| Command | Purpose | Gate |
|---|---|---|
| `/ultraplan` | Cloud planning trigger | ULTRAPLAN flag |
| `/dream` | Manual KAIROS consolidation | KAIROS flag |
| `/subscribe-pr` | PR activity subscription | KAIROS flag |
| `/autofix-pr` | Automated PR fixes | Feature flag |
| `/bughunter` | Automated bug discovery | Feature flag |

### Architectural Insight

The `/btw` command is particularly clever — it allows side questions without derailing the main thread context. For luca-mastracode, this could enable:

- Quick clarifications during phase execution without resetting context
- Metadata queries (complexity level, budget remaining) that don't affect the main workflow
- A clean separation between "operational" and "meta" interactions

---

## 12. Feature Flag Architecture

### Scale

- **44 total feature flags** (previously reported)
- **32 build-time flags** (baked at compile, not runtime toggleable)
- **Runtime flags** via GrowthBook for progressive rollout

### Default States

**OFF by default** (unreleased):
- KAIROS, ULTRAPLAN, COORDINATOR_MODE, BUDDY, VOICE_MODE, WEB_BROWSER, PROACTIVE, UDS_INBOX, TEMPLATES

**ON by default** (shipped or partially shipped):
- BRIDGE_MODE (partial), DAEMON, BG_SESSIONS

### Key Implementation Pattern

Build-time flags enable **dead-code elimination** — features that are OFF don't exist in the compiled output at all. This is why the public npm package doesn't contain KAIROS logic; it's compiled out entirely for external builds.

The combination of build-time (security-critical) and runtime (rollout) flags provides two layers:

1. **Build-time**: Ensures internal-only features never ship externally
2. **Runtime (GrowthBook)**: Enables gradual rollout to internal users and beta testers

### Architectural Insight for luca-mastracode

luca-mastracode already has feature gates in `config.json`. The key patterns to adopt:

- **Build-time elimination** for internal-only features (dev tooling, debug modes)
- **Runtime flags** for gradual feature rollout across complexity levels
- **Progressive disclosure** of slash commands based on feature readiness

---

## 13. WebFetchTool Architecture

The WebFetchTool spans 1,173 lines and reveals sophisticated web interaction patterns:

- **Domain whitelisting**: Controlled access to external domains
- **Server-side blacklisting**: 5-minute cache for blocked domains
- **Redirect sandboxing**: Prevents open redirect exploits
- **Haiku-based summarization**: Uses a fast, cheap model to summarize fetched content
- **Copyright protection**: Mechanisms to avoid reproducing copyrighted content
- **15-minute self-cleaning cache**: Reduces repeated requests to same URLs

### Architectural Insight

The pattern of using a **cheap model (Haiku) to summarize web content** before injecting it into the main context is extremely token-efficient. Rather than loading full web pages into an Opus context window, Haiku extracts the relevant information at a fraction of the cost.

For luca-mastracode's research phases, this pattern could reduce research token costs significantly.

---

## 14. Implications for luca-mastracode

### Tier 1: Directly Adoptable Now

| Pattern | Source | Effort | Impact |
|---|---|---|---|
| Magic Docs for `.planning/` auto-updates | KAIROS/Magic Docs | 3-4h | Keeps planning artifacts current |
| Frustration detection regex | userPromptKeywords.ts | 2h | Adaptive behavior in triage/discuss |
| `/btw`-style side queries | Slash commands | 2-3h | Clean meta-interaction separation |
| Risk classification (LOW/MED/HIGH) | YOLO classifier | 4-6h | Context-aware tool permissions |
| Self-compression for subagent returns | Coordinator mode | 2-3h | Reduced context consumption |

### Tier 2: Requires Architecture Changes

| Pattern | Source | Effort | Impact |
|---|---|---|---|
| Structured task notification protocol | Coordinator mode | 4-6h | Better subagent monitoring |
| Isolated scratch directories per subagent | tengu_scratch | 3-4h | Prevents file conflicts |
| Haiku-based content summarization | WebFetchTool | 6-8h | Cheaper research phases |
| Build-time feature flag elimination | Flag architecture | 4-6h | Clean internal/external builds |

### Tier 3: Future Vision

| Pattern | Source | Effort | Impact |
|---|---|---|---|
| KAIROS-style autonomous daemon | KAIROS | 20-30h | Proactive agent behavior |
| ULTRAPLAN-style remote planning | ULTRAPLAN | 15-20h | Unbounded planning time |
| UDS-based inter-agent IPC | UDS Inbox | 10-15h | Mesh agent communication |
| Bridge mode for remote monitoring | Bridge | 15-20h | Mobile oversight |

---

## 15. Sources

### Primary Analysis Articles

- [Diving into Claude Code's Source Code](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code) — Engineer's Codex deep dive
- [Everything in Claude Code's Architecture: KAIROS, ULTRAPLAN, Buddy and More](https://techsy.io/blog/claude-code-leaked-features-2026) — Comprehensive feature inventory
- [Claude Code Architecture: Everything Found](https://claudefa.st/blog/guide/mechanics/claude-code-source-leak) — Complete architectural analysis
- [Claude Code Internals: fake tools, frustration regexes, undercover mode](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/) — Security-focused analysis

### Curated Resource Lists

- [Awesome Claude Code Insights](https://github.com/nblintao/awesome-claude-code-postleak-insights) — Curated list of high-signal architecture analyses
- [Claude Code Technical Autopsy](https://github.com/0PeterAdel/ClaudeCode-Leak) — Comprehensive technical autopsy and archival index

### Specific Deep Dives

- [How an AI Reads the Web: Claude Code's WebFetchTool](https://medium.com/@nblintao/how-an-ai-reads-the-web-a-deep-dive-into-claude-codes-webfetchtool-0abee4446343) — WebFetchTool architecture analysis
- [Claude Code: Production AI Architecture Patterns](https://discuss.huggingface.co/t/claude-code-source-leak-production-ai-architecture-patterns-from-512-000-lines/174846) — Three-layer compression pipeline analysis
- [Inside Claude Code: swarms, daemons, and 44 features](https://thenewstack.io/claude-code-source-leak/) — The New Stack coverage
- [Claude Code Hidden Features: Full List](https://wavespeed.ai/blog/posts/claude-code-hidden-features-leaked-source-2026/) — WaveSpeedAI feature inventory

### News & Commentary

- [Claude Code Architecture Analysis](https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know) — VentureBeat coverage
- [Claude Code Source: Available for 13 Months](https://thehuman2ai.com/blog/claude-code-source-leak) — Security impact analysis
- [Anthropic Claude Code Security Assessment](https://www.zscaler.com/blogs/security-research/anthropic-claude-code-leak) — Zscaler ThreatLabz assessment
