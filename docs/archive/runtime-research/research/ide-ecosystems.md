# IDE Agent Ecosystems and Extension Models (2026)

**Researched:** 2026-03-23
**Overall confidence:** HIGH (primary sources from official docs, cross-referenced with multiple credible sources)

## Executive Summary

The AI coding IDE landscape in 2026 has converged on remarkably similar extension models across all major players. Every significant IDE now supports: (1) markdown-based rules/instructions, (2) skills or agent profiles as on-demand knowledge, (3) lifecycle hooks for deterministic automation, and (4) MCP (Model Context Protocol) as the universal tool integration layer.

The most critical finding for Luca's adapter architecture: **MCP has achieved universal adoption across all major IDEs** (Claude Code, Cursor, Windsurf, VS Code/Copilot, Zed). However, MCP only covers the _tool integration_ layer -- it does not standardize rules, skills, hooks, or agent definitions. Each IDE has its own format for these. This means Luca needs both per-IDE artifact compilers (for rules/skills/hooks) AND can leverage MCP as a shared tool layer.

Claude Code remains the most extensible platform with the deepest hook system. Cursor has rapidly converged toward feature parity. VS Code/Copilot is aggressively adopting the same patterns (including explicit Claude Code compatibility). Windsurf is the least extensible but has the simplest model. The market is consolidating around Claude Code as the developer favorite (46% "most loved"), with GitHub Copilot dominating enterprise (90% Fortune 100), and Cursor holding the paying-user crown ($2B ARR).

---

## Per-IDE Detailed Breakdown

### 1. Claude Code (Anthropic)

**Confidence:** HIGH (official docs + extensive community documentation)

#### Directory Structure

```
.claude/
  settings.json          # Project-level settings, permissions, hook configs
  settings.local.json    # Personal overrides (gitignored)
  agents/                # Custom agent personas (.md files)
  skills/                # Reusable knowledge modules (SKILL.md in subdirs)
  commands/              # Slash command automation
  hooks/                 # Event-driven shell scripts
  rules/                 # Custom rule files (.md)
~/.claude/
  settings.json          # Global user settings
  skills/                # Global skills
  rules/                 # Global rules
  CLAUDE.md              # Global instructions
```

Plus `CLAUDE.md` in the project root for always-on project context.

#### Rules Format

- **Format:** Plain Markdown (`.md`) files in `.claude/rules/`
- **Frontmatter:** Not required -- rules are loaded based on settings.json configuration
- **Scope:** Project rules in `.claude/rules/`, global rules in `~/.claude/rules/`
- **Application:** Rules are included in model context at session start

#### Skills Format

- **Format:** `SKILL.md` files in subdirectories of `.claude/skills/`
- **Invocation:** Slash commands (`/skill-name`) or natural language matching
- **Scope:** Project skills (`.claude/skills/`) and global skills (`~/.claude/skills/`)
- **Content:** Markdown instructions, can reference other files, include examples

#### Hooks System (Most Mature)

As of March 2026, Claude Code has the most comprehensive hook system with **12+ lifecycle events**:

| Event              | Timing              | Blocking             | Use Case                     |
| ------------------ | ------------------- | -------------------- | ---------------------------- |
| `SessionStart`     | Session begins      | No (fire-and-forget) | Load context, set env vars   |
| `SessionEnd`       | Session ends        | No                   | Cleanup, logging             |
| `PreToolUse`       | Before tool call    | Yes (can block)      | Validate/block dangerous ops |
| `PostToolUse`      | After tool succeeds | Yes                  | Auto-format, lint            |
| `Stop`             | Agent finishes      | Yes                  | Final checks                 |
| `SubagentStop`     | Subagent completes  | No                   | Aggregate results            |
| `Notification`     | Alert generated     | No                   | Route to Slack, desktop      |
| `UserPromptSubmit` | User sends prompt   | Yes                  | Audit, inject context        |

**Handler types:** Command (shell), Prompt (LLM evaluation), Agent (subagent with tools)

**Configuration:** JSON in `settings.json` under `hooks` key, with matcher patterns for filtering.

#### MCP Integration

- **Status:** First-class, deeply integrated
- **Configuration:** In `settings.json` under `mcpServers`
- **Capabilities:** Full MCP client -- tools, resources, prompts
- **Note:** MCP was created by Anthropic; Claude Code is the reference implementation

#### Claude Agent SDK

The Claude Code SDK was renamed to the **Claude Agent SDK** in 2026. It exposes the same tools, agent loop, and context management that power Claude Code as a programmable library (TypeScript and Python). This is significant for Luca because the Agent SDK could potentially be used to build IDE-agnostic agent infrastructure.

#### Extensibility Rating: 10/10

Deepest hook system, most flexible rules, mature skills, native MCP. The reference platform for AI coding extensibility.

---

### 2. Cursor

**Confidence:** HIGH (official docs confirmed via WebFetch)

#### Directory Structure

```
.cursor/
  rules/                 # Rule files (.md or .mdc)
  hooks.json             # Hook configuration
  skills/                # Skills (SKILL.md in subdirs) -- nightly only
~/.cursor/
  rules/                 # Global rules
  hooks.json             # Global hooks
.cursorrules             # Legacy (deprecated, migrate to .cursor/rules/)
AGENTS.md                # Alternative to rules (simpler format)
```

#### Rules Format

- **Format:** Markdown (`.md`) or MDC (`.mdc`) with YAML frontmatter
- **Frontmatter fields:**
  - `description`: Rule purpose (required for intelligent application)
  - `globs`: File patterns for auto-attachment
  - `alwaysApply`: Boolean for universal application
