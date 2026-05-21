---
title: Create repo structure architect / maintainer subagent
area: framework
created: 2026-02-16
source: conversation
---

## Context

The luca-framework codebase has grown significantly with multiple packages, skills, agents, and planning artifacts. Recent v1.7.0 work (branch 18) involved consolidating test files, cleaning directories, and fixing package configuration health — all manual efforts that could be automated via a dedicated subagent.

## Task

Design and implement a repo structure architect / maintainer subagent that can:

- **Audit repo structure** — Detect orphaned files, misplaced tests, empty directories, inconsistent naming
- **Enforce conventions** — Validate kebab-case file naming, proper `__tests__/` placement, package.json health
- **Suggest reorganization** — Identify when packages should be split, merged, or restructured
- **Maintain hygiene** — Clean build artifacts, validate import paths, detect circular dependencies
- **Report health metrics** — Generate a repo structure health score with actionable items

## Notes

- Should integrate with existing luca agent/skill patterns (functional, not class-based)
- Could leverage existing work from v1.7.0 codebase health milestone as a foundation
- Related pending todos: `consolidate-test-file-placement`, `clean-empty-dirs-and-phase-gaps`, `package-json-health`
- Consider making it runnable as both a skill (interactive) and a hook (automated on phase boundaries)
- Should respect complexity gating — lightweight checks at TRIVIAL/SIMPLE, full audit at COMPLEX/CRITICAL
