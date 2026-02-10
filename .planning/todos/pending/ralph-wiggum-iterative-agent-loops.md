---
title: Research & implement "Ralph Wiggum" iterative agent loop feature
area: workflow
created: 2026-02-10
source: conversation
---

## Context

User wants to adopt the "Ralph Wiggum" pattern (https://awesomeclaude.ai/ralph-wiggum) — an iterative loop technique where implementation agents run multiple passes over output to progressively improve accuracy. This would integrate into the Luca workflow system, likely during the execution step.

## Task

1. **Research the Ralph Wiggum pattern** — Review the source material at https://awesomeclaude.ai/ralph-wiggum to understand the full technique, its mechanics, and intended benefits.

2. **Comprehensive platform review** — Audit the current Luca workflow system (especially execution steps, agent orchestration, skill definitions) to identify the best integration points for iterative agent loops.

3. **Design the feature** with these requirements:
   - Configurable number of iterations (manual override or dynamically determined based on task complexity)
   - Support for running loops on specific individual agents
   - Support for running multiple specialized agents in parallel within the loop
   - Maximize benefit and token efficiency
   - Fit naturally into existing Luca workflow conventions

4. **Implement the feature** — Build it into the workflow system with appropriate skill definitions, configuration, and documentation.

## Notes

- The pattern is about running implementation agents in a loop to achieve more accurate outputs through iterative refinement
- Key design considerations: iteration count (static vs dynamic), agent selection (single vs parallel), token budget awareness
- Should integrate cleanly with the existing `/lu-execute-phase` and related execution workflows
- Consider how WORKING.md / session memory could track iteration state and convergence
- Reference: https://awesomeclaude.ai/ralph-wiggum
