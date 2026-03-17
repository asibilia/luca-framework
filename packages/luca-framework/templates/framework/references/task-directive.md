# Task Tool Directive for Sub-agent Spawning

This reference defines the **mandatory** patterns for spawning sub-agents in lu orchestrator skills. All orchestrator skills MUST follow these patterns.

## Core Principle

**Orchestrator skills coordinate work - they do NOT do the work themselves.**

When a skill says to "spawn" or "invoke" an agent, you MUST use the `Task` tool. This is not optional guidance - it is a requirement.

## Mandatory Language Pattern

Every spawn point in a skill MUST include this directive block:

```markdown
**MANDATORY**: You MUST spawn a sub-agent using the Task tool. Do NOT attempt to [action] yourself.
```

Replace `[action]` with the specific work: "plan", "execute", "verify", "debug", etc.

## Task() Call Syntax

Use this exact Python-style syntax for all Task tool calls:

### Single Agent Spawn

```python
Task(
  prompt="""
[Context and instructions for the sub-agent]
""",
  subagent_type="[agent-type]",
  model="[resolved-model]",
  description="[Short description]"
)
```

### Parallel Agent Spawn

When multiple agents should run simultaneously, call them in the SAME message:

```python
# Agent 1 - these run in PARALLEL
Task(
  prompt="[Agent 1 context]",
  subagent_type="[agent-type-1]",
  model="[model]",
  description="[Description 1]"
)

# Agent 2 - same message = parallel execution
Task(
  prompt="[Agent 2 context]",
  subagent_type="[agent-type-2]",
  model="[model]",
  description="[Description 2]"
)

# Agent 3
Task(
  prompt="[Agent 3 context]",
  subagent_type="[agent-type-3]",
  model="[model]",
  description="[Description 3]"
)
```

## Required Parameters

