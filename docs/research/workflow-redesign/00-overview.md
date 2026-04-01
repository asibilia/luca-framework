# Workflow Redesign Research

> **Date:** 2026-03-31
> **Status:** Active brainstorming
> **Goal:** Redesign the `/lu` end-to-end workflow, restoring lost capabilities and incorporating learnings from GSD2.

## Background

The Luca framework's `/lu` orchestrator lost key capabilities during the migration from Skill() chaining to flat Agent() orchestration (fixing a skill-skipping bug). The original autopilot had a 7-step lifecycle; only the phase execution loop and milestone completion survived the flattening.

Simultaneously, the GSD framework (which originally inspired Luca) evolved from a Claude Code prompt framework (GSD v1) into a standalone CLI on the Pi SDK (GSD v2). The GSD2 creator encountered many of the same problems we have and arrived at architectural decisions worth studying.

## What Was Lost in Flattening

| Capability                                                                | Original Location                                     | Current Status                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Milestone bootstrapping (questioning → research → requirements → roadmap) | autopilot Step 6 → `Skill("milestone-new")`           | Gone — `/lu` assumes ROADMAP.md exists             |
| Backlog WSJF scoring                                                      | autopilot Step 2 → `Task("lu-pm-planner")`            | Gone — backlog scan only reads, doesn't score      |
| Roadmap revision (absorb unplanned todos into phases)                     | autopilot Step 2                                      | Gone                                               |
| Cross-milestone loop                                                      | autopilot Step 6 → `Skill("milestone-new")` → restart | Dead code — Step 9 references it but can't execute |
| Oversight gate matrix (full-auto / flagged / milestone / phase)           | autopilot oversight_gates section                     | Partially kept — flag exists, behavior matrix gone |
| Phase parking + cascade prevention                                        | autopilot Steps 4a, 4g                                | Partially kept — thin                              |
| Implementation looping (plan → execute → verify → gap-close → re-verify)  | autopilot Step 4f-4g                                  | Gap closure runs after commit (wrong ordering)     |

## Design Principles (Established)

1. **No routing, no skipping.** Every task enters the same structured pipeline. Complexity controls model tier and loop budgets only.
2. **Backfill, don't skip.** If a step discovers missing prerequisites, it triggers upstream steps to get into the right state.
3. **Flat orchestration.** All Agent() calls originate from `/lu`. Sub-agents are leaf workers.
4. **Commit only verified code.** The implementation loop must pass before code review or commit.

## Documents in This Directory

| File                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `00-overview.md`          | This file — context and index                        |
| `01-proposed-pipeline.md` | The proposed 9-step end-to-end pipeline              |
| `02-gsd2-learnings.md`    | 10 key learnings from GSD2's architecture            |
| `03-gsd2-comparison.md`   | Side-by-side comparison of GSD2 vs Luca approaches   |
| `04-research/*.md`        | Deep-dive research on each learning's implications   |
| `05-synthesis.md`         | (TBD) Synthesized recommendations after research     |
| `06-final-workflow.md`    | (TBD) The cohesive end-to-end workflow specification |