- **Rule types:**
  1. **Always Apply** -- every chat session
  2. **Apply Intelligently** -- agent decides based on description
  3. **Apply to Specific Files** -- triggered by glob match
  4. **Apply Manually** -- requires `@rule-name` mention
- **Precedence:** Team Rules > Project Rules > User Rules

#### Skills Format

- **Status:** Nightly release channel only (as of March 2026)
- **Format:** `SKILL.md` files in `.cursor/skills/` subdirectories
- **Invocation:** Slash commands or auto-loaded by agent when relevant
- **Difference from rules:** Skills are loaded dynamically on-demand; rules are always included

#### Hooks System

Introduced in Cursor 1.7, now comprehensive:

| Event                                               | Type            | Blocking             |
| --------------------------------------------------- | --------------- | -------------------- |
| `sessionStart` / `sessionEnd`                       | Session         | No (fire-and-forget) |
| `preToolUse` / `postToolUse` / `postToolUseFailure` | Tool            | Yes                  |
| `subagentStart` / `subagentStop`                    | Subagent        | Yes                  |
| `beforeShellExecution` / `afterShellExecution`      | Shell           | Yes                  |
| `beforeMCPExecution` / `afterMCPExecution`          | MCP             | Yes                  |
| `beforeReadFile` / `afterFileEdit`                  | File            | Yes                  |
| `beforeSubmitPrompt`                                | Prompt          | Yes                  |
| `preCompact`                                        | Context         | No (observational)   |
| `stop` / `afterAgentResponse` / `afterAgentThought` | Completion      | Yes                  |
| `beforeTabFileRead` / `afterTabFileEdit`            | Tab completions | Yes                  |

**Configuration:** JSON in `.cursor/hooks.json`

**Critical compatibility note:** Cursor hooks use the **same JSON stdio protocol as Claude Code**. Exit code `2` = block (same semantics). Environment variables include `CLAUDE_PROJECT_DIR` as a compatibility alias. This is a deliberate convergence.

#### MCP Integration

- **Status:** Full support, including cloud agents
- **Configuration:** In Cursor settings or project config
- **Notable:** 30+ partner MCP plugins available
- **Cloud agents:** Can use MCP servers when triggered via automations

#### Extensibility Rating: 8/10

Rapidly converging toward Claude Code feature parity. The explicit Claude Code compatibility in hooks is a strong signal. Skills still in nightly.

---

### 3. Windsurf (Codeium / Cognition)

**Confidence:** MEDIUM (docs confirmed, but acquisition by Cognition creates uncertainty)

#### Directory Structure

```
.windsurf/
  rules/                 # Rule files (.md)
  workflows/             # Workflow automation (.md)
~/.codeium/windsurf/
  global_workflows/      # Global workflows
.windsurfrules           # Legacy single-file rules (still supported)
```

#### Rules Format

- **Format:** Plain Markdown (`.md`) -- no special frontmatter, no `.mdc`
- **Rule types:**
  1. **Always On** -- always applied
  2. **Model Decision** -- AI decides based on description
  3. **Manual** -- activated via `@mention`
  4. **Auto Attached** -- triggered by glob patterns (added recently)
- **Character limits:** 6,000 chars per rule file, 12,000 total combined
- **Scope:** Global rules + workspace rules in `.windsurf/rules/`

#### Workflows (Instead of Skills)

Windsurf uses **Workflows** instead of Skills:

- **Format:** Markdown files with title, description, numbered steps
- **Invocation:** Manual only via slash commands (`/workflow-name`)
- **Character limit:** 12,000 chars per workflow
- **Key difference:** Cascade **never** auto-invokes workflows (manual-only)
- **Nesting:** Workflows can call other workflows
- **Precedence:** System > Workspace > Global > Built-in

#### Hooks System

- **Status:** Enterprise-only feature (Cascade Hooks)
- **Events:** Model response hooks, user prompt hooks, post-setup worktree hooks
- **Primary use:** Audit logging, policy enforcement
- **Availability:** Limited compared to Claude Code and Cursor

#### MCP Integration

- **Status:** Supported
- **Configuration:** Via Windsurf Settings or `mcpServers` config
- **Use cases:** Database queries, GitHub, API testing, browser automation

#### Acquisition Impact

Cognition AI (Devin) acquired Windsurf for ~$250M. As of March 2026, the two products remain largely separate. Windsurf had $82M ARR and 350+ enterprise customers at acquisition time. Future direction uncertain -- may merge with Devin's autonomous agent capabilities.

#### Extensibility Rating: 5/10

Simplest model, good for basic customization. Enterprise hooks are limited. The Cognition acquisition adds strategic uncertainty. Character limits are restrictive for complex rule sets.

---

### 4. VS Code / GitHub Copilot

**Confidence:** HIGH (official VS Code and GitHub docs confirmed via WebFetch)

#### Directory Structure

```
.github/
  agents/                # Custom agent profiles (.agent.md)
  skills/                # Agent skills (SKILL.md in subdirs)
  hooks/                 # Hook configuration (*.json)
  copilot-instructions.md # Global Copilot instructions
.claude/
  agents/                # Claude-compatible agent format (auto-detected!)
  settings.json          # Claude-compatible settings
~/.copilot/
  agents/                # Global user agents
  skills/                # Global user skills
  hooks/                 # Global user hooks
```

**Critical finding:** VS Code now reads `.claude/agents/` and `.claude/settings.json` natively, mapping Claude tool names to VS Code equivalents. This is explicit cross-platform compatibility.

