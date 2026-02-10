# State Template

Template for `.planning/STATE.md` — the project's living memory.

---

## File Template

```markdown
# Project State

## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from PROJECT.md Core Value section]
**Current focus:** [Current phase name]

## Git Context

**Jira Ticket:** [PT-#### or None]
**GitHub Issue:** [#123 or None]
**Branch:** [branch-name or None]
**Base Branch:** [ENG-####--release or main]

## Current Position

Phase: [X] of [Y] ([Phase name])
Plan: [A] of [B] in current phase
Status: [Ready to plan / Planning / Ready to execute / In progress / Phase complete]
Task Complexity: [TRIVIAL / MODERATE / COMPLEX] (classified [YYYY-MM-DD HH:MM])
Last activity: [YYYY-MM-DD] — [What happened]

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: [N]
- Average duration: [X] min
- Total execution time: [X.X] hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| -     | -     | -     | -        |

**Recent Trend:**

- Last 5 plans: [durations]
- Trend: [Improving / Stable / Degrading]

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase X]: [Decision summary]
- [Phase Y]: [Decision summary]

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: [YYYY-MM-DD HH:MM]
Stopped at: [Description of last completed action]
Resume file: [Path to .continue-here*.md if exists, otherwise "None"]
```

<purpose>

STATE.md is the project's short-term memory spanning all phases and sessions.

**Problem it solves:** Information is captured in summaries, issues, and decisions but not systematically consumed. Sessions start without context.

**Solution:** A single, small file that's:

- Read first in every workflow
- Updated after every significant action
- Contains digest of accumulated context
- Enables instant session restoration

</purpose>

<lifecycle>

**Creation:** After ROADMAP.md is created (during init)

- Reference PROJECT.md (read it for current context)
- Initialize empty accumulated context sections
- Set position to "Phase 1 ready to plan"

**Reading:** First step of every workflow

- progress: Present status to user
- plan: Inform planning decisions
- execute: Know current position
- transition: Know what's complete

**Writing:** After every significant action

- execute: After SUMMARY.md created
  - Update position (phase, plan, status)
  - Note new decisions (detail in PROJECT.md)
  - Add blockers/concerns
- transition: After phase marked complete
  - Update progress bar
  - Clear resolved blockers
  - Refresh Project Reference date

</lifecycle>

<sections>

### Project Reference

Points to PROJECT.md for full context. Includes:

- Core value (the ONE thing that matters)
- Current focus (which phase)
- Last update date (triggers re-read if stale)

Claude reads PROJECT.md directly for requirements, constraints, and decisions.

### Git Context

Tracks the git/GitHub integration for the current work:

- **Jira Ticket**: The source ticket (PT-####) if work originated from Jira
  - Use `PT-0000` as placeholder for ad-hoc work without a Jira ticket
- **GitHub Issue**: The linked GitHub issue for tracking commits and PRs
  - Set to `None` when using PT-0000 placeholder
- **Branch**: Current feature branch (PT-####--description)
- **Base Branch**: The branch this work will merge into (ENG-####--release)

This enables:

- Automatic commit message formatting with issue references
- PR creation targeting the correct base branch
- Traceability from Jira through to merged code

Set during `/lu` when a Jira ticket is provided, or during `/lu-new-milestone`.

**PT-0000 placeholder** is used for:

- Quick fixes, typos, minor improvements
- Tech debt not tied to a Jira ticket
- GitHub Issues not from Jira
- Exploratory/experimental work
- Documentation and dependency updates

### Current Position

Where we are right now:

- Phase X of Y — which phase
- Plan A of B — which plan within phase
- Status — current state
- Task Complexity — classification from cognitive pre-flight (TRIVIAL/MODERATE/COMPLEX)
- Last activity — what happened most recently
- Progress bar — visual indicator of overall completion

Progress calculation: (completed plans) / (total plans across all phases) × 100%

Task Complexity is set during cognitive pre-flight and persists until the task completes. This enables:

- Session continuity when resuming paused work
- Learning validation (compare classification vs actual effort)
- Pattern recognition for improving future classifications

### Performance Metrics

Track velocity to understand execution patterns:

- Total plans completed
- Average duration per plan
- Per-phase breakdown
- Recent trend (improving/stable/degrading)

Updated after each plan completion.

### Accumulated Context

**Decisions:** Reference to PROJECT.md Key Decisions table, plus recent decisions summary for quick access. Full decision log lives in PROJECT.md.

**Pending Todos:** Ideas captured via /lu-add-todo

- Count of pending todos
- Reference to .planning/todos/pending/
- Brief list if few, count if many (e.g., "5 pending todos — see /lu-check-todos")

**Blockers/Concerns:** From "Next Phase Readiness" sections

- Issues that affect future work
- Prefix with originating phase
- Cleared when addressed

### Session Continuity

Enables instant resumption:

- When was last session
- What was last completed
- Is there a .continue-here file to resume from

### Trivial Tasks Completed

Tracks TRIVIAL complexity tasks executed via `/lu`:

```markdown
## Trivial Tasks Completed

| # | Description | Date | Commit | Complexity |
|---|-------------|------|--------|------------|
```

Updated by lu TRIVIAL route after each trivial task completion.
Provides audit trail for fast-path tasks that skip full planning.

</sections>

<size_constraint>

Keep STATE.md under 100 lines.

It's a DIGEST, not an archive. If accumulated context grows too large:

- Keep only 3-5 recent decisions in summary (full log in PROJECT.md)
- Keep only active blockers, remove resolved ones

The goal is "read once, know where we are" — if it's too long, that fails.

</size_constraint>
