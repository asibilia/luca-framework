---
name: milestone-new
description: Start a new milestone cycle — gather goals, define requirements, create roadmap
---
Start a new milestone cycle for the project. This is the brownfield equivalent of project initialization — use it when starting a new body of work on an existing project.

## Parse Arguments

Parse `$ARGUMENTS` for:
- An optional **milestone name** (e.g., `"v2 API Redesign"`)
- An optional **version** (e.g., `v2`, `v3`)
- `--skip-research` — skip the domain research step

## Steps

### Step 1 — Load Context

Read existing project state:
1. Read `.planning/PROJECT.md` (if it exists) for current project description and previous milestones
2. Read `ROADMAP.md` (if it exists) to determine the last phase number used (for continued numbering)
3. Read workflow state via `workflowState(action: "read")` to check current pipeline status

If the pipeline is currently active (pipelineStep is not "idle" or "complete"), warn the user that starting a new milestone will reset the current pipeline state.

### Step 2 — Gather Milestone Goals

Check for `.planning/MILESTONE-CONTEXT.md` — if it exists, use it as the source for milestone goals.

If no context file exists, ask the user:
- What should this milestone accomplish?
- What are the key features or changes?
- Any constraints or deadlines?
- What's the target scope? (small focused change vs. large feature set)

Compile the goals into a structured list.

### Step 3 — Determine Version

Parse the last milestone version from `.planning/PROJECT.md`:
- If previous milestones exist, suggest the next sequential version (e.g., v1 → v2)
- If a version was provided in arguments, use that instead
- If no prior milestones, start at v1

Confirm the version with the user.

### Step 4 — Update PROJECT.md

Update `.planning/PROJECT.md` with a "Current Milestone" section:

```markdown
## Current Milestone — v<version>: <name>

**Goals:**
- <goal 1>
- <goal 2>
- ...

**Started:** <ISO date>
```

If previous milestones exist, move the old "Current Milestone" section to an "Archived Milestones" section.

Create the `.planning/` directory if it doesn't exist.

### Step 5 — Reset Pipeline State

Reset the workflow state for the new milestone:

```
workflowState(action: "reset-pipeline")
```

This clears the previous pipeline step, phases, iterations, and budget counters.

### Step 6 — Research (Optional)

Unless `--skip-research` is set:

1. For each major feature or area in the milestone goals, spawn a **researcher** subagent with milestone-aware context:
   ```
   "Research implementation approaches for: <feature description>
    Project context: <brief from PROJECT.md>
    Milestone goals: <goal list>
    Focus on: architecture patterns, ecosystem libraries, risks, prior art"
   ```

2. Write research findings to `.planning/research/<feature-slug>.md`

3. Present a summary of key findings and recommendations to the user.

If `--skip-research` is set, skip to Step 7.

### Step 7 — Define Requirements

Based on the milestone goals (and research findings if available):

1. Present the feature list with suggested scope for each:
   - **Must have** — core requirements that define the milestone
   - **Should have** — important but not blocking
   - **Nice to have** — stretch goals

2. Let the user adjust scoping.

3. Write requirements to `.planning/REQUIREMENTS.md`:
   ```markdown
   # Requirements — v<version>: <name>

   ## Must Have
   - [ ] REQ-1: <requirement> — <acceptance criteria>
   - [ ] REQ-2: <requirement> — <acceptance criteria>

   ## Should Have
   - [ ] REQ-3: <requirement> — <acceptance criteria>

   ## Nice to Have
   - [ ] REQ-4: <requirement> — <acceptance criteria>
   ```

### Step 8 — Create Roadmap

Create the execution roadmap using `manageRoadmap`:

1. Organize requirements into phases based on dependency order and priority
2. If a previous ROADMAP.md exists, continue phase numbering from the last used number
3. Call:
   ```
   manageRoadmap(action: "create", phases: [
     { name: "Phase N: <description>", deps: [...], businessValue: N, timeCriticality: N, effort: N },
     ...
   ])
   ```

### Step 9 — GitHub Tracking

Offer three options:

1. **New issue + branch** — Create a GitHub issue describing the milestone and a feature branch:
   ```bash
   gh issue create --title "v<version>: <milestone name>" --body "<milestone description>"
   git checkout -b feat/<issue-number>-<slug>
   git push -u origin feat/<issue-number>-<slug>
   ```

2. **Continue on existing** — If there's already an open issue/branch, add a comment noting the new milestone and continue using it.

3. **No tracking** — Skip GitHub tracking (warn that this means no PR will be auto-created in finalize).

### Step 10 — Done

Report completion:

```
## Milestone v<version>: <name> — Initialized ✓

Created:
  - .planning/PROJECT.md (updated)
  - .planning/REQUIREMENTS.md
  - ROADMAP.md
  - .planning/research/ (if research was run)

Pipeline state reset. Ready for execution.

Next step: /lu <describe first phase work>
```

Store the milestone initialization in MuninnDB:

<!-- Tier: verified -->
```
mcp__muninn__muninn_remember(
  vault: <repo_vault>,
  concept: "milestone:v<version>-initialized",
  content: "Milestone v<version> '<name>' initialized with <N> requirements across <N> phases. Goals: <brief summary>",
  tags: ["milestone", "v<version>"]
)
```

Promote this user-confirmed milestone to verified tier (capture the returned id):
```
mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>)
```

Determine the repo vault name from `.planning/config.json` → `muninn.vault` field, or fall back to `"default"`.

$ARGUMENTS
