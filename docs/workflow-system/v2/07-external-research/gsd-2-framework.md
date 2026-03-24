# GSD 2: Get Shit Done -- Autonomous Coding Agent

## Source

- **URL**: https://github.com/gsd-build/gsd-2
- **Fetched**: 2026-03-22
- **Relevance**: HIGH

## Summary

GSD 2 is the evolution of the original "Get Shit Done" prompt framework into a standalone TypeScript CLI built on the Pi SDK. The key insight driving v2: v1 was a prompt framework that could only _ask_ the LLM to do things (manage context, clear sessions, track progress), while v2 is an application that _controls_ the agent harness directly. This gives it programmatic control over context windows, sessions, git branches, cost tracking, stuck detection, and crash recovery.

GSD structures work into a strict hierarchy: Milestone (shippable version, 4-10 slices) -> Slice (one demoable vertical capability, 1-7 tasks) -> Task (one context-window-sized unit of work). The "iron rule" is that a task must fit in one context window. Each slice flows through phases automatically: Plan (with integrated research) -> Execute (per task) -> Complete -> Reassess Roadmap -> Next Slice. Auto mode (`/gsd auto`) is a state machine driven by files on disk -- it reads `.gsd/STATE.md`, determines the next unit of work, creates a fresh agent session, injects a focused prompt with all relevant context pre-inlined, and lets the LLM execute.

The framework features comprehensive context engineering with purpose-built artifacts (PROJECT.md, DECISIONS.md, KNOWLEDGE.md, RUNTIME.md, STATE.md, per-milestone ROADMAP/CONTEXT/RESEARCH, per-slice PLAN/UAT, per-task PLAN/SUMMARY), git worktree isolation per milestone with squash merge, complexity-based model routing, token optimization profiles, verification enforcement with auto-fix retries, stuck detection via sliding-window patterns, and crash recovery with session forensics.

## Key Patterns Relevant to Luca v2

### Iron Rule: Task = One Context Window

- **What**: Tasks are explicitly sized to fit in a single context window. If a task cannot fit, it must be split into two tasks.
- **How it applies to v2**: This validates Luca v2's "bite-sized implementation tasks" concept. Research should identify the natural decomposition boundaries, and the planner should enforce the one-context-window constraint.
- **Confidence**: HIGH

### Fresh Session Per Unit

- **What**: Every task, research phase, and planning step gets a clean context window. No accumulated garbage from prior work.
- **How it applies to v2**: This is the strongest validation of Luca v2's per-task context recall design. Rather than carrying forward a degrading context, start fresh and inject only what's needed from MuninnDB + research files.
- **Confidence**: HIGH

### Context Pre-Loading (Not Discovery)

- **What**: Dispatch prompts include inlined task plans, slice plans, prior task summaries, dependency summaries, roadmap excerpts, and decisions register. The LLM starts with everything it needs.
- **How it applies to v2**: Per-task context recall should assemble a focused context package: relevant research excerpts, plan for this task, summaries of completed dependent tasks, and recalled MuninnDB engrams. Inject it all at dispatch time.
- **Confidence**: HIGH

### Sliding-Window Stuck Detection

- **What**: A pattern detector identifies repeated dispatch patterns (including multi-unit cycles). On detection, it retries once with deep diagnostic. If it fails again, auto mode stops.
- **How it applies to v2**: Review loops need similar convergence detection. If a reviewer keeps flagging the same issues across iterations, the loop should escalate rather than spin.
- **Confidence**: HIGH

### Adaptive Replanning After Each Slice

- **What**: After each slice completes, the roadmap is reassessed. If work revealed new information, slices are reordered, added, or removed.
- **How it applies to v2**: After each phase completes, the plan should be re-evaluated against research findings. MuninnDB can store the rationale for plan changes, creating an audit trail.
- **Confidence**: MEDIUM

### KNOWLEDGE.md as Cross-Session Learning

- **What**: A persistent file capturing rules, patterns, and lessons learned across sessions.
- **How it applies to v2**: This is a file-based precursor to MuninnDB graduation. GSD writes to KNOWLEDGE.md; Luca v2 should graduate learnings from research files into MuninnDB engrams, which is strictly more powerful (semantic recall, linking, structured types).
- **Confidence**: HIGH

### Verification Ladder

- **What**: Static checks -> command execution -> behavioral testing -> human review (only when agent cannot verify itself).
- **How it applies to v2**: Luca v2's verification should follow the same escalation: automated harness first (tests, types, lint), then agent-based semantic review, then human review only when automated paths are exhausted.
- **Confidence**: HIGH

### Two-Terminal Workflow (Build + Steer)

- **What**: Auto mode runs in one terminal; a second terminal allows discussion, status checks, and queuing without stopping execution.
- **How it applies to v2**: Consider supporting async steering during execution -- allowing the user to inject decisions or redirect priorities at phase boundaries without interrupting the current task.
- **Confidence**: MEDIUM

## Specific Techniques to Adopt

- **Hallucination guard**: Reject agent completions with zero tool calls as hallucinated (GSD found agents producing detailed but fabricated summaries without writing code, wasting ~$25/milestone)
- **Merge anchor verification**: Before deleting a branch/worktree, verify the code is actually on the integration branch
- **Crash-safe task closeout**: Orphaned checkboxes in plans should be unchecked on retry to prevent phantom task completion
- **YAML frontmatter in summaries**: Task summaries with structured metadata (T01-SUMMARY.md) enable programmatic aggregation
- **Complexity-based model routing**: Simple docs tasks get fast/cheap models; complex architectural work gets capable models (mirrors Luca's existing model routing)
- **Budget pressure graduation**: Progressively downgrade models as budget ceiling approaches (50%, 75%, 90% thresholds)
- **Timeout supervision**: Soft timeout (warn to wrap up) -> idle watchdog (detect stalls) -> hard timeout (pause)
- **Dependency-aware dispatch**: Use declared `depends_on` instead of positional ordering for task execution

## Specific Techniques to Avoid

- **File-on-disk state machine**: GSD reads `.gsd/STATE.md` to determine next action. Luca already has a typed state machine with bridge CLI -- don't regress to pure file-based state
- **Research merged into planning**: GSD's ADR-003 merged research into planning phase. Luca v2 is explicitly separating them for deeper research -- don't follow this consolidation
- **npm/Node.js runtime**: GSD is built on Pi SDK with Node.js. Luca uses Bun exclusively
- **Worktree-per-milestone by default**: GSD isolates milestones in worktrees. Luca's worktree strategy should remain task/phase-scoped, not milestone-scoped

## Quotes / Key Excerpts

> "The iron rule: a task must fit in one context window. If it can't, it's two tasks."

> "Fresh session per unit -- Every task, every research phase, every planning step gets a clean 200k-token context window. No accumulated garbage."

> "Auto mode is a state machine driven by files on disk. It reads .gsd/STATE.md, determines the next unit of work, creates a fresh agent session, injects a focused prompt with all relevant context pre-inlined, and lets the LLM execute."

> "The original GSD went viral as a prompt framework for Claude Code. It worked, but it was fighting the tool -- injecting prompts through slash commands, hoping the LLM would follow instructions, with no actual control over context windows, sessions, or execution."

> "Hallucination guard -- execute-task agents that complete with zero tool calls are now rejected as hallucinated. Previously, agents could produce detailed but fabricated summaries without writing any code, wasting ~$25/milestone."
