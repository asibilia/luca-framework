---
name: "workflow-start"
description: "Start work on a ticket following the full workflow. Use when the user wants to start a ticket, begin work on issue, set up for new work, or initiate the full dev workflow."
---

<main>
# Workflow Start

**REDIRECT:** This workflow is now integrated into `/lu`.

## Usage

Instead of `/workflow-start [TICKET-ID]`, use:

```
/lu [TICKET-ID]
```

or

```
/lu $JIRA_BASE_URL/browse/[TICKET-ID]
```

## What /lu Does

When given a ticket, `/lu` automatically:

1. **Fetches ticket details** via configured adapter (Jira, GitHub, or placeholder)
2. **Creates GitHub issue** linked to the ticket (if using Jira)
3. **Creates feature branch** (`[TICKET-ID]--description`) off current base branch
4. **Updates STATE.md** with git context
5. **Runs cognitive pre-flight** with memory recall
6. **Classifies complexity** and routes appropriately
7. **Executes work** with verification
8. **Offers PR creation** when complete

## Flags

- `--skip-branch` - Skip branch creation (if already on correct branch)
- `--force-complex` - Force full planning pipeline
- `--skip-memory` - Skip memory recall

## Example

```
/lu PROJ-123
```

Output:

```
Luca > GIT CONTEXT

Ticket: PROJ-123 - Feature description
Issue:  #789
Branch: PROJ-123--feature-description
Base:   main (or release branch)
```

Then proceeds with cognitive pre-flight and task execution.

## Legacy Reference

The original workflow was:

```
Ticket -> GitHub issue -> Feature branch -> Plan -> Work -> PR
```

This is now fully handled by `/lu` when given a ticket input.

> **Note:** Replace `[TICKET-ID]` with your project's configured ticket pattern. Default: `[A-Z]+-\\d+`
</main>
