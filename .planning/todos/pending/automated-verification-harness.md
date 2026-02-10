---
title: Build automated verification harness (tests + lint + typecheck + build)
area: workflow
created: 2026-02-10
source: codebase-audit + research
---

## Context

Current verification is agent-based (lu-verifier does goal-backward analysis). The strongest pattern across all research: **"AI writes code → Automated tools catch issues → AI fixes them → Human oversees direction."** The automated tools (tests, linters, type-checkers, build) should be the PRIMARY verification signal, with agent-based analysis as secondary.

Currently, test-run, code-lint, and code-typecheck exist as standalone skills but are NOT integrated into the execution pipeline. They're manual invocations. They should run automatically after every execution.

## Task

1. **Design verification harness** — A single orchestrated verification pass that runs:
   - `bun test` (unit + integration tests)
   - `bun run lint` (linting)
   - `bun run typecheck` (type checking)
   - `bun run build` (build succeeds)
   - Custom project-specific checks (configurable)

2. **Integrate into lu-execute-phase** — After wave execution and before agent-based verification:
   - Run harness automatically
   - If any check fails, feed failures to executor for fixing BEFORE verification
   - This creates the tight feedback loop: execute → automated check → fix → re-check → verify

3. **Design harness configuration** — Projects can define which checks run and in what order via `.planning/config.json`

4. **Implement failure-to-fix pipeline** — When automated checks fail:
   - Parse error output
   - Feed structured errors to executor sub-agent
   - Executor fixes
   - Re-run failed checks
   - Loop until pass or max iterations

5. **Add harness to hooks** — Post-edit hooks run lightweight checks (typecheck on changed files); full harness runs at phase boundaries

## Notes

- This is the "virtuous cycle" pattern: AI writes → tools catch → AI fixes → human oversees
- The Ralph Wiggum loop completion condition should be: "all harness checks pass"
- Current skills (test-run, code-lint, code-typecheck) can be composed into the harness
- Research: PRs are ~18% larger with AI, incidents per PR up ~24% — automated gates are essential
- The harness output becomes structured data for the lu-verifier agent to analyze
- This bridges the gap between "agent thinks it's done" and "tools confirm it's done"
