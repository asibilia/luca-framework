---
title: "Layer 3: Pre-step hook enforcement (framework-level guardrails)"
area: hooks
created: 2026-03-28
source: conversation
---

## Context

Strands Agents SDK achieved **100% task completion accuracy** with steering hooks vs 82.5% with simple prompts. AgentSpec (ICSE 2026) formalized trigger-predicate-enforcement rules with >90% unsafe execution prevention at millisecond overhead. The key insight: "The hook runs outside the LLM. The decision is not the LLM's to make."

## Task

### Part A: Pre-Step Gate Hook

Create `src/hooks/scripts/pre-step-gate.ts`:

- **Trigger**: `PreToolUse` matching `Skill()` or `Task()` calls
- **Logic**: Read current skill state from `.planning/skill-state/{skill}.json`, check if the invoked step's prerequisites are met per the DAG
- **Block**: If prerequisites not met, return `{ blocked: true, message: "BLOCKED: Step X requires state Y" }`
- **Pass**: If prerequisites met, allow the tool call

### Part B: Post-Step Completion Hook

Create `src/hooks/scripts/post-step-validate.ts`:

- **Trigger**: `PostToolUse` after `Skill()` or `Task()` returns
- **Logic**: Validate that the step produced required evidence (output schema check)
- **Action**: Log step completion to session ledger; update skill state via bridge

### Part C: Integration with Existing Hook System

- Follows same pattern as `pre-commit-gate` and `vault-guard`
- Register in `.claude/settings.json` hooks section
- Source in `src/hooks/scripts/`, generated to `.claude/hooks/` via `bun run build:all`

### Design Principles

- Hooks are deterministic shell/TypeScript — no LLM reasoning
- Millisecond overhead (read JSON file, check map lookup)
- Unbypassable — operates at framework level outside the LLM's decision loop
- Clear error messages guide the LLM to complete prerequisites

## Notes

- Research: `docs/research/anti-step-skipping/04-novel-approaches.md` (Section 3)
- Luca already has hook infrastructure in `src/hooks/` and `.claude/settings.json`
- Depends on Layer 2 (skill state machines) for state to check against
- Estimated effort: 1-2 days
