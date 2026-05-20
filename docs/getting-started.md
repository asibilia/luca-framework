# Getting Started with Luca

Welcome to Luca! This guide will walk you through setting up your first project and understanding the core workflow.

## Prerequisites

- **Bun**: v1.0 or higher (Recommended)
- **Node.js**: v18 or higher
- **Git**: For version control and task tracking

### Pi-Specific Setup

If you are using Luca with [Pi](https://pi.ai), you need a **Console API key** from [console.anthropic.com](https://console.anthropic.com) for full functionality. Pi's built-in OAuth token (`sk-ant-oat01-*`) is not accepted for third-party API calls.

1. Create a Console API key at [console.anthropic.com](https://console.anthropic.com) (starts with `sk-ant-api03-*`).
2. Set the environment variable in your shell profile:
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-api03-..."
   ```
3. Extensions that require this: `query-experts`, `chain`, `teams`. Local-only extensions (`state`, `memory`, `harness`) work without it.

## Installation

The easiest way to start a new Luca project is using `create-luca`:

```bash
mkdir my-new-project && cd my-new-project
npx create-luca
bun install
```

## Core Concepts

### 1. The `.luca/` Directory

All Luca projects have a `.luca/` directory at the root. This is where your project's workflow data lives.

- `state.json`: Workflow state — pipeline step, current phase, iteration counters.
- `config.json`: Project configuration (MuninnDB vault, oversight defaults, complexity defaults).
- Memory is stored in **MuninnDB** (via MCP tools): brain tree for project identity, engrams for long-term learnings (patterns, decisions, pitfalls), and session engrams for active task context.
- Backlog/todos live in **MuninnDB** (not on disk). Per-milestone snapshots export to `milestones/v<SEMVER>-backlog-snapshot.{json,md}` for portability + disaster recovery.
- `phases/`: One directory per work phase, named `<NN-slug>` (zero-padded NN + kebab-case description).

#### Artifact layout

The strict allowlist (defined in `@alecsibilia/luca-core/luca-dir`):

- **`.luca/` (root files)** — cross-phase state:
  - `state.json` — workflow state
  - `config.json` — project config
  - `lock.json` — pipeline lock (PID + acquired_at)
  - `roadmap.md` — **generated** view of MuninnDB-backed roadmap
  - `ledger.jsonl` — append-only session event log
- **`.luca/phases/<NN-slug>/`** — one directory per phase. Slug is derived from roadmap order, **not LLM-named**. Allowed files:
  - `research.md`, `context.md`, `plan.md`, `plan-review.md`
  - `execute/summary.md`, `execute/progress.jsonl`, `execute/waves/NN.md`
  - `audits/<reviewer>.md` (one per reviewer: `code-review`, `security`, `architect`, `ux`, …)
  - `verify.json`, `learn.md`
- **`.luca/milestones/`** — versioned snapshot files (`v<SEMVER>-roadmap.md`, `v<SEMVER>-audit.md`, `v<SEMVER>-backlog-snapshot.{json,md}`).
- **`.luca/telemetry/<runId>.jsonl`** — per-run event logs.
- **`.luca/archive/<NN-slug>/`** — phase directories closed at milestone.

Anything not in this allowlist is a violation. The LLM never picks a filename — write tools (MCP server, forthcoming) compute paths from intent.

If you have a project on the legacy `.planning/` layout, run `luca migrate-planning [--dry-run] [--force]`. See [Troubleshooting → Migrating a legacy `.planning/` layout](troubleshooting.md#migrating-a-legacy-planning-layout).

### 2. Plans (`PLAN.md`)

A plan is a structured markdown file that defines a specific set of tasks to be executed. It includes:

- **Objective**: What are we trying to achieve?
- **Tasks**: Atomic steps to reach the objective.
- **Verification**: How do we know it works?

### 3. Execution

The Luca CLI executes these plans, handling git commits for each task and managing deviations automatically.

## Your First Workflow

### Step 1: Define a Phase

When you start a pipeline run, the **triage** stage derives a phase slug from your work intent and the next zero-padded NN from roadmap order, creating the directory automatically — for example `.luca/phases/07-add-webhook-support/` for the 7th phase. You normally don't `mkdir` this yourself.

### Step 2: Create a Plan

The **architect** stage writes `plan.md` inside the active phase directory (e.g. `.luca/phases/07-add-webhook-support/plan.md`). The MCP write tools compute the path — you express intent, the tool resolves the destination.

### Step 3: Execute the Plan

Open your plan file in your IDE and use the `/lu` command to execute it. Luca plans are designed to be executed through your AI-powered IDE (Cursor, Claude Code, etc.) rather than a standalone CLI command.

## Common Commands

| Command       | Description                                              |
| ------------- | -------------------------------------------------------- |
| `luca init`   | Initialize a new Luca project in the current directory   |
| `/lu`         | Execute a plan via your AI-powered IDE                   |
| `luca update` | Update the framework and templates to the latest version |
| `luca doctor` | Check your environment for common issues                 |

## Next Steps

- Explore the [Architecture](agent-framework/luca/architecture-plan.md)
- Learn about [Coding Standards](style-guide/coding-standards.md)
- If you run into issues, check the [Troubleshooting Guide](troubleshooting.md)
