# Workflow Orchestration: v2 Pipeline Reference

As-built reference for the Luca v2 workflow pipeline implemented in `src/skills/luca/lu.skill.ts`. This document describes the system as it actually works, not aspirational design.

## Overview

The v2 pipeline extends v1 by inserting a structured research-review-graduation cycle before planning. In v1, the orchestrator moves directly from classification to discussion to planning. In v2, four parallel research specialists investigate the phase scope, three cold-isolated reviewers audit their findings, and a graduation agent promotes validated research into MuninnDB engrams -- all before the planner ever sees the phase.

The orchestrator (`lu`) is a flat Agent() spawner. It makes every decision and delegates all leaf work to sub-agents that cannot spawn further agents. All prompt templates live in `src/skills/__helpers/agent-prompts.ts`.

## Canonical Pipeline Steps

The pipeline has 11 top-level steps. Steps 7d-v2 through 7g-v2 are the v2-only additions.

| Step  | Name                  | Agent(s) / Skill(s)                                                                       | Key Input                   | Key Output                           |
| ----- | --------------------- | ----------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| 1     | Init + Crash Recovery | (inline)                                                                                  | CLI args, context-cli state | `/tmp/lu-context.json` initialized   |
| 2     | Ideate                | cognition, classify                                                                       | Task description, STATE.md  | Complexity level, route decision     |
| 3     | Route Branch          | route handler (varies)                                                                    | Route type                  | Non-phase-execute routes exit here   |
| 4     | Configure Session     | configure                                                                                 | Config, flags               | Session parameters, v2 flag resolved |
| 4.5   | Git Workflow Setup    | (inline)                                                                                  | Milestone/task info         | GitHub issue, feature branch         |
| 5     | Backlog Scan          | backlog                                                                                   | `todos/pending/`            | Surfaced backlog items (conditional) |
| 6     | Build Execution Order | (inline)                                                                                  | ROADMAP.md                  | Ordered phase list, dependency graph |
| 7     | Phase Loop            | (see sub-steps below)                                                                     | Phase list                  | Executed, verified, committed phases |
| 8     | Milestone Boundary    | milestone-learn, milestone-prune, milestone-shadow, milestone-archive, milestone-finalize | All phase results           | Archive, PR, git tag                 |
| 9     | Cross-Milestone       | (inline)                                                                                  | Config cross_milestone flag | Loop to Step 6 or exit               |
| 10-11 | Gap Audit + Cleanup   | (inline)                                                                                  | Context sections            | Advisory warnings, state transition  |

## Phase Loop Sub-Steps (Step 7)

Each phase executes serially through these sub-steps:

| Sub-Step | Name                  | v2 Only | Agent(s)                              | Notes                                     |
| -------- | --------------------- | ------- | ------------------------------------- | ----------------------------------------- |
| 7a       | Dependency check      | No      | (inline)                              | Park phase if deps incomplete             |
| 7b       | Oversight gate        | No      | (inline)                              | Prompt user unless full-auto              |
| 7c       | Per-phase re-classify | No      | classify-{NN}                         | Complexity may differ per phase           |
| 7d       | Gate resolution       | No      | (inline)                              | Resolves premortem, process_data flags    |
| 7d-v2a   | Research Scope        | Yes     | research-scope-{NN}                   | Produces RESEARCH-SCOPE.md                |
| 7d-v2b   | Parallel Research     | Yes     | 4 specialists (arch, impl, eco, risk) | Spawned simultaneously                    |
| 7d-v2c   | Research Synthesis    | Yes     | research-synth-{NN}                   | Merges specialist findings                |
| 7d-v2d   | Research Review Loop  | Yes     | 3 reviewers x N iterations            | Accuracy, completeness, actionability     |
| 7d-v2e   | Research Graduation   | Yes     | research-graduate-{NN}                | Promotes findings to MuninnDB             |
| 7e       | Discussion            | No      | discuss-{NN}                          | Conditional; includes premortem if gated  |
| 7f       | Plan existence check  | No      | (inline)                              | Skip planning if PLAN.md exists           |
| 7g       | Planning              | No      | plan-{NN}                             | Produces PLAN.md with WSJF-scored waves   |
| 7g-v2    | Plan Review Loop      | Yes     | plan-review + plan-revise x N         | Convergence loop: approve/revise/escalate |
| 7h       | Execution             | No      | execute-{NN}                          | Runs wave tasks via lu-executor           |
| 7i       | Harness Fix Loop      | No      | harness-{NN}, fix-{NN}                | Up to HARNESS_FIX_ITERATIONS attempts     |
| 7j       | Goal-backward Verify  | No      | verify-{NN}                           | Checks phase goals are met                |
| 7k       | Code Review           | No      | 4 parallel reviewers                  | Conditional: complexity >= MODERATE       |
| 7l       | Learning Capture      | No      | learn-{NN}                            | Stores patterns/pitfalls in MuninnDB      |
| 7m       | Process Data          | No      | process-data-{NN}                     | Conditional: --run-process-data           |
| 7n       | Commit                | No      | (inline)                              | `feat(#ISSUE): Phase NN -- description`   |
| 7o       | Update State          | No      | (inline)                              | Mark phase complete in ROADMAP.md         |
| 7p       | Gap Closure Retry     | No      | plan-gaps, execute-gaps               | Retry loop if phase had failures          |

## Step Details

### Step 2: Ideate (Cognitive Pre-Flight + Classify + Route)

Two agents spawn: `cognition` loads the project brain tree and relevant MuninnDB engrams (patterns, pitfalls, decisions) to establish session context. `classify` analyzes the task description against the codebase to determine complexity level (TRIVIAL through CRITICAL) and route type (phase-execute, debug, quick-fix, etc.). The state machine transitions to `routed` via `ROUTE_COMPLETE`.

