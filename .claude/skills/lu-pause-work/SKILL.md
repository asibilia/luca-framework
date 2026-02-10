# lu-pause-work

Create context handoff when pausing work mid-phase. Use when user wants to stop work, mentions /lu-pause-work, or needs to save current state.

## main

# Luca Pause Work

Create `.continue-here.md` handoff file to preserve complete work state across sessions.

Enables seamless resumption in fresh session with full context restoration.

## Process

### Step 1: Detect Current Phase

Find current phase directory from most recently modified files.

### Step 2: Gather Context

Collect complete state for handoff:

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed.

### Step 3: Write Handoff

Write to `.planning/phases/XX-name/.continue-here.md`:

```markdown
---
phase: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
  </completed_work>

<remaining_work>

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
  </remaining_work>

<decisions_made>

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
  </decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the plan]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
```

### Step 4: Commit

```bash
git add .
bun run commit --message="[phase-name] paused at task [X]/[Y]" --type=chore --scope=wip --no-push --skip-checks
```

### Step 5: Confirm

```
✓ Handoff created: .planning/phases/[XX-name]/.continue-here.md

Current state:
- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /lu-resume-work
```

## Success Criteria

- [ ] .continue-here.md created in correct phase directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows location and how to resume

## Next Steps

This skill creates a handoff for resuming later. No immediate action needed.

**When returning:**
- `/lu-resume-work` — Restore context and continue

**Common follow-ups:**
- `/lu-help` — Review commands before stepping away