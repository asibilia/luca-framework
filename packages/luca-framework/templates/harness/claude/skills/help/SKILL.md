# help

Show available <%= branding.frameworkName %> commands, usage guide, and workflow overview.

## main

<main>
# <%= branding.frameworkName %> Help

Display the complete <%= branding.frameworkName %> command reference.

**Output ONLY the reference content below. Do NOT add:**

- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference

## <%= branding.frameworkName %> Command Reference

**<%= branding.frameworkName %>** (<%= branding.frameworkName %>) creates hierarchical project plans optimized for solo agentic development with AI.

### Quick Start

**For ticket-driven work:**

```
<%= branding.commandSlash %> [TICKET-ID]
```

or

```
<%= branding.commandSlash %> $JIRA_BASE_URL/browse/[TICKET-ID]
```

This automatically: fetches ticket details → creates GitHub issue (if using Jira) → creates branch → executes → offers PR

**For ad-hoc work (no ticket):**

```
<%= branding.commandSlash %> fix the typo in the readme
```

You'll be prompted to provide a ticket ID or use your configured placeholder (default: `PROJ-0000`).

**For new projects:**

1. `/project-new` - Initialize project (includes research, requirements, roadmap)
2. `/phase-plan 1` - Create detailed plan for first phase
3. `/phase-execute 1` - Execute the phase

### Core Workflow

```
/project-new → /phase-plan → /phase-execute → repeat
```

### Unified Entry Point

**`<%= branding.commandSlash %> <task | Jira-URL | [TICKET-ID]>`**
The single entry point for all development work. Handles:

- Git context setup (ticket → GitHub issue → feature branch)
- Cognitive pre-flight (memory recall, intuition flags)
- Complexity classification (TRIVIAL/MODERATE/COMPLEX)
- Automatic routing to appropriate execution path
- Verification and learning capture
- Commit and PR creation

Flags: `--force-complex`, `--skip-memory`, `--skip-branch`

> **Note:** Replace `[TICKET-ID]` with your project's configured ticket pattern (e.g., `PROJ-123`, `PT-456`, or your custom `ticketPattern` from `.planning/config.json`). Default pattern: `[A-Z]+-\\d+`

### Project Initialization

**`/project-new`**
Initialize new project through unified flow: questioning → research → requirements → roadmap

**`/codebase-map`**
Map an existing codebase for brownfield projects

### Phase Planning

**`/phase-discuss <number>`**
Help articulate your vision for a phase before planning

**`/phase-research <number>`**
Comprehensive ecosystem research for niche/complex domains

**`/phase-assumptions <number>`**
See what AI is planning to do before it starts

**`/phase-plan <number>`**
Create detailed execution plan for a specific phase

### Execution

**`/phase-execute <phase-number>`**
Execute all plans in a phase

### Quick Mode

**`/quick`**
Execute small, ad-hoc tasks with <%= branding.frameworkName %> guarantees but skip optional agents

### Roadmap Management

**`/phase-add <description>`**
Add new phase to end of current milestone

**`/phase-insert <after> <description>`**
Insert urgent work as decimal phase between existing phases

**`/phase-remove <number>`**
Remove a future phase and renumber subsequent phases

### Milestone Management

**`/milestone-new <name>`**
Start a new milestone through unified flow

**`/milestone-complete <version>`**
Archive completed milestone and prepare for next version

### Progress Tracking

**`/progress`**
Check project status and intelligently route to next action

### Session Management

**`/session-resume`**
Resume work from previous session with full context restoration

**`/session-pause`**
Create context handoff when pausing work mid-phase

### Debugging

**`/debug [issue description]`**
Systematic debugging with persistent state across context resets

### PR Management

**`/pr-address [PR# | PR-URL]`**
Address PR review comments with agent swarm. Routes comments to specialized reviewer agents (security, architecture, dx, performance), validates concerns, plans and executes fixes, then responds to GitHub.

Flags: `--dry-run`, `--skip-validation`, `--category=<type>`, `--no-respond`

**Via unified entry:**

```
<%= branding.commandSlash %> PR #123
<%= branding.commandSlash %> https://github.com/.../pull/123
<%= branding.commandSlash %> address PR comments
```

### Todo Management

**`/todo-add [description]`**
Capture idea or task as todo from current conversation

**`/todo-check [area]`**
List pending todos and select one to work on

### User Acceptance Testing

**`/verify [phase]`**
Validate built features through conversational UAT

### Milestone Auditing

**`/milestone-audit [version]`**
Audit milestone completion against original intent

**`/milestone-gaps`**
Create phases to close gaps identified by audit

### Configuration

**`/config-settings`**
Configure workflow toggles and model profile interactively

**`/config-profile <profile>`**
Quick switch model profile (quality/balanced/budget)

### Utility Commands

**`/help`**
Show this command reference

**`/update`**
Update <%= branding.frameworkName %> to latest version with changelog preview

**`/lu-join-discord`**
Join the <%= branding.frameworkName %> Discord community

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
├── state.json            # State machine (typed, primary source of truth)
├── STATE.md              # Human-readable state snapshot (auto-generated from state.json)
├── (MuninnDB)            # Project identity, learnings, session memory
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
├── debug/                # Active debug sessions
├── codebase/             # Codebase map (brownfield)
├── quick/                # Quick task artifacts
└── phases/               # Phase-specific plans/summaries
```

**State machine** (state.json + STATE.md) tracks git context:

- Ticket: `[TICKET-ID]` or `None`
- GitHub Issue: `#123`
- Branch: `[TICKET-ID]--description`
- Base Branch: `[RELEASE-ID]--release`

## Common Workflows

**Working on a ticket (most common):**

```
<%= branding.commandSlash %> PROJ-123
```

This single command handles everything: ticket fetch → GitHub issue → branch creation → execution → PR.

**Ad-hoc work without ticket:**

```
<%= branding.commandSlash %> fix typo in component
```

When prompted, choose your configured placeholder (default: `PROJ-0000`) for work not tied to a ticket.

**Starting a new project:**

```
/project-new
/clear
/phase-plan 1
/clear
/phase-execute 1
```

**Resuming work after a break:**

```
/progress
```

**Adding urgent mid-milestone work:**

```
/phase-insert 5 "Critical security fix"
/phase-plan 5.1
/phase-execute 5.1
```

**Completing a milestone:**

```
/milestone-complete 1.0.0
/clear
/milestone-new
```

**Addressing PR review comments:**

```
/pr-address
```

Or via unified entry:

```
<%= branding.commandSlash %> PR #123
<%= branding.commandSlash %> address PR comments
```

This spawns reviewer agents to validate concerns, plans fixes, executes with atomic commits, and responds to GitHub.

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/progress` to check where you're up to

## Next Steps

This is a reference command. Common follow-ups:

- `/progress` — Check project status
- `/project-new` — Start a new project
- `<%= branding.commandSlash %> [TICKET-ID]` — Work on a ticket
</main>