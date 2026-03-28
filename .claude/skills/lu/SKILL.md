# /lu

Unified entry point and autonomous orchestrator for all Luca workflows with cognitive pre-flight, complexity routing, and configurable oversight.

## main

**Branding:** Read `.planning/config.json` branding section at session start. Use `/{commandPrefix}` instead of `/lu` and `{frameworkName}` instead of `Luca` in ALL user-facing output. If config is missing, fall back to defaults (`/lu`, `Luca`).

The single entry point for all Luca workflows. This is a **thin orchestrator** that delegates ALL work to sub-skills via Skill() calls. It contains ZERO inline logic.

**Arguments:** `<task-description | Jira-URL | [TICKET-ID]> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch] [--oversight=flagged|milestone|phase|full-auto] [--skip-backlog] [--max-phases=N] [--no-swarm] [--dry-run] [--ask]`

**CRITICAL — ORCHESTRATOR CONSTRAINTS:**

1. You are a **thin orchestrator**. Do NOT execute plans, verify code, process data, or review code yourself. Invoke sub-skills via Skill() only.
2. **Every step below is a binding instruction, not a suggestion.** You MUST NOT skip, simplify, or substitute workflow steps.
3. **NEVER write code directly.** You are forbidden from using Write, Edit, or any file-modification tool.
4. **Write `current_state` to the context file after EVERY state transition.** The pre-step enforcement hook reads this field to validate sub-skill ordering.

## Context File Protocol

This orchestrator manages the shared context file at `/tmp/lu-context.json`.

**Initialize:** At the start, create the context file:
```typescript
writeLuContext({ context_version: 1 });
// Also write: { current_state: "idle" }
```

**After each sub-skill:** Read context via `readLuContext()`, check success, then write the new state.

## Sub-Skills (Invoked via Skill tool)

| Sub-Skill | Responsibility | Valid From State |
|-----------|---------------|-----------------|
| lu-route | Parse request, git context, cognition, classify complexity | idle |
| lu-configure | Read config, apply overrides, pre-flight validation | routed |
| lu-backlog | Backlog scan, WSJF scoring, roadmap revision (OPTIONAL) | configured |
| lu-phase-loop | Phase execution loop, milestone gate, session summary | scanned OR configured |

## Orchestration Flow

### Step 1: Parse Args and Initialize Context

Parse the user request to extract:
- Task description
- All CLI flags (--complexity, --skip-memory, --skip-backlog, --oversight, etc.)

Initialize the context file:
```typescript
writeLuContext({ context_version: 1, current_state: "idle" });
```

### Step 2: Route (lu-route)

```
Skill(skill: "lu-route", args: "{user_request}")
```

On success, write state transition:
```typescript
writeLuContext({ current_state: "routed" });
```

Read the context to check the routing decision:
```typescript
const ctx = readLuContext();
const decision = ctx.data.lu_route?.routing_decision;
```

**If routing_decision is NOT "phase-execute":** Route to the appropriate handler skill directly and skip the remaining orchestrator steps:

- "quick" -> `Skill(skill: "quick", args: "<task>")`
- "pr-address" -> `Skill(skill: "pr-address", args: "<pr-url>")`
- "debug" -> `Skill(skill: "debug", args: "<bug>")`
- "session-plan" -> `Skill(skill: "session-plan")`
- "progress" -> `Skill(skill: "progress")`
- "project-new" -> `Skill(skill: "project-new", args: "<description>")`
- "milestone-new" -> `Skill(skill: "milestone-new", args: "<description>")`

After non-phase-execute routing completes, run verification and learning (Steps 5-7 from the original lu spec):
1. Spawn lu-verifier via Task()
2. Spawn lu-learner via Task()
3. Commit if on feature branch: `Skill(skill: "git-commit", args: "--no-push")`
4. Write `current_state: "complete"` and return

**If routing_decision is "phase-execute":** Continue to Step 3.

### Step 3: Configure (lu-configure)

```
Skill(skill: "lu-configure")
```

On success, write state transition:
```typescript
writeLuContext({ current_state: "configured" });
```

### Step 4: Backlog (lu-backlog) — CONDITIONAL

Read context to check --skip-backlog flag from the parsed args.

**If --skip-backlog was set OR config backlog_scan == false:**

Send SKIP_BACKLOG event (skip backlog, go directly to scanned):
```typescript
writeLuContext({ current_state: "scanned" });
```

**If --skip-backlog was NOT set:**

```
Skill(skill: "lu-backlog")
```

On success, write state transition:
```typescript
writeLuContext({ current_state: "scanned" });
```

### Step 5: Execute Phase Loop (lu-phase-loop)

Write EXECUTE_START event:
```typescript
writeLuContext({ current_state: "executing" });
```

```
Skill(skill: "lu-phase-loop")
```

On success, write final state transition:
```typescript
writeLuContext({ current_state: "complete" });
```

### Step 6: Done

The lu session is complete. lu-phase-loop handles the session summary, state updates, and final commit internally.