#### Agent Profiles (Instead of Rules)

- **Format:** `.agent.md` files with YAML frontmatter
- **Frontmatter fields:**
  - `name`: Agent identifier
  - `description`: Purpose (required)
  - `tools`: Available tools array (supports `["*"]` or specific names)
  - `mcp-servers`: MCP server configurations
  - `model`: LLM model specification
  - `target`: `vscode` or `github-copilot`
  - `user-invocable`: Boolean (default true)
  - `disable-model-invocation`: Boolean (default false)
  - `handoffs`: Sequential workflow transitions between agents
  - `hooks`: Agent-scoped hook commands (Preview)
  - `agents`: Accessible subagents
  - `metadata`: Key-value annotations
- **Precedence:** Repository > Organization > Enterprise
- **Body:** Markdown instructions (max 30,000 chars)

#### Custom Instructions

- **Format:** `.github/copilot-instructions.md` -- simple markdown
- **Scope:** Workspace-level, automatically detected
- **Application:** Applied to all chat requests in the workspace

#### Skills Format

- **Format:** `SKILL.md` with YAML frontmatter in `.github/skills/skill-name/`
- **Frontmatter:**
  - `name`: Unique identifier (lowercase, hyphens, max 64 chars)
  - `description`: What the skill does and when to use it (max 1024 chars)
  - `argument-hint`: Slash command hint
  - `user-invocable`: Boolean
  - `disable-model-invocation`: Boolean
- **Invocation:** Slash commands (`/skill-name`) or auto-loaded by Copilot
- **Progressive loading:** Metadata first, then instructions, then resources
- **Cross-platform:** Works in VS Code, Copilot CLI, and coding agent
- **Open standard:** agentskills.io

#### Hooks System (Preview)

Eight lifecycle events, closely mirroring Claude Code:

| Event              | Blocking | Notes                   |
| ------------------ | -------- | ----------------------- |
| `SessionStart`     | No       | Initialize resources    |
| `UserPromptSubmit` | Yes      | Audit, inject context   |
| `PreToolUse`       | Yes      | Block/modify operations |
| `PostToolUse`      | Yes      | Format, log results     |
| `PreCompact`       | No       | Export state            |
| `SubagentStart`    | Yes      | Track nested agents     |
| `SubagentStop`     | Yes      | Aggregate results       |
| `Stop`             | Yes      | Final checks            |

**Configuration:** `.github/hooks/*.json` or `.claude/settings.json` (Claude compatibility)

**Claude Code compatibility notes:**

- VS Code reads `.claude/settings.json` hook configs
- Tool input property names differ (Claude: `snake_case`, VS Code: `camelCase`)
- Tool names differ (Claude: `Write`/`Edit`, VS Code: `create_file`/`replace_string_in_file`)
- Matchers are parsed but not applied (all hooks run regardless of tool name -- as of current preview)

#### MCP Integration

- **Status:** Full support on all Copilot plans (including free tier)
- **Configuration:** In agent profiles via `mcp-servers` frontmatter or VS Code settings
- **Notable:** MCP server sandboxing added in VS Code 1.112 (March 2026)

#### Copilot Coding Agent (GitHub-side)

Separate from VS Code agent mode. Runs autonomously in GitHub Actions environment, creates PRs from issues. Custom agents via `.github/agents/` directory also work here.

#### Extensibility Rating: 8/10

Rapidly catching up. The explicit Claude Code compatibility is remarkable -- VS Code is deliberately making it easy to use Claude Code configurations. Skills as an open standard (agentskills.io) is forward-looking.

---

### 5. Zed

**Confidence:** MEDIUM (official docs, but smaller ecosystem)

#### Configuration

- **Rules:** No dedicated rules system like the others; context is managed through agent profiles
- **Agent profiles:** Three built-in (Write, Ask, Minimal) with tool permission customization
- **MCP:** Full support via `context_servers` in settings
- **Tool permissions:** `always_allow`, `always_deny`, `always_confirm` patterns
- **Hooks:** Not documented as a separate system

#### MCP Integration

- **Status:** Primary extensibility mechanism
- **Configuration:** `context_servers` in Zed settings
- **Multiple servers:** Supported, tools aggregated in Agent Panel
- **Significance:** MCP is the _only_ way to give Zed's agent external tool access

#### Extensibility Rating: 4/10

Lean, fast, but limited extensibility. MCP is the main extension point. No skills, no hooks, no rules directory. Good for developers who want speed over customization.

---

## IDE Comparison Matrix

