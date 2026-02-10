---
name: lu-choose
description: Help users decide between issue-driven vs Luca workflow. Use when the user is unsure which development approach to use, asks about workflow selection, or mentions /lu-choose.
---

<main>
<main>
# Luca Choose Workflow

Help users select the right development workflow for their task.

## Two Development Paths

This project supports two complementary workflows:

| Workflow | Best For | Commands |
|----------|----------|----------|
| **Issue-Driven** | Quick fixes, single features | `/project:git/feature`, `bun commit` |
| **Luca** | Complex initiatives, multi-phase | `/lu-new-project`, `/lu-execute-phase` |

## Decision Matrix

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Quick bug fix | Issue workflow | Single commit, fast turnaround |
| Single feature (1-3 files) | Issue workflow | Simple scope, direct PR |
| New module/system (5+ phases) | Luca | Structured planning prevents context rot |
| Greenfield project | Luca | Full roadmap with research phases |
| Complex refactor | Luca | Phase-based execution with verification |
| Same-day completion | Issue workflow | No planning overhead needed |
| Multi-session work | Luca | STATE.md preserves context across sessions |

## Process

### Step 1: Ask About the Task

Use AskQuestion tool:

- header: "Workflow Selection"
- question: "What kind of work are you doing?"
- options:
  - "Bug fix or small enhancement" → Issue workflow
  - "Single feature (1-3 files changed)" → Issue workflow
  - "New project or major initiative" → Luca
  - "Complex refactor (many files)" → Luca
  - "Not sure, help me decide" → Continue to Step 2

### Step 2: Gather More Context (if needed)

Ask clarifying questions:

- How many phases/stages do you envision?
- Will this take multiple sessions to complete?
- Do you need structured research before implementation?

### Step 3: Route to Workflow

**For Issue Workflow:**

```
## Recommended: Issue-Driven Workflow

This task is well-suited for the issue workflow.

**Next Steps:**
1. Create or find a GitHub issue
2. Run: `/project:git/feature {issue}--{description}`
3. Implement with `bun commit` for each change
4. Create PR when done

**Commands:**
- `/project:git/feature` — Create feature branch
- `/project:git/commit` — Conventional commit
- `/project:git/pr` — Create pull request
```

**For Luca Workflow:**

```
## Recommended: Luca Workflow

This task benefits from structured planning and phased execution.

**Next Steps:**
1. Run: `/lu-new-project` to initialize
2. Answer questions to build roadmap
3. Execute phases with `/lu-execute-phase`

**Commands:**
- `/lu-new-project` — Initialize project with roadmap
- `/lu-progress` — Check current status
- `/lu-help` — See all Luca commands
```

## Key Differences

| Aspect | Issue Workflow | Luca |
|--------|----------------|------|
| Planning | `.cursor/plans/` | `.planning/` |
| Commits | `type(scope): #issue desc` | `type(phase-plan): #issue desc` |
| Branch | `{issue}--{description}` | `{issue}--{description}` |
| State | Git history | STATE.md + Git |
| Verification | Manual testing | Automated phase verification |

## Success Criteria

- [ ] User's task complexity understood
- [ ] Appropriate workflow recommended
- [ ] Next steps clearly explained
- [ ] User ready to proceed

## Next Steps

This skill helps you decide between workflows. After choosing:

| Choice | Next Command |
|--------|--------------|
| Issue-driven | `/lu [TICKET-ID]` or `/lu {task}` |
| Luca | `/lu-new-project` |
| Quick task | `/lu-quick` |

**Common follow-ups:**
- `/lu-help` — Review all available commands
- `/lu-progress` — Check existing project status
</main>
</main>