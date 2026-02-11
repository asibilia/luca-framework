---
title: Build pipeline full registry coverage for agents and rules
area: build
created: 2026-02-10
source: conversation
---

## Context

During a deep audit of the repo architecture, we discovered that the build scripts (`build-cursor.ts`, `build-claude.ts`, `build-all.ts`) only iterate over the `skillRegistry` for skills. Agents and rules are hardcoded to compile only the 2 luca-specific agents (lu-executor, lu-planner) and 1 luca-specific rule (lu-workflow). The 23 general agents and 20 general rules in `src/` are not compiled by the build — the files sitting in `.cursor/agents/` and `.cursor/rules/` were placed at project init and are not regenerated.

This means:
- `.claude/agents/` only has 2 of 25 agents
- `.claude/rules/` only has 1 of 21 rules
- `.cursor/agents/` has all 25 but they may be stale (not rebuilt from src)
- `.cursor/rules/` has 19 but they may be stale (not rebuilt from src)

## Task

1. Create an `agentRegistry` in `src/agents/index.ts` (mirroring `src/skills/index.ts`) that exports all agents from `src/agents/general/` and `src/agents/luca/`
2. Create a `ruleRegistry` in `src/rules/index.ts` (mirroring `src/skills/index.ts`) that exports all rules from `src/rules/general/` and `src/rules/`
3. Update `build-cursor.ts`, `build-claude.ts`, and `build-all.ts` to iterate over all three registries instead of hardcoding individual entities
4. Verify that after rebuild, `.cursor/` and `.claude/` contain all agents, skills, and rules from `src/`
5. Decide on `.gitignore` policy for generated output directories

## Notes

- The `skillRegistry` pattern in `src/skills/index.ts` is the proven model to follow
- The `build-cursor.ts` file has already been updated to use Bun APIs (Bun.write, async/await) — the new registry iteration should follow the same style
- This is critical for dogfooding: this repo should be a first-party consumer of its own framework, with all output generated from source