| Capability           | Claude Code                 | Cursor                               | Windsurf                                | VS Code/Copilot                                    | Zed                        |
| -------------------- | --------------------------- | ------------------------------------ | --------------------------------------- | -------------------------------------------------- | -------------------------- |
| **Rules format**     | `.md` in `.claude/rules/`   | `.md`/`.mdc` in `.cursor/rules/`     | `.md` in `.windsurf/rules/`             | `.github/copilot-instructions.md` + agent profiles | None (agent profiles only) |
| **Rule types**       | Always-on                   | Always / Intelligent / Glob / Manual | Always / Model Decision / Manual / Auto | Always / Agent-decided / File-scoped               | N/A                        |
| **Skills**           | SKILL.md (stable)           | SKILL.md (nightly)                   | Workflows (manual-only)                 | SKILL.md (stable, open standard)                   | N/A                        |
| **Hooks**            | 12+ events, 3 handler types | 20+ events, command + prompt types   | Enterprise-only (limited)               | 8 events (Preview)                                 | N/A                        |
| **Hook protocol**    | JSON stdio                  | JSON stdio (Claude-compatible)       | Proprietary                             | JSON stdio (Claude-compatible)                     | N/A                        |
| **MCP support**      | Native (reference impl)     | Full                                 | Full                                    | Full (all plans)                                   | Full (primary extension)   |
| **Agent profiles**   | `.claude/agents/`           | Partial                              | N/A                                     | `.github/agents/` (reads `.claude/agents/` too)    | Built-in profiles          |
| **Claude compat**    | N/A (is Claude)             | Deliberate (env vars, protocol)      | None                                    | Deliberate (reads `.claude/` dirs)                 | None                       |
| **Config format**    | JSON (settings.json)        | JSON (hooks, settings)               | Markdown + settings                     | YAML frontmatter + JSON hooks                      | TOML/JSON settings         |
| **Stability**        | Stable, rapidly evolving    | Stable, rapidly evolving             | Uncertain (Cognition acquisition)       | Stable, Preview features                           | Stable, limited            |
| **Character limits** | None documented             | None documented                      | 6K per rule, 12K total                  | 30K per agent                                      | N/A                        |

---

## Market Trajectory Analysis

### Current Market Position (March 2026)

Based on the Pragmatic Engineer survey (906 respondents, median 11-15 years experience):

| Metric                | Claude Code                | Cursor          | GitHub Copilot   | Windsurf         |
| --------------------- | -------------------------- | --------------- | ---------------- | ---------------- |
| **Most used**         | #1 (8 months after launch) | #3              | #2               | Growing          |
| **Most loved**        | 46%                        | 19%             | 9%               | N/A              |
| **Paying users**      | N/A                        | 360K+ ($2B ARR) | 4.7M subscribers | 350+ enterprise  |
| **Enterprise**        | Growing fast at small cos  | Mid-market      | 90% Fortune 100  | Enterprise focus |
| **Company size bias** | 75% at smallest businesses | Balanced        | Large enterprise | Enterprise       |

### Trajectory Signals

**Growing:** Claude Code (explosive), Zed, Amp, Augment Code, Factory
**Stable:** Cursor (strong revenue), GitHub Copilot (enterprise moat)
**Uncertain:** Windsurf (Cognition acquisition, direction unclear)

### Agent Adoption

55% of surveyed developers now regularly use AI agents. Staff+ engineers lead at 63.5%. Agent users are 2x as excited about AI as non-users. This confirms the market is moving toward agentic IDEs -- exactly where Luca operates.

### Key Insight

The market is bifurcating:

- **Power developers / startups:** Claude Code (CLI-first, deepest extensibility)
- **Enterprise / compliance-heavy:** GitHub Copilot (Microsoft/GitHub trust, SSO, audit)
- **Balanced / visual:** Cursor (IDE experience + agent power)
- **Budget / simple:** Windsurf (simpler, acquired)

---

## MCP as Universal Layer: Analysis

### Current MCP Adoption

MCP has achieved **universal adoption** across all major AI coding IDEs:

| IDE                          | MCP Support                    | Since |
| ---------------------------- | ------------------------------ | ----- |
| Claude Code / Claude Desktop | Native (created MCP)           | 2024  |
| Cursor                       | Full                           | 2025  |
| Windsurf                     | Full                           | 2025  |
| VS Code / Copilot            | Full (all plans incl. free)    | 2025  |
| Zed                          | Full (primary extension point) | 2025  |
| Replit                       | Full                           | 2025  |
| Continue.dev                 | Full                           | 2025  |

OpenAI adopted MCP in March 2025 across ChatGPT and its products. Google Cloud documents it as a standard. The protocol is inspired by LSP (Language Server Protocol) and is on a similar standardization trajectory.

### What MCP Covers

MCP standardizes **tool integration** -- connecting AI agents to external systems:

- Database queries
- API calls
- File system access
- Service integrations (GitHub, Jira, Slack, etc.)
- Browser automation

### What MCP Does NOT Cover

MCP does **not** standardize:

- Rules/instructions format
- Skills/workflow definitions
- Hook lifecycle events
- Agent profile definitions
- Settings/permissions configuration

### Implication for Luca

**MCP is necessary but not sufficient as a universal adapter layer.**

Luca should:

1. **Use MCP for tool integration** -- build Luca-specific MCP servers for memory (MuninnDB), state machine, and bridge CLI
2. **Still build per-IDE compilers** -- for rules, skills, hooks, and agent definitions
3. **Target the emerging convergence** -- Claude Code's format is becoming the de facto standard, with both Cursor and VS Code deliberately adopting Claude Code compatibility

---

## Recommendation: IDE Targeting Priority

### Tier 1: Must Support (Now)

**1. Claude Code** -- Already supported. Deepest extensibility, highest developer love. Reference platform.

**2. Cursor** -- Second priority. Deliberate Claude Code protocol compatibility means the adapter is simpler than expected. Hooks use the same JSON stdio protocol. Rules need `.mdc` frontmatter compilation. Skills are approaching SKILL.md parity. $2B ARR proves commercial viability.

### Tier 2: Should Support (Next Quarter)

**3. VS Code / GitHub Copilot** -- Third priority despite largest user base (4.7M paid). Reason: VS Code is deliberately reading `.claude/` directories and mapping Claude tool names. This means partial Luca support comes "for free." The `.github/agents/` and `.github/skills/` formats need compilers, but the convergence is real.

### Tier 3: Monitor (Later)

