---
title: Add adversarial debate round to milestone-audit using agent teams
area: framework/skills
created: 2026-03-02
source: conversation — Stripe Minions blog review + Claude Code agent teams docs analysis
---

## Context

Reviewed Stripe's Minions blog posts and Claude Code's agent teams documentation. Stripe uses an "adversarial debate" pattern where reviewers don't just independently report — they actively challenge each other's findings, leading to higher-confidence results. Claude Code's agent teams feature (TeamCreate, SendMessage, shared task lists) enables this pattern natively.

Currently `milestone-audit` spawns 6 parallel subagents that each return independent YAML reports. The orchestrator merges findings but reviewers never interact. This is correct for today's read-only parallel analysis, but leaves value on the table.

## Task

Add an optional "debate round" to `milestone-audit` that converts the review from parallel subagents to an agent team:

1. **Phase 1 — Independent Review (existing):** Each reviewer analyzes their domain independently (security, DX, architecture, etc.) and produces initial findings
2. **Phase 2 — Adversarial Debate (new):** Reviewers share findings with each other via SendMessage and challenge/validate each other's conclusions:
   - Security reviewer asks architect: "You flagged this module boundary violation — does it also create an auth bypass?"
   - DX reviewer asks simplifier: "You found duplication in X — I found the same pattern in Y, should we consolidate?"
   - Architect challenges security: "You flagged this as critical but the data never leaves the trust boundary"
3. **Phase 3 — Consensus Synthesis:** Lead aggregates debate-refined findings with higher confidence ratings

### Implementation approach

- Use `TeamCreate` to create a `milestone-review` team
- Spawn reviewers as teammates (not subagents) so they can use `SendMessage` for peer communication
- Use shared task list: Phase 1 tasks (independent review) → Phase 2 tasks (cross-review debate) → Phase 3 (synthesis)
- Gate behind complexity: only activate debate round at COMPLEX/CRITICAL levels (subagents remain for MODERATE)

### Key decision points

- **Experimental status:** Agent teams are experimental with known limitations (no session resumption, shutdown can be slow). May want to wait for GA.
- **Token cost:** Teams use "significantly more tokens" — debate round roughly doubles the review cost. Gate behind complexity level.
- **Opt-in flag:** Consider `--with-debate` flag or complexity gating rather than always-on

## Notes

- Source: Stripe Minions blog (https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2)
- Source: Claude Code docs (https://code.claude.com/docs/en/agent-teams)
- Key Stripe quote: "each one's job is not only to investigate its own theory but to challenge the others'"
- Claude Code docs literally use parallel code review as the example use case for agent teams
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to be enabled in settings
- Current skill: `src/skills/general/milestone-audit.skill.ts`
- Related: todo #32 (iteration caps), todo #33 (scoped rules) — all from same Stripe research
