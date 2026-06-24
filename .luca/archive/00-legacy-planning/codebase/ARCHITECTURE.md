# Architecture

**Analysis Date:** 2026-02-04

## Pattern Overview

**Overall:** Orchestrator/Sub-Agent Delegation Pattern

**Key Characteristics:**

- Lean orchestrators coordinate work, delegate execution to specialized sub-agents
- Sub-agents operate with fresh context windows (no context bleed)
- Template-driven document generation for consistency
- Wave-based parallel execution for independent work
- Goal-backward verification methodology
- Cognitive pre-flight for memory recall and pattern matching

## Layers

**Orchestration Layer:**

- Purpose: Coordinates workflows, spawns sub-agents, handles checkpoints
- Location: `.cursor/skills/` (SKILL.md files)
- Contains: Workflow definitions, agent spawning logic, result aggregation
- Depends on: Agent definitions, template files
- Used by: User commands (e.g., `/lu-plan-phase`, `/lu-execute-phase`)

**Agent Layer:**

- Purpose: Specialized agents for specific tasks (planning, execution, verification, learning)
- Location: `.cursor/agents/` (agent definition files)
- Contains: Agent role definitions, execution flows, success criteria
- Depends on: Workflow templates, reference documents
- Used by: Orchestrators via Task() spawning

**Template Layer:**

- Purpose: Standardized document structures for plans, summaries, state tracking
- Location: `.cursor/luca/templates/`
- Contains: PLAN.md, SUMMARY.md, STATE.md, PROJECT.md, ROADMAP.md templates
- Depends on: None (pure templates)
- Used by: Agents when generating documents

**Reference Layer:**

- Purpose: Shared knowledge and patterns for agents to reference
- Location: `.cursor/luca/references/`
- Contains: Checkpoint patterns, TDD guidelines, planning config, verification patterns
- Depends on: None
- Used by: Agents during execution

**Planning Data Layer:**

- Purpose: Project state, plans, summaries, codebase analysis
- Location: `.planning/`
- Contains: PROJECT.md, ROADMAP.md, STATE.md, phases/, codebase/
- Depends on: Template structures
- Used by: All agents for context

## Data Flow

**Cognitive Pre-Flight Flow:**

1. User initiates command (e.g., `/lu-plan-phase`)
2. Orchestrator spawns `lu-cognition` agent
3. `lu-cognition` reads BRAIN.md (project identity), MEMORY.md (patterns), WORKING.md (session state)
4. Cognitive report generated with memory recall, intuition flags, task classification
5. Report passed to router or planner

**Planning Flow:**

1. `/lu-plan-phase` orchestrator loads STATE.md, PROJECT.md, ROADMAP.md
2. Spawns `lu-planner` sub-agent with phase context
3. Planner reads codebase docs (ARCHITECTURE.md, CONVENTIONS.md, etc.) based on phase type
4. Planner applies goal-backward methodology to derive must_haves
5. Planner creates PLAN.md files with tasks, dependencies, waves
6. Plans written to `.planning/phases/XX-name/`
7. ROADMAP.md updated with plan details

**Execution Flow:**

1. `/lu-execute-phase` orchestrator discovers plans, groups by wave
2. For each wave: spawns parallel `lu-executor` agents (one per autonomous plan)
3. Each executor loads PLAN.md, executes tasks atomically
4. Each task committed individually with conventional commit messages
5. After all tasks: executor creates SUMMARY.md
6. Executor updates STATE.md with position and decisions
7. Orchestrator aggregates results, presents wave completion

**Verification Flow:**

1. After all plans complete, orchestrator spawns `lu-verifier` agent
2. Verifier checks must_haves (truths, artifacts, key_links) against actual codebase
3. Verifier creates VERIFICATION.md with status (passed/human_needed/gaps_found)
4. If gaps found: user runs `/lu-plan-phase {phase} --gaps` to create gap closure plans
5. Gap closure plans execute, verification re-runs

**Learning Flow:**

1. After verification passes, orchestrator spawns `lu-learner` agent
2. Learner reads WORKING.md (session findings)
3. Learner extracts validated patterns, decisions, pitfalls
4. Learner updates MEMORY.md with new learnings
5. WORKING.md cleared for next session