| Parameter       | Required | Description                                     |
| --------------- | -------- | ----------------------------------------------- |
| `prompt`        | Yes      | Full context and instructions for the sub-agent |
| `subagent_type` | Yes      | The agent type identifier (see list below)      |
| `model`         | No       | Model to use (defaults to parent's model)       |
| `description`   | No       | Short description shown during execution        |

## Available Sub-agent Types

### <%= branding.frameworkName %> Framework Agents

| Agent Type                   | Purpose                               | Use When                  |
| ---------------------------- | ------------------------------------- | ------------------------- |
| `<%= branding.commandPrefix %>-cognition`            | Cognitive pre-flight analysis         | Before routing decisions  |
| `<%= branding.commandPrefix %>-router`               | Complexity classification and routing | Determining workflow path |
| `<%= branding.commandPrefix %>-planner`              | Create PLAN.md files with tasks       | Planning a phase          |
| `<%= branding.commandPrefix %>-executor`             | Execute tasks from plans              | Running plan tasks        |
| `<%= branding.commandPrefix %>-verifier`             | Verify goals achieved                 | After execution           |
| `<%= branding.commandPrefix %>-learner`              | Extract and store learnings           | After verification        |
| `<%= branding.commandPrefix %>-debugger`             | Investigate bugs systematically       | Debugging issues          |
| `<%= branding.commandPrefix %>-phase-researcher`     | Research before planning              | Complex phases            |
| `<%= branding.commandPrefix %>-plan-checker`         | Validate plans before execution       | After planning            |
| `<%= branding.commandPrefix %>-roadmapper`           | Create project roadmaps               | New projects              |
| `<%= branding.commandPrefix %>-codebase-mapper`      | Analyze existing codebase             | Brownfield projects       |
| `<%= branding.commandPrefix %>-integration-checker`  | Verify cross-phase integration        | Multi-phase work          |
| `<%= branding.commandPrefix %>-pr-reviewer`          | Coordinate PR review                  | PR feedback               |
| `<%= branding.commandPrefix %>-project-researcher`   | Research project domain               | New projects              |
| `<%= branding.commandPrefix %>-research-synthesizer` | Combine research outputs              | After parallel research   |

### Code Review Agents

| Agent Type            | Purpose                              | Use When                   |
| --------------------- | ------------------------------------ | -------------------------- |
| `dx-advocate`         | Code quality, conventions, standards | Code review                |
| `code-simplifier`     | Reduce complexity, DRY violations    | Post-implementation        |
| `code-architect`      | Architecture, structure, patterns    | Design review              |
| `security-auditor`    | Security vulnerabilities             | Auth/API changes           |
| `performance-auditor` | Performance bottlenecks              | Performance-sensitive code |
| `ui`                  | Visual design, styling               | UI components              |
| `ux`                  | User flows, interactions             | Feature review             |
| `product`             | Requirements, scope                  | Feature planning           |
| `qa-plan-generator`   | QA testing plans                     | PR creation                |

## Model Resolution Pattern

Each skill should include a model lookup table. Resolve the model before spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Standard lookup table format:

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| <%= branding.commandPrefix %>-planner  | opus    | opus     | sonnet |
| <%= branding.commandPrefix %>-executor | opus    | sonnet   | sonnet |
| <%= branding.commandPrefix %>-verifier | sonnet  | sonnet   | haiku  |
| <%= branding.commandPrefix %>-debugger | opus    | sonnet   | sonnet |
| <%= branding.commandPrefix %>-learner  | sonnet  | haiku    | haiku  |
| reviewers      | opus    | sonnet   | haiku  |

## Context Passing

Sub-agents cannot use `@file` references across Task boundaries. You MUST:

1. **Read file contents** before spawning
2. **Inline the content** in the prompt

```bash
# Read files before spawning
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
PLAN_CONTENT=$(cat "{plan_path}")
```

Then include in prompt:

```python
Task(
  prompt="""
Project State:
{state_content}

Roadmap:
{roadmap_content}

Plan to execute:
{plan_content}
""",
  subagent_type="<%= branding.commandPrefix %>-executor",
  description="Execute plan"
)
```

## Blocking Behavior

The Task tool **blocks** until the sub-agent completes. After the Task returns:

1. Check the return value for status
2. Handle checkpoints if the agent paused
3. Spawn continuation agents if needed
4. Proceed to next step

## Complete Example

Here's a complete spawn pattern for a planner:

````markdown
### Step 8: Spawn <%= branding.commandPrefix %>-planner Agent

**MANDATORY**: You MUST spawn a sub-agent using the Task tool. Do NOT attempt to plan yourself.

First, read the required context files:

```bash
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
```
````

Then spawn the planner:

```python
Task(
  prompt="""
<planning_context>

**Phase:** {phase_number}
**Mode:** standard

**Project State:**
{state_content}

**Roadmap:**
{roadmap_content}

**Requirements:**
{requirements_content}

</planning_context>

<downstream_consumer>
Output consumed by /<%= branding.commandPrefix %>-execute-phase.
Plans must be executable prompts with frontmatter, tasks, and verification criteria.
</downstream_consumer>

Create PLAN.md files for this phase with tasks, waves, and dependencies.
""",
  subagent_type="<%= branding.commandPrefix %>-planner",
  model="{planner_model}",
  description="Plan Phase {phase_number}"
)
```

**Do NOT proceed until the Task returns.**

````

## Parallel Reviewers Example

```markdown
### Step 7.5: Code Quality Review (PARALLEL)

**MANDATORY**: Spawn ALL applicable reviewers in a SINGLE message with multiple Task calls.

```bash
CHANGED_FILES=$(git diff --name-only main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50)
````

````python
# These MUST be called in PARALLEL (same message)
Task(
  prompt="""
Review these files for code quality issues:
{changed_files}

Focus on: naming, duplication, readability, conventions.

Return findings as YAML:
```yaml
issues:
  - severity: HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Description
    suggestion: How to fix
````

""",
subagent_type="dx-advocate",
model="{reviewer_model}",
description="DX review"
)

Task(
prompt="""
Review these files for architecture issues:
{changed_files}

Focus on: patterns, structure, coupling, module boundaries.
""",
subagent_type="code-architect",
model="{reviewer_model}",
description="Architecture review"
)

Task(
prompt="""
Review these files for security issues:
{changed_files}

Focus on: auth, injection, XSS, data validation.
""",
subagent_type="security-auditor",
model="{reviewer_model}",
description="Security review"
)

```

```

## Anti-Patterns to Avoid

### DO NOT do the work yourself

```markdown
# WRONG - doing work instead of delegating

### Step 5: Plan the Phase

Based on the roadmap, I'll create the following tasks:

1. Task one...
2. Task two...

# CORRECT - delegating to sub-agent

### Step 5: Plan the Phase

**MANDATORY**: Spawn <%= branding.commandPrefix %>-planner to create the plan.
[Task() call here]
```

### DO NOT use vague spawn instructions

```markdown
# WRONG - vague instruction

Use Task tool to spawn <%= branding.commandPrefix %>-planner with context.

# CORRECT - explicit Task() call

Task(
prompt="...",
subagent_type="<%= branding.commandPrefix %>-planner",
description="..."
)
```

### DO NOT skip the MANDATORY directive

```markdown
# WRONG - missing directive

### Step 5: Spawn Planner

Task(...)

# CORRECT - includes directive

### Step 5: Spawn Planner

**MANDATORY**: You MUST spawn a sub-agent using the Task tool. Do NOT attempt to plan yourself.
Task(...)
```

## Checklist for Skill Authors

When writing or updating a skill that needs sub-agent spawning:

- [ ] Added "Sub-agent Delegation Requirements" section at top
- [ ] Listed all required sub-agents for the skill
- [ ] Each spawn point has **MANDATORY** directive
- [ ] Each spawn point has explicit Task() syntax
- [ ] File contents read before Task() calls (no @ references)
- [ ] Model resolution table included
- [ ] Parallel spawns shown in same code block
- [ ] No vague "spawn X agent" text remains
