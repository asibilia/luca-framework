---
title: Implement writer/reviewer context separation pattern
area: workflow
created: 2026-02-10
source: research (multi-agent patterns)
---

## Context

Currently, code review happens in the same execution context as code writing (lu-execute-phase spawns executors, then spawns reviewers in the same session). Research shows a critical insight: **fresh context eliminates self-bias**. When the same agent (or context lineage) writes and reviews code, it's biased toward confirming its own work.

The writer/reviewer separation pattern uses genuinely separate context windows: one agent writes, a completely separate agent reviews with no memory of the writing process.

## Task

1. **Redesign review agent spawning** — Ensure reviewer sub-agents receive ONLY the code diff and project standards, NOT the execution context or plan rationale
2. **Implement "cold review" mode** — Reviewer gets: changed files, project conventions (BRAIN.md), and nothing else. No plan context, no execution history.
3. **Add cross-session review capability** — For critical/complex work, support spawning a review in a completely separate Claude session
4. **Design review aggregation** — Multiple reviewers' findings merged and deduplicated with severity ranking
5. **Consider adversarial review** — One agent writes tests, a different agent writes code to pass them (TDD with writer/reviewer separation)

## Notes

- Current pattern: executor writes → reviewer reviews (same orchestrator context) — this is suboptimal
- Research: "Fresh context eliminates self-bias" — the reviewer should not know WHY code was written this way
- This pairs with the TDD todo — test-writer and code-writer should be separate agents
- The pattern extends to: one Claude writes tests, another writes code to pass them
- Git worktrees could enable parallel isolated sessions for truly independent review
- This is a relatively simple change with high impact on output quality
