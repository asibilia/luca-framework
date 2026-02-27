---
title: Pi Library Integration — New Output Target & Extensions
area: framework
created: 2026-02-26
source: conversation
scope: full — all three layers (output target, feature extensions, new features)
complexity: CRITICAL
---

## Context

Building out the foundation of the Luca framework to work with the Pi library (https://pi.dev/). Pi is a minimal terminal coding agent by Mario Zechner that prioritizes extensibility via TypeScript extensions. Luca needs to support it as a first-class output target alongside `.claude/` and `.cursor/`.

## Research Completed

### Pi Platform Summary

- **4 built-in tools**: read, write, edit, bash (everything else via extensions)
- **~1,000 token system prompt** (vs Claude Code's ~10K)
- **15+ model providers** (model-agnostic)
- **TypeScript extension model** with full lifecycle hooks (25+ events)
- **No structured rules directory** — uses AGENTS.md for all project instructions (also reads CLAUDE.md)
- **Skills system**: `.pi/skills/` with `SKILL.md` files (frontmatter + markdown body)
- **Session management**: JSONL files with tree-structured branching
- **Package system**: npm-installable bundles of extensions + skills + themes

### Pi Directory Structure

```
.pi/
  settings.json       # Project settings (model, provider, compaction, extensions list)
  extensions/          # TypeScript extension files (*.ts)
  skills/              # Skill directories with SKILL.md
  agents/              # Agent persona definitions (*.md with frontmatter)
  themes/              # Custom theme JSON files
```

Global: `~/.pi/agent/` (settings.json, extensions/, skills/, sessions/, AGENTS.md)

### Key Pi APIs for Extensions

| API                                    | Purpose                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `pi.on(event, handler)`                | Lifecycle hooks (session_start, tool_call, before_agent_start, input, agent_end, etc.) |
| `pi.registerTool({...})`               | Register custom LLM-callable tools with TypeBox schemas                                |
| `pi.registerCommand(name, opts)`       | Register slash commands                                                                |
| `pi.registerShortcut(key, opts)`       | Register keyboard shortcuts                                                            |
| `pi.sendMessage({...})`                | Inject messages into conversation                                                      |
| `pi.setActiveTools([...])`             | Restrict available tools                                                               |
| `pi.appendEntry(key, data)`            | Persist custom data to session                                                         |
| `ctx.ui.setFooter/setWidget/setStatus` | Custom UI rendering                                                                    |
| `ctx.ui.select/confirm/input/custom`   | Interactive dialogs                                                                    |

### Reference Repo Extensions (disler/pi-vs-claude-code)

16 extensions analyzed. Most relevant to Luca:

| Extension           | Luca Mapping                                                           | Priority |
| ------------------- | ---------------------------------------------------------------------- | -------- |
| **damage-control**  | Safety/permissions (YAML rules for command blocking + path access)     | High     |
| **tilldone**        | Task discipline (blocks tools until tasks defined, lifecycle tracking) | High     |
| **subagent-widget** | Sub-agent spawning with live progress widgets                          | High     |
| **agent-team**      | Multi-agent dispatch orchestrator (teams in YAML)                      | High     |
| **cross-agent**     | Cross-platform bridge (scans .claude/.gemini/.codex dirs)              | High     |
| **agent-chain**     | Sequential pipeline orchestrator (output -> next input)                | High     |
| **pi-pi**           | Parallel expert research with domain-specialized subagents             | High     |
| **purpose-gate**    | Session intent declaration + context injection                         | Medium   |
| **system-select**   | Agent persona switching from multiple tool dirs                        | Medium   |
| **tool-counter**    | Rich footer with token/cost stats + per-tool tallies                   | Low      |
| **session-replay**  | Scrollable session history overlay                                     | Low      |
| **theme-cycler**    | Theme switching via keyboard shortcuts                                 | Low      |

### Platform Comparison Matrix

| Luca Feature | Claude Code                                 | Cursor                  | Pi                                   |
| ------------ | ------------------------------------------- | ----------------------- | ------------------------------------ |
| Rules        | `.claude/rules/*.md`                        | `.cursor/rules/*.md`    | AGENTS.md (flat, no dir)             |
| Hooks        | `.claude/hooks/` (shell scripts, 14 events) | `.cursor/hooks.json`    | Extensions (TypeScript, 25+ events)  |
| Skills       | `.claude/skills/`                           | N/A                     | `.pi/skills/` with SKILL.md          |
| Settings     | `.claude/settings.json`                     | `.cursor/settings.json` | `.pi/settings.json`                  |
| Memory       | CLAUDE.md + rules                           | .cursorrules            | AGENTS.md + CLAUDE.md (cross-compat) |
| Custom tools | MCP servers                                 | MCP servers             | `pi.registerTool()` in-process       |
| Sub-agents   | Built-in Task tool                          | N/A                     | Extension-based (subagent-widget)    |
| Safety       | Permission modes (5 levels)                 | IDE-level               | Extension-based (damage-control)     |

---

## Deep Dive: Agent Orchestration Patterns

### Pattern 1: Dispatcher-Only Orchestration (agent-team)

The orchestrating agent has NO codebase tools — only `dispatch_agent`. Forces all work through specialists.

```
Dispatcher (tools: [dispatch_agent] ONLY)
  ├── scout    (tools: read, grep, find, ls)         ← READ-ONLY
  ├── planner  (tools: read, grep, find, ls)         ← READ-ONLY
  ├── builder  (tools: read, write, edit, bash)      ← FULL ACCESS
  ├── reviewer (tools: read, bash, grep)             ← CAN TEST, CAN'T WRITE
  ├── documenter (tools: read, write, edit, grep)    ← CAN WRITE DOCS, NO BASH
  └── red-team (tools: read, bash, grep)             ← SECURITY AUDIT
```

**Implementation**: `pi.setActiveTools(["dispatch_agent"])` at session_start. Teams defined in `.pi/agents/teams.yaml`:

```yaml
full:
  - scout
  - planner
  - builder
  - reviewer
  - documenter
  - red-team

plan-build:
  - planner
  - builder
  - reviewer
```

**Process isolation**: Each dispatched agent is a separate OS process via `spawn("pi", [...])` with `--mode json` for structured event streaming. Results truncated to 8K chars to prevent context overflow.

**Session continuity**: Each agent gets a persistent session file. First dispatch creates it; subsequent dispatches use `-c` flag to continue with full conversation history. Sessions wiped on new parent session.

### Pattern 2: Tool Restriction as Security (Principle of Least Privilege)

| Role       | Can Read | Can Write | Can Execute | Model Tier          | Rationale                      |
| ---------- | -------- | --------- | ----------- | ------------------- | ------------------------------ |
| scout      | Yes      | No        | No          | Small (Haiku/Flash) | Recon only, cheap + fast       |
| planner    | Yes      | No        | No          | Medium (Sonnet)     | Needs reasoning, no tools      |
| builder    | Yes      | Yes       | Yes         | Large (Opus)        | Complex multi-file work        |
| reviewer   | Yes      | No        | Yes (tests) | Medium (Sonnet)     | Analysis + test interpretation |
| documenter | Yes      | Yes       | No          | Medium (Sonnet)     | Write docs, no execution       |
| red-team   | Yes      | No        | Yes         | Medium (Sonnet)     | Security audit, can probe      |
| dispatcher | No       | No        | No          | Medium (Sonnet)     | Coordination only              |

**Key insight**: Match model capability to agent responsibility. Scout doesn't need Opus — Haiku or Gemini Flash is sufficient for read-only summarization. Builder needs the strongest model for complex implementation. This saves significant cost and latency.

### Pattern 3: Task-Gated Work Loop (tilldone)

Agent CANNOT use any tools until tasks are defined. Enforced via `tool_call` event intercept:

```
1. Agent starts → ALL tools blocked except tilldone
2. Agent defines tasks → tools unblocked
3. Agent must toggle a task to "inprogress" before working
4. Only ONE task can be "inprogress" at a time
5. Agent completes turn with incomplete tasks →
   auto-nudge via pi.sendMessage({ triggerTurn: true })
   forces agent to continue working
6. All tasks done → agent must add new tasks or finish
```

**Three-state lifecycle**: idle → inprogress → done (single-active-task enforcement)

**Auto-nudge**: When agent tries to stop with incomplete tasks, `pi.sendMessage()` with `triggerTurn: true` forces another turn. Agent literally cannot give up mid-task.

### Pattern 4: Sequential Pipeline (agent-chain)

Chains defined in YAML. Each step's output becomes the next step's `$INPUT`:

```yaml
plan-build-review:
  description: "Plan, implement, and review"
  steps:
    - agent: planner
      prompt: "Plan the implementation for: $INPUT"
    - agent: builder
      prompt: "Implement the following plan:\n\n$INPUT"
    - agent: reviewer
      prompt: "Review this implementation:\n\n$INPUT"
```

Two template variables: `$INPUT` (previous step's output) and `$ORIGINAL` (user's original prompt, available to all steps).

**Error handling**: Any step failure halts the entire pipeline. Unlike agent-team where the dispatcher can retry.

**Defined chains in reference repo**:

| Chain             | Steps                                | Use Case               |
| ----------------- | ------------------------------------ | ---------------------- |
| plan-build-review | planner → builder → reviewer         | Standard dev cycle     |
| plan-build        | planner → builder                    | Fast, no review        |
| scout-flow        | scout → scout → scout                | Triple-pass deep recon |
| plan-review-plan  | planner → plan-reviewer → planner    | Iterative planning     |
| full-review       | scout → planner → builder → reviewer | End-to-end             |

### Pattern 5: Parallel Expert Research (pi-pi)

Orchestrator + domain-specialized experts running in parallel:

```
User Request
    │
    ▼
Orchestrator (tools: read, write, edit, bash, grep, find, ls, query_experts)
    │
    │ Phase 1: query_experts([
    │   { expert: "ext-expert",    question: "How to register tools?" },
    │   { expert: "tui-expert",    question: "Widget rendering?" },
    │   { expert: "config-expert", question: "Settings format?" },
    │ ])
    │
    ▼
Promise.allSettled → 3 parallel subprocesses (concurrent)
    │
    │  Each expert:
    │  - Spawned as separate pi process (--no-session, --no-extensions)
    │  - Has read-only tools (read, grep, find, ls, bash)
    │  - Fetches live docs from GitHub on every query (curl/firecrawl)
    │  - Streams JSON events for real-time dashboard updates
    │  - Output truncated to 12K chars
    │
    ▼
Combined results returned to orchestrator
    │
    ▼
Orchestrator Phase 2: Synthesizes findings → writes implementation
```

**9 domain experts**: ext-expert, theme-expert, skill-expert, tui-expert, config-expert, cli-expert, agent-expert, keybinding-expert, prompt-expert

**Key design decisions**:

- Experts are ephemeral (`--no-session`) — zero state leakage
- Experts are read-only — only orchestrator writes code (researcher/writer separation)
- All experts launch concurrently via `Promise.allSettled` — one failure doesn't discard others
- Experts fetch fresh docs every invocation — prevents stale knowledge
- Single `query_experts` call with array of all queries — not sequential

### Pattern 6: Background Subagents (subagent-widget)

Unlike agent-team (dispatcher-only), the primary agent keeps its own tools AND can spawn background workers:

```
Primary Agent (full tools + subagent_create/continue/remove/list)
    │
    ├── Subagent #1 (background, tools: read, bash, grep, find, ls)
    │   └── Streams progress → widget dashboard
    │
    ├── Subagent #2 (background, concurrent)
    │   └── On completion → pi.sendMessage({ triggerTurn: true })
    │       → result delivered as follow-up to primary agent
    │
    └── Primary continues working while subagents run
```

**Fire-and-forget async**: Subagents run in background. When done, results are injected as follow-up messages with `triggerTurn: true`, creating an async callback pattern.

**Session persistence**: Each subagent gets a session file. `/subcont` command continues an existing subagent's conversation — the agent remembers previous work.

---

## Implementation Plan — Three Layers

### Layer 1: Output Target (`.pi/` directory generation)

**Goal**: Add Pi as a third compiler output alongside `.claude/` and `.cursor/`.

#### 1a. AGENTS.md Generation

- Compile all Luca rules into a single AGENTS.md file (Pi has no rules directory)
- Merge rules intelligently: group by category, add section headers
- Include project identity from BRAIN.md
- Handle rule priority/ordering

#### 1b. settings.json Generation

- Generate `.pi/settings.json` with project defaults
- Map Luca config to Pi settings (model preferences, compaction, shell path)
- Include extension paths pointing to generated extensions

#### 1c. Skills Compilation

- Convert Luca skills to Pi's SKILL.md format
- Map skill metadata (frontmatter: name, description)
- Preserve skill body content with format adjustments
- Output to `.pi/skills/{skill-name}/SKILL.md`

#### 1d. Extension Generation

- Compile Luca hooks into Pi TypeScript extensions
- Map hook events: pre-commit → tool_call intercept, post-edit → tool_execution_end
- Generate extension boilerplate with proper imports and lifecycle registration

#### 1e. Agent Personas

- Generate `.pi/agents/*.md` files from Luca agent definitions
- Map agent metadata to Pi's frontmatter format (name, description, tools, model)
- Preserve agent system prompts as markdown body
- Include tool restrictions and model tier per agent role

### Layer 2: Luca Feature Extensions (Pi-native Luca integration)

**Goal**: Build Pi extensions that bring Luca's workflow system into Pi.

#### 2a. State Bridge Extension

- Read/write Luca state machine from within Pi
- Register Pi tools: `luca_read_state`, `luca_transition`
- Show state in Pi footer/widget (current phase, plan, complexity)
- Persist state changes via `pi.appendEntry()`

#### 2b. Memory Extension

- Load BRAIN.md at session_start (inject into system prompt via before_agent_start)
- Selective MEMORY.md recall (pattern matching on current task)
- Initialize/update WORKING.md during session
- Learning capture at session_shutdown

#### 2c. Harness Extension

- Hook into agent_end to run verification (test/typecheck/lint/build)
- Use tool_call intercept to enforce pre-commit checks
- Parse harness output and display in widget
- Failure-to-fix loop with configurable iterations

#### 2d. Complexity Gating Extension

- Read complexity from state bridge
- Gate optional steps based on complexity matrix
- Show complexity level in footer
- Allow `/complexity` command to override

### Layer 3: New Cross-Platform Features (inspired by reference repo)

**Goal**: Port innovative Pi patterns into Luca's framework, compiled to all platforms.

#### 3a. Tool-Restricted Agent Roles

- Add `tools` metadata field to Luca agent schema (list of allowed tools per role)
- Add `model_tier` field: small | medium | large (maps to concrete models per provider)
- Compile to: Pi `--tools` flag, Claude Code agent definitions, Cursor agent config
- Enforce principle of least privilege across all platforms

**Model tier mapping**:

| Tier   | Anthropic         | Google         | OpenAI      |
| ------ | ----------------- | -------------- | ----------- |
| small  | claude-haiku-4-5  | gemini-3-flash | gpt-4o-mini |
| medium | claude-sonnet-4-6 | gemini-3-pro   | gpt-4o      |
| large  | claude-opus-4-6   | gemini-3-ultra | o3          |

#### 3b. Dispatcher Pattern (Agent Teams)

- YAML-based team definitions (team name → list of agent roles)
- Dispatcher agent archetype: tools locked to `dispatch_agent` only
- Compile to: Pi extension (setActiveTools + dispatch tool), Claude Code orchestration pattern
- Session management: per-agent persistent sessions, wiped on new parent session

#### 3c. Agent Chains (Sequential Pipelines)

- YAML-based chain definitions (chain name → ordered steps with `$INPUT`/`$ORIGINAL` templates)
- Compile to: Pi extension (run_chain tool), Claude Code multi-step workflow
- Error handling: step failure halts pipeline
- Pre-built chains: plan-build-review, scout-flow, full-review

#### 3d. Task-Gated Work Loops

- Tool-blocking gate: agent must define tasks before using tools
- Three-state lifecycle: idle → inprogress → done (single-active enforcement)
- Auto-nudge: `triggerTurn: true` pattern prevents agent from stopping with incomplete tasks
- Compile to: Pi extension (tool_call intercept), Claude Code hook pattern

#### 3e. Parallel Expert Research

- Domain-specialized expert agents with read-only tools
- `query_experts` tool: launches all experts concurrently via Promise.allSettled
- Ephemeral experts (no session, no extensions) — zero state leakage
- Result aggregation with per-expert truncation (12K chars)
- Researcher/writer separation: experts research, orchestrator writes
- Compile to: Pi extension, Claude Code Task tool parallel pattern

#### 3f. Damage Control (Safety Rules)

- YAML-based safety rule definitions:
  - Dangerous command patterns (regex-based blocking)
  - Path-based access controls (zero-access, read-only, no-delete)
  - Configurable severity: block | ask | warn
- Compile to: Pi extension (tool_call intercept), Claude Code hook (pre-commit), Cursor hook
- Rule file: `.planning/safety-rules.yaml`

#### 3g. Purpose Gating

- Session intent declaration before work begins
- Compile to: Pi extension (session_start dialog), Claude Code hook (session start)
- Inject purpose into system prompt for focused work
- Block prompts until purpose is declared

---

## Phasing

### Phase 1: Foundation (compiler pipeline + output structure)

- Add Pi compiler target to `src/compilers/`
- Generate AGENTS.md from rules
- Generate settings.json from config
- Agent persona files with tool restrictions and model tier
- Verify output structure matches Pi's expectations

### Phase 2: Skills + Extensions Output

- Compile skills to SKILL.md format
- Compile hooks to Pi extension TypeScript
- End-to-end test: Luca compile → Pi loads successfully

### Phase 3: Luca Workflow Extensions

- State bridge extension
- Memory extension (BRAIN.md/MEMORY.md/WORKING.md)
- Harness extension (verification)
- Complexity gating extension

### Phase 4: Agent Orchestration Features

- Tool-restricted agent roles (schema + compilation)
- Dispatcher pattern / agent teams (YAML → extensions)
- Agent chains / sequential pipelines (YAML → extensions)
- Task-gated work loops (tilldone pattern)

### Phase 5: Advanced Features

- Parallel expert research (query_experts pattern)
- Damage control / safety rules (YAML → all platforms)
- Purpose gating (session intent)
- Background subagent spawning

---

## Architectural Decisions

### Process-Level Isolation

All agent orchestration uses separate OS processes (`spawn("pi", ...)`), not in-process function calls. This provides:

- True parallelism (not async within single thread)
- Crash isolation (one agent failure doesn't kill others)
- Clean resource management (each process has own memory)
- Matches Claude Code's Task tool model (separate sub-agents)

### JSON Streaming Protocol

Spawned agents output `message_update` / `text_delta` events on stdout as newline-delimited JSON. This enables real-time progress display and result aggregation.

### Result Truncation

All sub-agent results are truncated before returning to parent agent:

- Agent-team: 8K chars
- Expert research: 12K chars
  This prevents context overflow in the orchestrating agent — maps directly to Luca's quality degradation curve.

### TypeBox vs Zod

Pi uses TypeBox for tool parameter schemas. Luca uses Zod internally. The compiler will need to either:

- Generate TypeBox schemas from Luca's Zod definitions
- Or generate raw JSON Schema (both TypeBox and Zod can produce JSON Schema)

### Researcher/Writer Separation

Expert/scout agents are read-only (cannot modify codebase). Only builder/orchestrator agents can write. This prevents accidental modifications during research and enforces clean architectural boundaries.

---

## Notes

- Pi reads CLAUDE.md for cross-compatibility — existing Luca output partially works already
- Pi's extension model is more powerful than Claude Code hooks (full TypeScript vs shell scripts)
- The reference repo uses Bun as its package manager — aligns with Luca's Bun-first convention
- Pi's `cross-agent` extension pattern validates our multi-platform approach
- Consider contributing Luca's Pi extensions to Pi's package registry (shittycodingagent.ai/packages)
- The auto-nudge pattern (`triggerTurn: true`) is critical for preventing agent abandonment
- Session continuity via `-c` flag enables multi-turn agent conversations within a parent session

## References

- Pi platform: https://pi.dev/
- Pi source: https://github.com/badlogic/pi-mono
- Pi extensions docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Reference repo: https://github.com/disler/pi-vs-claude-code
- Pi blog post: https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- Pi packages: https://shittycodingagent.ai/packages
