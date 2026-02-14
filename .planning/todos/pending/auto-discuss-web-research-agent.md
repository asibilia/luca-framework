---
title: Auto-discuss mode -- web research agent answers discussion questions autonomously
area: workflow
created: 2026-02-13
source: conversation
---

## Context

The `phase-discuss` skill (`.claude/skills/phase-discuss/SKILL.md`) prompts the user through a multi-step interactive flow:

1. Presents gray areas and asks which to discuss (user always selects all)
2. For each gray area, presents multiple-choice questions about direction
3. User manually selects answers for each question

This is tedious when the user wants AI-driven recommendations rather than manual selection.

## Task

Add an "auto-discuss" option to the discuss workflow that:

1. **Auto-selects all gray areas** (skips the "which to discuss?" prompt)
2. **For each discussion question/choice**, spawns a web research agent that:
   - Searches the web for current best practices, patterns, and prior art relevant to the question
   - Evaluates each proposed option against research findings
   - Selects the best option with a rationale citing sources
3. **Presents a summary** of all auto-answered decisions with research citations before writing CONTEXT.md
4. **Allows user override** -- user can review the auto-answers and change any before finalizing

## Implementation Ideas

- Could be a flag on the discuss skill (e.g., `--auto` or `--research-mode`)
- Could be a separate skill variant (e.g., `phase-discuss-auto`)
- Should use `WebSearch` / `WebFetch` tools or a Task agent with web access
- Each question should be independently researched (parallelizable)
- Research should be scoped to the project's tech stack (from BRAIN.md) for relevance

## Notes

- The user's stated pattern: always selects all discussion topics, then manually picks from multiple-choice options
- Goal: reduce friction by having AI research the best answers instead of requiring manual selection
- Should still produce the same CONTEXT.md output format for downstream compatibility
- Consider caching research results so re-running discuss doesn't repeat web searches