### Step 7d-v2a-b: Research Scope + Parallel Research

The scope agent reads the phase goal and produces `RESEARCH-SCOPE.md` with assignments for four specialist domains. Then four research agents spawn in parallel:

- **Architecture** -- structural patterns, dependency impacts, integration points
- **Implementation** -- concrete APIs, code patterns, existing utilities to reuse
- **Ecosystem** -- external libraries, Bun APIs, relevant tooling
- **Risk** -- failure modes, performance concerns, security implications

Each specialist writes a numbered research file under `phases/{NN}-{desc}/research/`.

### Step 7d-v2c: Research Synthesis

A synthesis agent merges the four specialist outputs into a single coherent research summary, resolving contradictions and identifying remaining gaps.

### Step 7d-v2d: Research Review Loop

Three cold-isolated reviewers evaluate the synthesized research in parallel:

- **Accuracy** -- Are claims factually correct? Do code references exist?
- **Completeness** -- Are there gaps in the research relative to the phase scope?
- **Actionability** -- Can a planner turn these findings into concrete tasks?

If any reviewer flags CRITICAL_GAPS, an expand agent fills the gaps and the synthesis agent re-merges. This iterates up to `researchReviewIterations` (configured in `config.json` complexity matrix).

### Step 7d-v2e: Research Graduation

The graduation agent (`lu-research-graduator`) promotes validated research findings into MuninnDB engrams with appropriate concept prefixes (`pattern:*`, `pitfall:*`, `decision:*`). Research files remain in the phase directory; graduated engrams persist across sessions.

### Step 7g: Planning (with WSJF Scoring)

The planner reads the phase goal, discussion context, and (in v2) graduated research. It produces `PLAN.md` with tasks grouped into waves, scored by Weighted Shortest Job First (WSJF) factors: business value, time criticality, risk reduction, and estimated effort.

### Step 7g-v2: Plan Review Loop

A plan reviewer evaluates the plan and recommends one of: `approve`, `revise`, or `escalate`. On `revise`, a revision agent updates the plan based on the reviewer's issues. On `escalate`, the orchestrator prompts the user for a decision. This iterates up to `planReviewIterations`. The loop tracks `PREVIOUS_ISSUES` to prevent regression.

### Step 7h-i: Execution + Harness Fix Loop

The executor runs wave tasks. After execution, the harness runs mechanical checks (typecheck, build). If the harness fails, a fix agent attempts repairs, and the harness re-runs. This iterates up to `harnessFixIterations`.

### Step 7j-k: Verification + Code Review

Goal-backward verification checks that phase objectives are actually met (not just that code compiles). Code review spawns four parallel reviewers -- architecture, DX advocate, security, and simplifier -- for phases at MODERATE complexity or above.

### Step 8: Milestone Boundary

When all phases in a milestone complete, five agents run in sequence: learning capture (milestone-level patterns), memory pruning (outdated engrams), shadow cleanup (misplaced files), archive (milestone snapshot), and finalize (version tag). If a feature branch exists, a PR is created via `gh pr create` linking back to the GitHub issue from Step 4.5.

## v2 Activation

v2 is enabled by either mechanism:

1. **Config** -- Set `workflow.version` to `"v2"` in `.planning/config.json`
2. **CLI flag** -- Pass `--v2` to the `/lu` command (overrides config)

Default is `"v1"`. When v2 is active, the research pipeline (7d-v2a through 7d-v2e) and plan review loop (7g-v2) execute. All other steps are shared between v1 and v2.

**Graceful degradation:** If any v2 step fails (agent error, timeout, malformed output), the orchestrator logs the failure and skips remaining v2 steps for that phase. Execution continues at Step 7e (Discussion) with whatever research context is available. The v1 pipeline is never blocked by v2 failures.

## Iteration Budgets

Loop depths are configured per complexity level in `.planning/config.json`:

| Parameter                  | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
| -------------------------- | ------- | ------ | -------- | ------- | -------- |
| Research review iterations | 1       | 1      | 1        | 2       | 3        |
| Plan review iterations     | 1       | 1      | 1        | 2       | 3        |
| Harness fix iterations     | 1       | 2      | 2        | 2       | 3        |
| Verify fix iterations      | 1       | 1      | 1        | 1       | 2        |

## Key Implementation Details

- **Crash recovery**: Step 1 reads `pipeline_position` from the state machine and `/tmp/lu-context.json` state. If a position other than `idle` is found, completed steps are skipped.
- **Gate enforcement**: Premortem and process_data gates are resolved by the orchestrator via `luca-bridge gate-check` and passed as `--run-*`/`--skip-*` flags to sub-agents. Sub-agents never resolve gates themselves (fail-closed semantics).
- **Context file**: `/tmp/lu-context.json` tracks loop counters, git workflow info, and sub-agent outputs across the pipeline. Managed via `context-cli.ts`.
- **Commit convention**: Each phase commits as `feat(#ISSUE_NUMBER): Phase NN -- description` on the feature branch. Commits are pushed after each phase.

## Reference

- **Orchestrator source**: `src/skills/luca/lu.skill.ts`
- **Prompt templates**: `src/skills/__helpers/agent-prompts.ts`
- **v2 design specification**: `docs/archive/workflow-v2-spec/` (74-file archive covering design principles, research system, MuninnDB integration, agent orchestration, review loops, and implementation plan)
- **Workflow diagram**: `docs/diagrams/workflow-overview.md`
- **Complexity routing**: `src/complexity/__helpers/model-routing.ts`
