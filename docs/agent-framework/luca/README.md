# Luca (lu)

> A spec-driven AI development framework with cognitive memory, intelligent routing, and integrated git workflow.

## Overview

Luca is the AI agent framework for spec-driven development. It combines structured planning with cognitive features that enable the AI to learn from past sessions, plus seamless integration with Jira and GitHub for end-to-end development workflow.

**Key Features:**

- **Jira-to-PR workflow** - Single command handles Jira → GitHub issue → branch → execute → PR
- **Spec-driven development** - Goal-backward planning, atomic execution
- **Two-tier memory** - Session memory (MuninnDB session context) + long-term learning (MuninnDB engrams)
- **Always verify** - Verification runs at all complexity levels
- **Intelligent routing** - Automatic complexity classification
- **Cognitive pre-flight** - Load project context before operations
- **Git context tracking** - STATE.md tracks Jira ticket, branch, and issue throughout

## Quick Start

### Jira-Driven Work (Most Common)

```bash
# Pass a Jira ticket - handles everything automatically
/lu [TICKET-ID]

# Or use full Jira URL
/lu https://mypercent.atlassian.net/browse/[TICKET-ID]
```

This single command:

1. Fetches Jira ticket details
2. Creates GitHub issue linked to Jira
3. Creates feature branch (`[TICKET-ID]--description`)
4. Runs cognitive pre-flight
5. Executes the task
6. Offers to commit and create PR

### Ad-Hoc Work (No Ticket)

```bash
# Describe the task - you'll be prompted for Jira or placeholder
/lu "fix the typo in the readme"
```

When prompted, choose `[PLACEHOLDER]` placeholder for work not tied to a Jira ticket.

### New Projects

```bash
/lu-new-project      # Initialize project (research → requirements → roadmap)
/lu-map-codebase     # Map existing codebase first (brownfield projects)
/lu-progress         # Check status and what's next
```

## Documentation

| Document                                                      | Description                                           |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| [**lu-workflow.mdc**](../../../.cursor/rules/lu-workflow.mdc) | ⭐ **Main workflow definition and command reference** |
| [End-to-End Workflow](./end-to-end-workflow.md)               | How it all works together                             |
| [Diagrams](./diagrams.md)                                     | Visual architecture diagrams                          |
| [Architecture](./architecture-plan.md)                        | System design                                         |

## Core Principles

### Spec-Driven Development

- Goal-backward planning methodology
- Three-level verification (EXISTS → SUBSTANTIVE → WIRED)
- Atomic commits per task
- Deviation rules for handling unexpected situations
- Context rot prevention via small plans

### Cognitive Memory

- **MuninnDB brain tree** - Project identity and conventions
- **MuninnDB engrams** - Long-term learnings (patterns, decisions, pitfalls)
- **MuninnDB session context** - Session memory (cleared after learning extraction)
- Selective memory recall (only relevant learnings loaded)
- Curated learning capture (validated insights only)

### Intelligent Routing

- Unified entry point (`/lu`)
- Automatic complexity classification (TRIVIAL → MODERATE → COMPLEX)
- Appropriate verification level per complexity
- Cognitive pre-flight before operations

### Git Integration

- **Jira Detection**: Accepts ticket ID (`[TICKET-ID]`) or full URL
- **GitHub Issue Creation**: Auto-creates linked issue via MCP Atlassian tools
- **Branch Management**: Creates `[TICKET-ID]--description` branches off ENG release branches
- **Commit & PR**: Offers to commit with proper format and create PR after verification
- **Placeholder Support**: Use `[PLACEHOLDER]` for ad-hoc work without Jira tickets

## Directory Structure

```
.cursor/
├── agents/
│   ├── lu-cognition.md    # Cognitive pre-flight
│   ├── lu-router.md       # Complexity routing
│   ├── lu-learner.md      # Learning capture
│   ├── lu-planner.md      # Task planning
│   ├── lu-executor.md     # Task execution
│   ├── lu-verifier.md     # Goal verification
│   └── lu-*.md            # Other agents
├── skills/
│   ├── lu/                   # Unified entry point (with git integration)
│   └── lu-*/                 # Individual commands
├── luca/                    # Framework config
│   ├── templates/            # Document templates
│   ├── workflows/            # Workflow definitions
│   └── references/           # Configuration references
└── rules/
    └── lu-workflow.mdc    # Core workflow definition

.planning/                     # Per-project state
├── MuninnDB brain tree                   # Project identity (persistent)
├── STATE.md                   # Session state + git context
├── MuninnDB session context                 # Working memory (session-only)
├── MuninnDB engrams                  # Long-term memory (persistent)
├── PROJECT.md                 # Vision & scope
├── ROADMAP.md                 # Phase structure
├── config.json                # Workflow preferences
├── todos/                     # Captured ideas and tasks
├── debug/                     # Active debug sessions
├── codebase/                  # Codebase analysis
├── quick/                     # Quick task artifacts
└── phases/                    # Execution plans
```

### STATE.md Git Context

