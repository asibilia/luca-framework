# Luca Framework

A monorepo for structured AI coding workflows — autonomous pipeline orchestration, long-term memory, and developer tooling.

## What is Luca?

Luca is a custom [Mastra Code](https://mastra.ai) distribution that turns AI coding assistants into structured, multi-phase development pipelines. Instead of freeform chat, Luca orchestrates work through a defined sequence of modes — from triage through execution to finalization — with built-in quality gates, convergence tracking, and long-term memory via [MuninnDB](https://github.com/asibilia/muninn).

## Packages

| Package | Description |
| ------- | ----------- |
| [`packages/luca-mastracode`](packages/luca-mastracode) | Custom Mastra Code harness — 10 modes, 9 subagents, 10 tools, 7 slash commands |
| [`packages/luca-framework`](packages/luca-framework) | CLI (`@alecsibilia/luca-framework`) — init, vault setup, MuninnDB management, diagnostics |
| [`packages/luca-studio`](packages/luca-studio) | Next.js UI for project visualization and configuration |

## Architecture

### Pipeline Modes

Luca operates in 10 modes — 6 pipeline modes that execute autonomously in sequence, and 4 user-facing modes:

**Pipeline modes** (autonomous):
| Mode | Purpose |
|------|---------|
| Triage | Classify intent, complexity, and oversight level |
| Research | Deep codebase analysis across 5 dimensions |
| Architect | Create roadmap and execution plan with goal-backward analysis |
| Execute | Implement changes atomically with convergence-tracked checks |
| Review | Multi-perspective code review (architecture, DX, security, simplification) |
| Finalize | Gap audit, shadow scan, PR creation, milestone boundary |

**User-facing modes**:
| Mode | Purpose |
|------|---------|
| Build | General-purpose implementation with full tool access |
| Fast | Quick responses under 100 words |
| Plan | Read-only exploration and design |
| Discuss | Conversational mode for decisions and clarification |

### Subagents

9 specialized subagents handle focused tasks within pipeline modes:

| Subagent | Role |
|----------|------|
| Researcher | Deep codebase research across scope, architecture, implementation, ecosystem, and risk |
| Planner | Goal-backward execution plans with atomic tasks organized into waves |
| Plan Reviewer | Cold-isolation plan validation with convergence detection |
| Executor | Atomic code changes with per-task commits and deviation handling |
| Verifier | Acceptance criteria verification with automated testing |
| Reviewer | Multi-perspective code review (architecture, DX, security, simplification) |
| Discussion | Captures user decisions and constraints before planning |
| Learner | Extracts patterns, pitfalls, and insights from completed work |
| Shadow Scanner | Scans for AI-session debris (orphaned scripts, stale artifacts, dead exports) |

All subagents receive a shared behavioral prefix (~300-400 tokens) with core operating rules, self-verification mandates, and anti-sycophancy directives.

### Tools

11 custom tools power the pipeline:

| Tool | Purpose |
|------|---------|
| `workflowState` | Pipeline state machine — phase transitions, mode switches, triage/plan/review artifact storage |
| `runChecks` | Convergence-tracked typecheck, lint, and test runner with error fingerprinting |
| `manageTodos` | Backlog management — add, list, move (single or batch), remove, batch-assign across pending/backlog/done |
| `manageRoadmap` | WSJF-scored phase roadmaps with dependency ordering |
| `verificationResult` | Per-wave and aggregate verification tracking |
| `sessionLedger` | Structured audit trail for mode transitions and phase boundaries |
| `pipelineLock` | Mutex to prevent concurrent pipeline runs |
| `classifyComplexity` | TRIVIAL → CRITICAL complexity classification with file/concern estimation |
| `confidenceJournal` | Tracks execution-time decision confidence and flags blocks needing human re-review |
| `repoCleanup` | Shadow debt scanning and automated cleanup |
| `writePlanningFile` | Writes artifacts to `.planning/` directory |

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/lu` | Launch the full autonomous pipeline |
| `/lu-review` | Run review mode on current changes |
| `/milestone-new` | Create a new milestone from backlog items |
| `/pr-address` | Fetch, categorize, fix, and reply to PR review comments |
| `/repo-cleanup` | Scan and clean AI-session debris |
| `/todo-add` | Add item to backlog |
| `/todo-check` | List backlog items by status |

### Long-Term Memory

Luca integrates with [MuninnDB](https://github.com/asibilia/muninn) for persistent knowledge across sessions:

- **Research findings** — codebase architecture, dependency maps, risk assessments
- **Learnings** — patterns, pitfalls, and insights from completed milestones
- **Decisions** — architectural decisions with rationale and alternatives considered
- **Release conventions** — versioning, PR format, publish procedures
- **Entity graph** — named entities and relationships across the codebase

#### Wiring MuninnDB into the Mastracode harness

MuninnDB tools (`mcp__muninn__*`) reach the harness via MCP — and Mastracode does **not** auto-configure this. After `luca init` installs and starts MuninnDB, you have to add an MCP server entry yourself.

Mastracode loads MCP config from three locations, highest priority first:

1. `<project>/.mastracode/mcp.json` — project-scoped
2. `~/.mastracode/mcp.json` — user-global (recommended for MuninnDB)
3. `<project>/.claude/settings.local.json` — Claude Code compat

For most users, configure once globally and every project picks it up. Create `~/.mastracode/mcp.json`:

```json
{
  "mcpServers": {
    "muninn": {
      "url": "http://localhost:8750/mcp",
      "headers": {
        "Authorization": "Bearer <your-muninn-api-key>"
      }
    }
  }
}
```

Use the same API key that `luca vault:init` prompted for (or read it from your project's `.env`'s `MUNINN_DB_API_KEY`). Restart the harness, then run `/mcp` inside the TUI to confirm the `muninn` server is connected. The `mcp__muninn__*` tools become available to mode agents and to subagents that opt in (researcher, planner, executor, verifier, reviewer, learner, discussion).

### Prompt Engineering

Luca's instruction system exploits LLM attention curves:

- **Primacy zone** (first 5 lines) — quantified constraints (e.g., "≤75 words", "≤10 tool calls")
- **Middle zone** — behavioral guidelines and procedures (compression-safe)
- **Recency zone** (last lines) — hard constraints and reminders

All directives use specific numbers instead of qualitative language ("≤75 words" not "be concise").

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) runtime
- [MuninnDB](https://github.com/asibilia/muninn) (optional, for long-term memory)

### 1. Install dependencies

```bash
bun install
```

### 2. Initialize Luca

```bash
luca init          # Set up MuninnDB
luca vault:init    # Configure vault for your project
luca doctor        # Run environment diagnostics and health checks
```

### 3. Launch the harness

If you've installed `@alecsibilia/luca-framework` globally (or via `bun link`), run:

```bash
luca run
```

Inside this monorepo, the equivalent is:

```bash
bun run mastracode
```

Or use the `/lu` slash command within the TUI to execute pipeline workflows.

### CLI Reference

| Command | Purpose |
|---------|---------|
| `luca init` | Bootstrap MuninnDB |
| `luca vault:init` | Configure the project vault |
| `luca run` | Launch the Mastra Code harness |
| `luca doctor` | Run environment diagnostics and health checks |
| `luca version` | Print the installed CLI version |

## Development

```bash
bun install              # Install dependencies
bun run build            # Build luca-framework CLI
luca run                 # Launch mastracode harness
bunx --bun tsc --noEmit  # Type check
bun run dev:studio       # Run studio UI (dev mode)
```

### Release Process

Releases are driven by [Changesets](https://github.com/changesets/changesets):

1. Add a changeset with your PR: `bun changeset`
2. Merge the PR to main
3. The `release.yml` workflow opens a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`
4. Merge the Version PR → workflow creates a GitHub Release (`vX.Y.Z`) and publishes `@alecsibilia/luca-framework` to NPM

## Documentation

- [Getting Started](docs/getting-started.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Coding Standards](docs/guides/coding-standards.md)

## License

MIT
