# Luca Framework

## Current State

**Latest Version:** v2.5.1
**Status:** Shipped
**Test Count:** 2,694+ (from v2.5.0) + 134 new context tests

## What Shipped in v2.5.1

Code health and test reliability improvements:

- State domain type safety (18+ `any` eliminated)
- 5 barrel files refactored to pure re-exports
- 134 context domain tests added
- Security hardening (sanitizeJsonParse, async Bun APIs)
- Bridge DRY cleanup and null-handling fixes

## Next Milestone Goals

_Planning next milestone. Candidates from backlog:_

- v2.6.0 — Adaptive Learning & Ecosystem (cross-session replay, self-tuning, meta-cognition)
- Adversarial debate patterns for code review and verification
- Iteration cap tightening based on Stripe Minions research
- Scoped rules by directory/domain
- Expanded pre-flight context hydration

## Project Identity

Luca is a framework for agentic development, combining spec-driven development with cognitive memory systems and integrated git workflow. It solves context rot while enabling AI to learn from past experience.

**Stack:** TypeScript, Bun, XState, Zod
**Architecture:** Functional (no classes), domain-based with 4-tier dependency model
**Platforms:** Claude Code, Cursor IDE

---

_Updated: 2026-03-02_