STATE.md now tracks git workflow context:

```markdown
## Git Context

- Ticket: [TICKET-ID]
- GitHub Issue: #456
- Branch: [TICKET-ID]--fix-performance-issue
- Base Branch: ENG-1353--release
- Task Complexity: MODERATE
```

## Key Commands

| Command                                 | Purpose                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `/lu <task \| [TICKET-ID] \| Jira-URL>` | **Unified entry** - git setup, routing, execution, verification, learning, PR |
| `/lu-new-project`                       | Initialize project with MuninnDB brain tree, MuninnDB engrams                 |
| `/lu-map-codebase`                      | Analyze existing code (parallel agents)                                       |
| `/lu-new-milestone`                     | Start new milestone cycle                                                     |
| `/lu-complete-milestone`                | Archive milestone, consolidate learnings                                      |
| `/lu-audit-milestone`                   | Audit milestone completion against original intent                            |
| `/lu-plan-milestone-gaps`               | Create phases to close gaps identified by audit                               |
| `/lu-discuss-phase [N]`                 | Gather phase context through adaptive questioning                             |
| `/lu-research-phase [N]`                | Deep ecosystem research for niche/complex domains                             |
| `/lu-list-phase-assumptions [N]`        | Preview AI planning assumptions before execution                              |
| `/lu-plan-phase [N]`                    | Create execution plans with cognitive pre-flight                              |
| `/lu-execute-phase [N]`                 | Execute + always verify + capture learnings                                   |
| `/lu-verify-work [N]`                   | Validate features through conversational UAT testing                          |
| `/lu-add-phase`                         | Add new phase to end of current milestone                                     |
| `/lu-insert-phase`                      | Insert urgent work as decimal phase                                           |
| `/lu-remove-phase`                      | Remove future phase and renumber                                              |
| `/lu-progress`                          | Check current state and next steps                                            |
| `/lu-pause-work`                        | Create context handoff when pausing mid-phase                                 |
| `/lu-resume-work`                       | Resume from previous session with context restoration                         |
| `/lu-quick`                             | Execute quick ad-hoc tasks with Luca guarantees                               |
| `/lu-add-todo`                          | Capture idea or task as todo from conversation                                |
| `/lu-check-todos`                       | List pending todos and select one to work on                                  |
| `/lu-debug`                             | Memory-aided debugging with scientific method                                 |
| `/lu-address-pr`                        | Address PR review comments with agent swarm                                   |
| `/lu-settings`                          | Configure workflow toggles and model profile                                  |
| `/lu-set-profile`                       | Quick switch model profile (quality/balanced/budget)                          |
| `/lu-help`                              | Show full command reference                                                   |
| `/lu-choose`                            | Help decide between issue-driven vs Luca workflow                             |
| `/lu-update`                            | Update Luca to latest version                                                 |
| `/lu-join-discord`                      | Join Luca Discord community                                                   |

### Unified Entry Point Flags

| Flag              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `--force-complex` | Force full planning pipeline regardless of classification |
| `--skip-memory`   | Skip memory recall (fresh start)                          |
| `--skip-branch`   | Skip branch creation (use current branch)                 |

## Workflow

```
/lu "task" | [TICKET-ID] | Jira-URL
    │
    ▼
┌──────────────────────────┐
│  0. Git Context Setup    │  ◄── NEW
│  • Detect Jira ticket    │
│  • Create GitHub issue   │
│  • Create feature branch │
│  • Update STATE.md       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  1. Cognitive Pre-Flight │
│  • Load MuninnDB brain tree         │
│  • Recall from MuninnDB engrams │
│  • Initialize MuninnDB session context │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  2. Complexity Classify  │
│  • TRIVIAL → Direct      │
│  • MODERATE → Quick plan │
│  • COMPLEX → Full plan   │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  3. Execute              │
│  • Log to MuninnDB session context     │
│  • Atomic commits        │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  4. Verify (ALWAYS)      │
│  • EXISTS → SUBSTANTIVE  │
│    → WIRED               │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  5. Learn & Commit       │  ◄── NEW
│  • Extract learnings     │
│  • Update MuninnDB engrams      │
│  • Commit changes        │
│  • Offer PR creation     │
└──────────────────────────┘
```

## Configuration

Stored in `.planning/config.json`:

```json
{
  "model_profile": "balanced",
  "cognitive": {
    "enabled": true,
    "memory_recall": true,
    "working_memory": true,
    "intuition_check": true,
    "routing": "auto"
  },
  "workflow": {
    "always_verify": true,
    "capture_learnings": true
  }
}
```

## Model Profiles

| Profile    | Use Case                                |
| ---------- | --------------------------------------- |
| `quality`  | Critical deliverables, complex features |
| `balanced` | Default - good balance of speed/quality |
| `budget`   | Quick iterations, exploratory work      |

## Components

| Category  | Count |
| --------- | ----- |
| Agents    | 15    |
| Skills    | 30    |
| Workflows | 14    |
| Templates | 20+   |
