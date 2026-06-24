---
title: Implement TDD-first verification pattern in execution workflow
area: workflow
created: 2026-02-10
source: codebase-audit + research
---

## Context

Current verification is goal-backward analysis after execution (EXISTS → SUBSTANTIVE → WIRED). This is checking *after the fact*. State-of-the-art agentic workflows use Test-Driven Development: write tests BEFORE implementation, confirm they fail (Red), then implement until they pass (Green). This creates a programmatic, machine-verifiable completion signal rather than relying on LLM self-assessment.

Research shows ~45% of AI-generated code contains security flaws. The Ralph Wiggum pattern works best with "programmatic verification (tests pass, build succeeds) rather than subjective self-assessment."

## Task

1. **Design TDD integration into execution phase** — Before each plan executes, generate test stubs that define success criteria programmatically
2. **Add test-generation sub-agent** (`lu-test-writer`) — Generates tests from plan verification criteria
3. **Add Red-Green verification loop** — Confirm tests fail before implementation, pass after
4. **Update lu-executor** — Execute in TDD cycle: read plan → generate tests → confirm red → implement → confirm green
5. **Update lu-verifier** — Use test results as primary verification signal, goal-backward as secondary
6. **Design fallback for non-testable work** — Some tasks (docs, config) can't be TDD'd; define when goal-backward suffices

## Notes

- TDD gives the Ralph Wiggum loop a concrete completion condition: "all tests pass"
- This transforms verification from subjective ("does it look right?") to objective ("do tests pass?")
- The BMAD method uses "90% completeness gate checks" — we can be more precise with actual test coverage
- Consider generating both unit tests and integration tests depending on plan scope
- Test generation is itself a sub-agent task — keeps executor context clean
