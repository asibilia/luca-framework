---
title: "Scout: Create scout shared sections (extends researcher-shared-sections)"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-2]
---

## Context

Existing researchers share common philosophy, tool strategy, and verification protocol via `src/agents/__helpers/researcher-shared-sections.ts`. Scout agents need similar shared sections plus scout-specific guidance.

## Task

Create `src/agents/__helpers/scout-shared-sections.ts`:

1. **Re-export existing shared sections**: RESEARCHER_PHILOSOPHY, RESEARCHER_TOOL_STRATEGY, RESEARCHER_VERIFICATION_PROTOCOL
2. **Add scout-specific sections**:
   - `SCOUT_CONTEXT`: Explains the scouting pipeline purpose — "You are analyzing an external article for potential improvements to the Luca framework"
   - `SCOUT_OUTPUT_STANDARDS`: How to structure findings for downstream pipeline steps
   - `SCOUT_RELEVANCE_CRITERIA`: What makes something relevant to Luca (agentic development, LLM orchestration, developer tooling, memory systems, verification, step enforcement)
   - `SCOUT_CODEBASE_CONTEXT`: Key architecture files and domains to reference when assessing framework fit

## Notes

- Follow the existing pattern in researcher-shared-sections.ts
- All scout agents import from this file for consistency
- The codebase context section should reference: domain-architecture rule, module-boundary rule, key domains (workflow, agents, skills, harness, iteration, context)
- Keep sections concise — they're injected into agent prompts and consume context