**4. Windsurf** -- Monitor only. The Cognition acquisition creates strategic uncertainty. Simpler extensibility means less value from Luca's sophisticated system. Consider if Windsurf/Devin merger produces something interesting.

**5. Zed** -- Monitor. MCP-only extensibility means Luca MCP servers would work, but no rules/skills/hooks to compile. Limited market share.

### Universal Layer Strategy

Build the adapter architecture in three layers:

1. **MCP Layer (universal):** Luca MCP servers for MuninnDB, state machine, bridge CLI. Works in all IDEs immediately.

2. **Artifact Compiler Layer (per-IDE):** Compile Luca's TypeScript definitions to:
   - `.claude/` artifacts (current -- stable)
   - `.cursor/` artifacts (rules with `.mdc` frontmatter, hooks.json)
   - `.github/` artifacts (agent profiles, skills, hooks)
   - `.windsurf/` artifacts (rules, workflows)

3. **Protocol Compatibility Layer:** Leverage the Claude Code protocol convergence:
   - Cursor already uses Claude Code's hook JSON stdio protocol
   - VS Code already reads `.claude/` directories
   - Build "Claude Code compatible" as the primary target, with thin adapters for deviations

---

## Sources

### Claude Code

- [Claude Code Docs - Features Overview](https://code.claude.com/docs/en/features-overview)
- [Claude Code Docs - Settings](https://code.claude.com/docs/en/settings)
- [Claude Code Docs - Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Claude Code Setup Guide (2026)](https://okhlopkov.com/claude-code-setup-mcp-hooks-skills-2026/)
- [Claude Code Extensions Explained (Medium)](https://muneebsa.medium.com/claude-code-extensions-explained-skills-mcp-hooks-subagents-agent-teams-plugins-9294907e84ff)
- [Claude Code Skills vs MCP vs Plugins (MorphLLM)](https://www.morphllm.com/claude-code-skills-mcp-plugins)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building Agents with Claude Agent SDK (Anthropic)](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Code March 2026 Updates](https://pasqualepillitteri.it/en/news/381/claude-code-march-2026-updates)

### Cursor

- [Cursor Docs - Rules](https://cursor.com/docs/context/rules)
- [Cursor Docs - Hooks](https://cursor.com/docs/hooks)
- [Cursor Docs - Agent Skills](https://cursor.com/docs/context/skills)
- [Cursor Changelog](https://cursor.com/changelog)
- [Cursor Agent Best Practices](https://cursor.com/blog/agent-best-practices)
- [Cursor Skills and Subagents (korchasa.dev)](https://korchasa.dev/posts/2026_01_22_cursor_skills_and_subagents/)
- [Cursor Hooks Deep Dive (GitButler)](https://blog.gitbutler.com/cursor-hooks-deep-dive)
- [Everything About Cursor Rules (Instructa.ai)](https://www.instructa.ai/blog/cursor-ai/everything-you-need-to-know-cursor-rules)

### Windsurf

- [Windsurf Docs - Workflows](https://docs.windsurf.com/windsurf/cascade/workflows)
- [Windsurf Docs - Welcome](https://docs.windsurf.com/)
- [Windsurf Changelog](https://windsurf.com/changelog)
- [Windsurf Rules Guide (localskills.sh)](https://localskills.sh/blog/windsurf-rules-guide)
- [Windsurf Review 2026 (vibecoding.app)](https://vibecoding.app/blog/windsurf-review)
- [Windsurf vs Cursor vs Zed 2026 (Octave)](https://www.octavehq.com/post/windsurf-vs-cursor-vs-zed-which-ai-ide-in-2026)

### VS Code / GitHub Copilot

- [VS Code - Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code - Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [VS Code - Agent Hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)
- [VS Code - Using Agents Overview](https://code.visualstudio.com/docs/copilot/agents/overview)
- [GitHub Docs - Custom Agents Configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [GitHub Docs - About Custom Agents](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-custom-agents)
- [VS Code Blog - Making Agents Practical (March 2026)](https://code.visualstudio.com/blogs/2026/03/05/making-agents-practical-for-real-world-development)

### Zed

- [Zed Docs - Agent Settings](https://zed.dev/docs/ai/agent-settings)
- [Zed Docs - MCP](https://zed.dev/docs/ai/mcp)
- [Is Zed Ready for AI Power Users (Builder.io)](https://www.builder.io/blog/zed-ai-2026)

### MCP

- [MCP Specification (Official)](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP GitHub Organization](https://github.com/modelcontextprotocol)
- [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [MCP 2026 Complete Guide (Calmops)](https://calmops.com/ai/model-context-protocol-mcp-2026-complete-guide/)
- [Google Cloud - What is MCP](https://cloud.google.com/discover/what-is-model-context-protocol)

### Market Data

- [Pragmatic Engineer - AI Tooling for Software Engineers 2026](https://newsletter.pragmaticengineer.com/p/ai-tooling-2026)
- [AI Coding Tools Compared 2026 (TLDL)](https://www.tldl.io/resources/ai-coding-tools-2026)
- [Best AI Coding Agents 2026 (Codegen)](https://codegen.com/blog/best-ai-coding-agents/)
- [AI Coding Agents Comparison 2026 (Lushbinary)](https://lushbinary.com/blog/ai-coding-agents-comparison-cursor-windsurf-claude-copilot-kiro-2026/)
- [AI Coding Tools War 2026 (Redreamality)](https://redreamality.com/blog/ai-coding-tools-war-vibe-coding-mainstream/)

---

## Pre-Grooming Notes (Platform Validation)

**Validated:** 2026-03-23
**Validator:** platform-validator

### Verified Claims

**Claude Code:**

- Hook system exists and is the most comprehensive -- Verified via [official Claude Code hooks docs](https://code.claude.com/docs/en/hooks). However, event count is WRONG (see Corrections below).
- Handler types: command, prompt, agent -- Verified. **There are actually 4 handler types** (command, http, prompt, agent); the doc omits `http`.
- MCP as reference implementation -- Verified. Anthropic created MCP; Claude Code is the reference client.
- Claude Agent SDK rename -- Verified via [Anthropic engineering blog](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) and [migration guide](https://platform.claude.com/docs/en/agent-sdk/migration-guide). Renamed September 29, 2025. The doc says "renamed in 2026" which is slightly wrong; it was late 2025.

**Cursor:**

- `.mdc` format with YAML frontmatter (description, globs, alwaysApply) -- Verified via [Cursor rules docs](https://cursor.com/docs/context/rules) and community sources.
- Hooks use JSON stdio protocol compatible with Claude Code -- Verified via [Cursor hooks docs](https://cursor.com/docs/hooks). Exit code `2` blocks actions. `CLAUDE_PROJECT_DIR` provided as compatibility alias. Confirmed.
- Skills format: SKILL.md based on agentskills.io standard -- Verified via [Cursor skills docs](https://cursor.com/docs/context/skills). Skills shipped in Cursor 2.4 (January 2026) as STABLE, not nightly-only (see Corrections).
- $2B ARR -- Verified via [TechCrunch](https://techcrunch.com/2026/03/02/cursor-has-reportedly-surpassed-2b-in-annualized-revenue/) and [Bloomberg](https://www.bloomberg.com/news/articles/2026-03-02/cursor-recurring-revenue-doubles-in-three-months-to-2-billion).

**VS Code / GitHub Copilot:**

- VS Code reads `.claude/agents/` directory -- Verified via [VS Code custom agents docs](https://code.visualstudio.com/docs/copilot/customization/custom-agents). "VS Code also detects `.md` files in the `.claude/agents` folder, following the Claude sub-agents format."
- VS Code maps Claude tool names to VS Code equivalents -- Verified. Snake_case vs camelCase property names, different tool names (Write/Edit vs create_file/replace_string_in_file).
- SKILL.md as open standard via agentskills.io -- Verified via [agentskills.io](https://agentskills.io/home). 30+ platforms adopted including Claude Code, Cursor, VS Code, OpenAI Codex, Gemini CLI, JetBrains Junie, and more.
- 8 hook lifecycle events (Preview) -- Verified via [VS Code hooks docs](https://code.visualstudio.com/docs/copilot/customization/hooks). Events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop.
- Copilot 4.7M paid subscribers -- Verified via [Microsoft Q2 FY2026 earnings](https://windowsforum.com/threads/microsoft-copilot-hits-15-million-paid-seats-and-4-7-million-github-subscribers.400630/).
- 90% Fortune 100 adoption -- Verified via multiple sources citing Satya Nadella's statements.
- MCP on all plans including free -- Verified.

**Windsurf:**

- Cognition acquisition -- Verified via [TechCrunch](https://techcrunch.com/2025/07/14/cognition-maker-of-the-ai-coding-agent-devin-acquires-windsurf/) and [Cognition blog](https://cognition.ai/blog/windsurf). ~$250M estimated (unofficial). $82M ARR and 350+ enterprise customers confirmed.
- Rules use plain Markdown (`.md`) -- Verified via [Windsurf docs](https://docs.windsurf.com/windsurf/cascade/memories). However, Windsurf DOES use frontmatter with a `trigger` field for workspace rules (see Corrections).
- Character limits -- Partially verified but numbers are WRONG (see Corrections).

**Market Data:**

- Pragmatic Engineer survey: 46% "most loved" for Claude Code, 19% Cursor, 9% Copilot -- Verified via [Pragmatic Engineer newsletter](https://newsletter.pragmaticengineer.com/p/ai-tooling-2026) and [AI Productivity summary](https://aiproductivity.ai/news/pragmatic-engineer-survey-ai-tooling-2026/). Survey: 906 respondents, median 11-15 years experience, ran Jan 27 - Feb 17, 2026. Published March 7, 2026.
- 55% agent adoption, Staff+ at 63.5% -- Consistent with survey reporting.

**MCP:**

- Universal adoption across all major IDEs -- Verified. Anthropic donated MCP to the Agentic AI Foundation (Linux Foundation) in Dec 2025, co-founded by Anthropic, Block, and OpenAI. Supported by Claude Code, Cursor, Windsurf, VS Code, Zed, JetBrains, Replit, and many more.
- MCP does NOT cover rules/skills/hooks -- Verified. MCP standardizes tool integration only.

### Corrections

**CRITICAL -- Claude Code hook count is significantly understated:**

- Document claims: "12+ lifecycle events"
- Actual: **27 lifecycle events** as of March 2026. Events have expanded significantly including: PermissionRequest, PostToolUseFailure, InstructionsLoaded, ConfigChange, WorktreeCreate, WorktreeRemove, PostCompact, Elicitation, ElicitationResult, TeammateIdle, TaskCompleted, StopFailure, and SubagentStart.
- Handler types: Document says 3 types. Actual: **4 types** (command, http, prompt, agent). The `http` handler type (POST endpoints) is missing from the document.
- Source: [Official Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- **Impact on adapter strategy:** HIGH. More events means more granular hook compilation for target IDEs. The comparison table row "12+ events, 3 handler types" must be updated.

**CRITICAL -- Cursor skills are now STABLE, not nightly-only:**

- Document claims: "Nightly release channel only (as of March 2026)"
- Actual: Skills shipped in **Cursor 2.4 (January 22, 2026)** as a stable feature. Cursor 2.4 is the current stable release. Skills are based on the agentskills.io open standard, same as Claude Code and VS Code.
- Source: [Cursor 2.4 changelog](https://cursor.com/changelog/2-4) and [Cursor skills docs](https://cursor.com/docs/context/skills)
- **Impact on adapter strategy:** MEDIUM. Cursor skills being stable means the adapter can target skills compilation now, not "later." This significantly reduces the delta between Claude Code and Cursor adapters.

**Windsurf character limits are described inaccurately:**

- Document claims: "6,000 chars per rule file, 12,000 total combined"
- Actual: **Global rules file is limited to 6,000 characters. Individual workspace rule files are limited to 12,000 characters each.** The total combined limit of 12,000 applies to the sum of global + workspace rules loaded simultaneously, not to individual workspace files.
- Source: [Windsurf rules docs](https://docs.windsurf.com/windsurf/cascade/memories)
- **Impact:** LOW. The key takeaway (restrictive limits) remains correct, but the specific numbers in the comparison table need fixing.

**Windsurf rules DO use frontmatter (for workspace rules):**

- Document claims: "no special frontmatter, no `.mdc`"
- Actual: Workspace rules in `.windsurf/rules/` use YAML frontmatter with a `trigger` field supporting values: `always_on`, `model_decision`, `glob`, `manual`. Global rules do NOT use frontmatter.
- Source: [Windsurf rules docs](https://docs.windsurf.com/windsurf/cascade/memories)
- **Impact:** LOW for adapter strategy but should be corrected for accuracy.

**Windsurf hooks are NOT enterprise-only:**

- Document claims: "Enterprise-only feature (Cascade Hooks)"
- Actual: Cascade Hooks are available to **all users**. The documentation says "designed for power users and enterprise teams." Cloud dashboard configuration for hooks requires Enterprise plan, but local hooks work on all tiers. Windsurf supports **12 hook events**, not the vague "limited" characterization.
- Source: [Windsurf Cascade hooks docs](https://docs.windsurf.com/windsurf/cascade/hooks)
- **Impact:** MEDIUM. Windsurf is more extensible than the document suggests. The comparison table row for Windsurf hooks ("Enterprise-only (limited)") is materially wrong. Should read "12 events, command type" or similar.

**Cursor paying users figure is outdated:**

- Document claims: "360K+ ($2B ARR)"
- Actual: 360K was the figure from ~mid-2025. As of early 2026, Cursor has **over 1 million paying users**, 7M+ monthly active users, 1M+ daily active users, and 50K+ paying teams.
- Source: [Cursor AI Statistics](https://www.getpanto.ai/blog/cursor-ai-statistics) and [TechCrunch](https://techcrunch.com/2026/03/02/cursor-has-reportedly-surpassed-2b-in-annualized-revenue/)
- **Impact:** LOW for strategy (direction is the same) but should be corrected for credibility.

**Claude Agent SDK rename date:**

- Document claims: "renamed in 2026"
- Actual: Renamed **September 29, 2025** (alongside Claude Sonnet 4.5 launch). The doc says "in 2026" which is incorrect by several months.
- Source: [Anthropic migration guide](https://platform.claude.com/docs/en/agent-sdk/migration-guide)
- **Impact:** Negligible for strategy, cosmetic correction.

**Cursor hook count is understated:**

- Document claims: "20+ events"
- Actual: Cursor docs list approximately **18 distinct events** across Agent hooks and Tab hooks (sessionStart, sessionEnd, preToolUse, postToolUse, postToolUseFailure, subagentStart, subagentStop, beforeShellExecution, afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit, beforeSubmitPrompt, preCompact, afterAgentResponse, afterAgentThought, stop, plus tab hooks beforeTabFileRead, afterTabFileEdit). The "20+" claim is approximately correct.
- Source: [Cursor hooks docs](https://cursor.com/docs/hooks)
- **Impact:** Negligible. The characterization is close enough.

### Unverified Claims

- **Zed extensibility details:** Limited verification performed. MCP support confirmed via Zed docs, but the claim "no hooks, no rules directory" was not deeply verified against latest Zed releases. Recommend: Check [zed.dev/docs](https://zed.dev/docs) for any Q1 2026 updates to agent extensibility.

- **VS Code hooks "matchers parsed but not applied":** This was stated as a current Preview limitation. May have been fixed in more recent VS Code updates (1.112+). Recommend: Re-verify before building the VS Code adapter.

- **Copilot coding agent (GitHub-side) reads `.github/agents/`:** Verified for VS Code but the autonomous GitHub Actions coding agent behavior was not independently fetched. Recommend: Verify via GitHub docs before relying on this for the GitHub-side adapter.

### Platform Risk Assessment

**Claude Code (LOW RISK):**

- Most stable and extensible platform. Reference implementation for MCP and Agent Skills.
- Risk: Anthropic could change hook/skills APIs, but as the standard-setter, changes would be deliberate and documented.
- Mitigation: Already the primary target. Monitor Claude Code release notes.

**Cursor (LOW-MEDIUM RISK):**

- Deliberately converging on Claude Code compatibility. The CLAUDE_PROJECT_DIR alias and JSON stdio protocol compatibility are strong signals.
- Risk: Cursor's rapid iteration (doubling revenue every 3 months) could mean breaking changes to hooks/skills format.
- Mitigation: The agentskills.io standard provides stability for skills. Hooks protocol convergence reduces adapter divergence. Monitor Cursor changelog closely.

**VS Code / Copilot (MEDIUM RISK):**

- Hooks are still in Preview. The `.claude/` directory reading is real but matchers are not applied. Tool name mapping exists but is imperfect.
- Risk: Preview features can change or be removed. The Claude compatibility layer is useful but incomplete (property name casing differs, tool names differ, matchers not applied).
- Mitigation: Build adapter targeting `.github/` format as primary, with `.claude/` compatibility as bonus. Wait for hooks to reach stable before deep investment.

**Windsurf (HIGH RISK):**

- Cognition acquisition (July 2025) creates significant strategic uncertainty. Key founders/researchers left to Google. Product direction unclear.
- Risk: Windsurf may be absorbed into Devin, deprecated, or fundamentally restructured. Current 12-event hook system is decent but could change.
- Mitigation: Monitor-only stance is correct. If building an adapter, keep it minimal and low-investment.

**Zed (LOW RISK, LOW VALUE):**

- MCP-only extensibility means Luca MCP servers work out of the box. No adapter needed.
- Risk: Limited market share limits ROI of any dedicated effort.
- Mitigation: No dedicated adapter needed. MCP layer provides coverage.

### Adapter Prioritization Notes (Revised)

The original Tier 1/2/3 prioritization is **largely correct** but needs adjustment:

**Tier 1: Claude Code** -- No change. Reference platform, deepest extensibility.

**Tier 1 (upgraded from Tier 2): Cursor** -- Cursor skills are now STABLE (not nightly). The agentskills.io convergence, Claude-compatible hooks protocol, and $2B ARR with 1M+ paying users make this a co-Tier-1 target. The adapter delta from Claude Code is smaller than the document suggests:

- Rules: Need `.mdc` frontmatter compilation (known, straightforward)
- Skills: Same SKILL.md format via agentskills.io (no compilation needed)
- Hooks: Same JSON stdio protocol, same exit code semantics (thin adapter for event name mapping)

**Tier 2: VS Code / GitHub Copilot** -- No change in tier, but noted caveats:

- The `.claude/` reading is real but incomplete (matchers not applied, tool names differ)
- Hooks still in Preview -- do not heavily invest until stable
- Skills via agentskills.io work cross-platform (same format)
- Agent profiles (`.github/agents/`) need their own compiler

**Tier 3: Windsurf** -- Tier 3 is correct, but the extensibility rating of 5/10 may be too low. With 12 hook events and frontmatter-based rule activation, Windsurf is more capable than characterized. Revised rating: 6/10. Still monitor-only due to acquisition uncertainty.

**Tier 3: Zed** -- No change. MCP-only, no dedicated adapter needed.

### Comparison Table Corrections

The following cells in the IDE Comparison Matrix need updating:

| Cell                                 | Current Value                 | Corrected Value                                                     |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------- |
| Claude Code / Hooks                  | "12+ events, 3 handler types" | "27 events, 4 handler types (command, http, prompt, agent)"         |
| Cursor / Skills                      | "SKILL.md (nightly)"          | "SKILL.md (stable, agentskills.io standard)"                        |
| Windsurf / Rules format              | Implies no frontmatter        | "`.md` in `.windsurf/rules/` with `trigger` frontmatter"            |
| Windsurf / Hooks                     | "Enterprise-only (limited)"   | "12 events, command type (all tiers; cloud config enterprise-only)" |
| Windsurf / Character limits          | "6K per rule, 12K total"      | "6K global rules, 12K per workspace rule file"                      |
| Cursor / Paying users (market table) | "360K+"                       | "1M+ paying users"                                                  |

### Grooming Recommendations

1. **Update the document before it becomes a dependency.** The Claude Code hook count (12 vs 27) and Cursor skills stability (nightly vs stable) are the most impactful errors. Any adapter architecture decisions based on these numbers will be wrong.

2. **Treat agentskills.io as a strategic convergence point.** The open standard is adopted by Claude Code, Cursor, VS Code/Copilot, OpenAI Codex, Gemini CLI, JetBrains, and 25+ other platforms. Skills compilation may not need per-IDE adapters at all for many targets -- just produce compliant SKILL.md files.

3. **Hook protocol convergence is real but has limits.** Claude Code (27 events), Cursor (18-20 events), Windsurf (12 events), and VS Code (8 events) all use JSON-based hook protocols, but event sets differ significantly. The adapter needs an event-mapping layer, not just format translation.

4. **Windsurf extensibility is underestimated.** The document characterizes it as 5/10 with "enterprise-only" hooks. Actual: 12 hook events available to all users, frontmatter-based rule activation, and 12K per workspace rule (not 6K as stated). Consider upgrading to 6/10.

5. **MCP governance update is worth noting.** MCP was donated to the Linux Foundation's Agentic AI Foundation (AAIF) in December 2025, co-founded by Anthropic, Block, and OpenAI. This strengthens the "universal standard" characterization and reduces single-vendor risk.

6. **VS Code adapter should wait for hooks GA.** Preview status means breaking changes are likely. The `.claude/` directory reading is a nice compatibility bonus but should not be the primary adapter strategy -- build for `.github/` format.

7. **Re-verify claims quarterly.** This market moves fast. Cursor doubled revenue in 3 months. Claude Code went from 12 to 27 hook events in a similar timeframe. Any document older than 3 months should be re-validated before driving decisions.