**State Management:**

- **BRAIN.md**: Project identity, conventions, personality (loaded at session start)
- **MEMORY.md**: Long-term validated patterns, decisions, pitfalls (selectively recalled)
- **WORKING.md**: Session-specific findings, hypotheses, progress (cleared after learning)
- **STATE.md**: Project position, accumulated decisions, blockers (persists across sessions)
- **PROJECT.md**: Requirements, constraints, key decisions (evolves with project)
- **ROADMAP.md**: Phase structure, goals, success criteria (updated as phases complete)

## Key Abstractions

**Agent Definition:**

- Purpose: Encapsulates specialized behavior for a specific task domain
- Examples: `lu-planner.md`, `lu-executor.md`, `lu-verifier.md`, `lu-router.md`
- Pattern: YAML frontmatter (name, description, tools, color) + role definition + execution flow
- Location: `.cursor/agents/`

**Workflow Orchestration:**

- Purpose: Coordinates multi-step processes with agent delegation
- Examples: `execute-phase.md`, `map-codebase.md`, `plan-phase.md`
- Pattern: Step-by-step process with agent spawning, checkpoint handling, result aggregation
- Location: `.cursor/luca/workflows/`

**Plan Structure:**

- Purpose: Executable task breakdown optimized for parallel execution
- Examples: `{phase}-{plan}-PLAN.md` files
- Pattern: Frontmatter (wave, depends_on, files_modified, must_haves) + XML task definitions
- Location: `.planning/phases/XX-name/`

**Summary Structure:**

- Purpose: Completion documentation with dependency graph metadata
- Examples: `{phase}-{plan}-SUMMARY.md` files
- Pattern: Frontmatter (requires, provides, affects, tech-stack) + execution details
- Location: `.planning/phases/XX-name/`

**Checkpoint System:**

- Purpose: Pause execution for user interaction (verification, decisions, manual actions)
- Examples: `checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`
- Pattern: Agent executes until checkpoint, returns structured state, fresh continuation agent spawned
- Location: Defined in PLAN.md tasks, handled by execute-phase orchestrator

## Entry Points

**User Commands (Skills):**

- Location: `.cursor/skills/lu-*/SKILL.md`
- Triggers: User types `/lu-*` command in Cursor
- Responsibilities: Parse arguments, spawn orchestrator workflow, present results

**Orchestrator Workflows:**

- Location: `.cursor/luca/workflows/*.md`
- Triggers: Spawned by skills or other orchestrators
- Responsibilities: Coordinate multi-agent workflows, handle checkpoints, aggregate results

**Agent Execution:**

- Location: `.cursor/agents/*.md`
- Triggers: Spawned by orchestrators via Task() tool
- Responsibilities: Execute specific domain tasks (plan, execute, verify, learn)

## Error Handling

**Strategy:** Automatic deviation handling with tracking

**Patterns:**

- **Auto-fix bugs**: Fix immediately, track in SUMMARY.md deviations section
- **Missing critical**: Add required work (security, validation), track as deviation
- **Blocking dependencies**: Install missing packages, add required files, track as deviation
- **Checkpoint failures**: User provides feedback, continuation agent spawned with context
- **Agent failures**: Orchestrator detects missing SUMMARY.md, reports failure, asks user how to proceed

## Cross-Cutting Concerns

**Logging:** WORKING.md captures session findings, MEMORY.md stores validated patterns

**Validation:** Goal-backward verification checks must_haves (truths, artifacts, key_links) against codebase

**Authentication:** Checkpoint system handles auth gates (Claude tries automation → auth error → checkpoint → user authenticates → retry)

**Context Management:** Fresh context per agent (no bleed), orchestrator stays lean (~10-15% context), sub-agents get full context windows

**Parallel Execution:** Wave-based grouping (plans with no dependencies = Wave 1, parallel execution), file ownership prevents conflicts

**State Persistence:** STATE.md tracks position, PROJECT.md tracks decisions, ROADMAP.md tracks progress, MEMORY.md tracks patterns

---

*Architecture analysis: 2026-02-04*
