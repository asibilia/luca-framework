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

### 1. The `.planning` Directory

All Luca projects have a `.planning/` directory at the root. This is where your project's "brain" lives.

- `config.json`: Project configuration and settings.
- Memory is stored in **MuninnDB** (via MCP tools): brain tree for project identity, engrams for long-term learnings (patterns, decisions, pitfalls), and session engrams for active task context.
- `phases/`: Contains your development plans and summaries.

#### Artifact layout

The pipeline organizes files into two tiers:

- **`.planning/` (root)** — **cross-phase state**, persists across every pipeline run:
  - `luca-state.json`, `.luca-lock.json`, `ROADMAP.md`, `config.json`
  - `todos/{pending,backlog,done}/`
  - JSONL audit logs: `session-ledger.jsonl`, `routing-history.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl`
- **`.planning/phases/<currentPhaseSlug>/`** — **session-scoped artifacts** for the active phase:
  - `PLAN.md`, `RESEARCH.md`, `CONTEXT.md`, `POSTMORTEM.md`
  - `REVIEW-{n}.md`, `SESSION-ARCHIVE.md`, `SUGGESTED-RULES.md`, `CONFIDENCE-JOURNAL.md`
  - `verification-result.json`, `checks-convergence.json`, `*-capture-*.md`
  - `runs/<runId>/` (archived prior runs of this phase)

Triage derives `currentPhaseSlug` from the work intent (e.g. issue title) and persists it in `luca-state.json`. Pipeline tools (`writePlanningFile`, `manageRoadmap`, state modules) read the slug and auto-route writes to the correct directory.

If you have a pre-#220 project with loose artifacts at the root, run `workflowState({action:"archive-loose"})` from inside an active pipeline session to migrate them. See [Troubleshooting → Migrating a legacy `.planning/` layout](troubleshooting.md#migrating-a-legacy-planning-layout).

### 2. Plans (`PLAN.md`)

A plan is a structured markdown file that defines a specific set of tasks to be executed. It includes:

- **Objective**: What are we trying to achieve?
- **Tasks**: Atomic steps to reach the objective.
- **Verification**: How do we know it works?

### 3. Execution

The Luca CLI executes these plans, handling git commits for each task and managing deviations automatically.

## Your First Workflow

### Step 1: Define a Phase

When you start a pipeline run, the **triage** stage derives a phase slug from your work intent (typically an issue title or branch name) and creates the directory automatically — for example `.planning/phases/123-add-webhook-support/` for issue `#123`. You normally don't `mkdir` this yourself.

If you're working outside the pipeline (e.g. drafting a plan by hand), you can create a directory manually:

```bash
mkdir -p .planning/phases/<your-slug>
```

### Step 2: Create a Plan

Create `PLAN.md` inside the phase directory (e.g. `.planning/phases/<your-slug>/PLAN.md`). Inside the pipeline, the **architect** stage writes this for you via `writePlanningFile` — pass a bare basename and the tool routes to the active phase dir.

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
