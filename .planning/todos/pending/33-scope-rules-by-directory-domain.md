---
title: Scope rules by directory/domain to reduce context saturation
area: context
created: 2026-03-02
source: conversation — Stripe Minions blog review
---

## Context

Stripe conditionally applies agent rules "based on subdirectories" rather than loading all rules globally. They found that context window saturation from global rules degrades agent performance. Currently Luca loads all `.claude/rules/` files into every conversation regardless of relevance.

## Task

Design and implement a scoping mechanism for rules so they only activate when relevant:

1. **Add glob/scope metadata to rules** — e.g., `api-snake-case.md` only applies when touching files matching `src/**/api/**` or `**/schemas/**`
2. **Domain-aware rule loading** — rules tagged for specific domains (agents, skills, harness, etc.) only load when working in those domains
3. **Evaluate Claude Code's built-in glob support** — `.claude/rules/` files support glob-based activation; audit which rules should use this vs `alwaysApply`

## Notes

- Source: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- This directly impacts token usage and agent quality at high context usage
- Aligns with Luca's own quality degradation curve (50-70% context = DEGRADING)
- Start with an audit: which of our current rules are truly global vs domain-specific?
- Candidates for scoping: `api-snake-case.md` (API only), `posthog-integration.md` (analytics only), `atlassian-mcp.md` (Jira tasks only)
