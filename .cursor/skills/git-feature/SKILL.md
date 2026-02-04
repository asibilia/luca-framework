---
name: git-feature
description: Create a new feature branch linked to a Jira ticket. Use when the user wants to create a feature branch, start a new branch, or begin work on a ticket.
---

# Git Feature Branch

Create a new feature branch linked to a Jira ticket.

## When to Use Which Ticket Number

**Use actual Jira ticket (e.g., `PROJ-1234`)** when:

- Work is specifically assigned via a Jira ticket
- The ticket was created in Jira before starting the work

**Use placeholder `PROJ-0000`** for all other work:

- GitHub Issues (even auto-generated ones)
- Tech debt from code reviews
- Quick fixes, refactoring, documentation updates
- Any work not tied to a specific Jira ticket

Configure your project's ticket prefix via `JIRA_TICKET_PREFIX` environment variable.

## Instructions

1. **Ensure clean working directory**: `git status`
2. **Update main**: `git checkout main && git pull origin main`
3. **Parse ticket and description** from user request
4. **Create branch**: `git checkout -b [JIRA-TICKET]--[dash-cased-description]`
5. **Push with upstream**: `git push -u origin [branch-name]`
6. **Report branch name**

## Branch format

`[JIRA-TICKET]--[description]`

Examples:

- `PROJ-1234--add-user-authentication` (Jira-driven)
- `PROJ-0000--fix-security-vulnerability` (from GitHub Action)
- `PROJ-0000--refactor-auth-hooks` (tech debt)

**Key principle:** No Jira ticket? Use `PROJ-0000` (or your placeholder ticket).
