---
name: lu-help
description: Show available Luca commands and usage guide. Use when user asks about Luca commands, needs help with Luca, or wants to know what Luca can do.
---

# Luca Help

Display the complete Luca command reference.

**Output ONLY the reference content below. Do NOT add:**

- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference

## Luca Command Reference

**Luca** (Luca) creates hierarchical project plans optimized for solo agentic development with AI.

### Quick Start

**For Jira-driven work:**

```
/lu PT-1234
```

or

```
/lu https://mypercent.atlassian.net/browse/PT-1234
```

This automatically: fetches Jira → creates GitHub issue → creates branch → executes → offers PR

**For ad-hoc work (no Jira ticket):**

```
/lu fix the typo in the readme
```

You'll be prompted to provide a Jira ticket or use the `PT-0000` placeholder.

**For new projects:**

1. `/lu-new-project` - Initialize project (includes research, requirements, roadmap)
2. `/lu-plan-phase 1` - Create detailed plan for first phase
3. `/lu-execute-phase 1` - Execute the phase

### Core Workflow

```
/lu-new-project → /lu-plan-phase → /lu-execute-phase → repeat
```

### Unified Entry Point

**`/lu <task | Jira-URL | PT-####>`**
The single entry point for all development work. Handles:

- Git context setup (Jira → GitHub issue → feature branch)
- Cognitive pre-flight (memory recall, intuition flags)
- Complexity classification (TRIVIAL/MODERATE/COMPLEX)
- Automatic routing to appropriate execution path
- Verification and learning capture
- Commit and PR creation

Flags: `--force-complex`, `--skip-memory`, `--skip-branch`

### Project Initialization

**`/lu-new-project`**
Initialize new project through unified flow: questioning → research → requirements → roadmap

**`/lu-map-codebase`**
Map an existing codebase for brownfield projects

### Phase Planning

**`/lu-discuss-phase <number>`**
Help articulate your vision for a phase before planning

**`/lu-research-phase <number>`**
Comprehensive ecosystem research for niche/complex domains

**`/lu-list-phase-assumptions <number>`**
See what AI is planning to do before it starts

**`/lu-plan-phase <number>`**
Create detailed execution plan for a specific phase

### Execution

**`/lu-execute-phase <phase-number>`**
Execute all plans in a phase

### Quick Mode

**`/lu-quick`**
Execute small, ad-hoc tasks with Luca guarantees but skip optional agents

### Roadmap Management

**`/lu-add-phase <description>`**
Add new phase to end of current milestone

**`/lu-insert-phase <after> <description>`**
Insert urgent work as decimal phase between existing phases

**`/lu-remove-phase <number>`**
Remove a future phase and renumber subsequent phases

### Milestone Management

**`/lu-new-milestone <name>`**
Start a new milestone through unified flow

**`/lu-complete-milestone <version>`**
Archive completed milestone and prepare for next version

### Progress Tracking

**`/lu-progress`**
Check project status and intelligently route to next action

### Session Management

**`/lu-resume-work`**
Resume work from previous session with full context restoration

**`/lu-pause-work`**
Create context handoff when pausing work mid-phase

### Debugging

**`/lu-debug [issue description]`**
Systematic debugging with persistent state across context resets

### PR Management

**`/lu-address-pr [PR# | PR-URL]`**
Address PR review comments with agent swarm. Routes comments to specialized reviewer agents (security, architecture, dx, performance), validates concerns, plans and executes fixes, then responds to GitHub.

Flags: `--dry-run`, `--skip-validation`, `--category=<type>`, `--no-respond`

**Via unified entry:**

```
/lu PR #123
/lu https://github.com/.../pull/123
/lu address PR comments
```

### Todo Management

**`/lu-add-todo [description]`**
Capture idea or task as todo from current conversation

**`/lu-check-todos [area]`**
List pending todos and select one to work on

### User Acceptance Testing

**`/lu-verify-work [phase]`**
Validate built features through conversational UAT

### Milestone Auditing

**`/lu-audit-milestone [version]`**
Audit milestone completion against original intent

**`/lu-plan-milestone-gaps`**
Create phases to close gaps identified by audit

### Configuration

**`/lu-settings`**
Configure workflow toggles and model profile interactively

**`/lu-set-profile <profile>`**
Quick switch model profile (quality/balanced/budget)

### Utility Commands

**`/lu-help`**
Show this command reference

**`/lu-update`**
Update Luca to latest version with changelog preview

**`/lu-join-discord`**
Join the Luca Discord community

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
├── STATE.md              # Project memory & context (includes git context)
├── BRAIN.md              # Project identity & conventions
├── MEMORY.md             # Long-term learnings
├── WORKING.md            # Session working memory
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
├── debug/                # Active debug sessions
├── codebase/             # Codebase map (brownfield)
├── quick/                # Quick task artifacts
└── phases/               # Phase-specific plans/summaries
```

**STATE.md** tracks git context:

- Jira Ticket (PT-####)
- GitHub Issue (#123)
- Branch (PT-####--description)
- Base Branch (ENG-####--release)

## Common Workflows

**Working on a Jira ticket (most common):**

```
/lu PT-1234
```

This single command handles everything: Jira fetch → GitHub issue → branch creation → execution → PR.

**Ad-hoc work without Jira ticket:**

```
/lu fix typo in component
```

When prompted, choose "Use placeholder (PT-0000)" for work not tied to a Jira ticket.

**Starting a new project:**

```
/lu-new-project
/clear
/lu-plan-phase 1
/clear
/lu-execute-phase 1
```

**Resuming work after a break:**

```
/lu-progress
```

**Adding urgent mid-milestone work:**

```
/lu-insert-phase 5 "Critical security fix"
/lu-plan-phase 5.1
/lu-execute-phase 5.1
```

**Completing a milestone:**

```
/lu-complete-milestone 1.0.0
/clear
/lu-new-milestone
```

**Addressing PR review comments:**

```
/lu-address-pr
```

Or via unified entry:

```
/lu PR #123
/lu address PR comments
```

This spawns reviewer agents to validate concerns, plans fixes, executes with atomic commits, and responds to GitHub.

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/lu-progress` to check where you're up to

## Next Steps

This is a reference command. Common follow-ups:

- `/lu-progress` — Check project status
- `/lu-new-project` — Start a new project
- `/lu PT-####` — Work on a Jira ticket
