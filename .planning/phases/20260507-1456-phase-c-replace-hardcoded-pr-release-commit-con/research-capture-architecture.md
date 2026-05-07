# Research Capture — Architecture Review

**Subagent**: researcher
**Perspective**: architecture
**Timestamp**: 2026-05-07T18:56Z

## Findings

Subagent walked instruction-assembly chain, rules loader, skill protocol, consult-pattern from Phase B, tool-permission scoping, vault helpers. Output truncated to summary; key architecture invariants surfaced via patterns + dependencies dimensions:

- **Rules loader** — `loadAlwaysApplyRules()` concatenates all rules with `alwaysApply:true` into every mode agent prompt via `getAgentConstraints()` in `agent-constraints.ts:43-47`. `pr-title-format.md` is the only `alwaysApply` PR/release/commit rule today.
- **Skill protocol** — Skills are markdown read by the invoking agent; SKILL.md prose IS the prompt. Skills cannot call tools directly — they instruct the agent (which holds tools) to call them.
- **Consult-pattern from Phase B** — verbatim template captured in patterns dimension Section 1.
- **Tool-manifest** — `project_preferences` registered for triage/research/architect/execute/review/finalize/build/fast/discuss with `consult` + `consult-section`. Finalize gets `['consult', 'consult-section']` (per finalize.md:343-345 comment & tool-manifest.ts:248). `plan` mode NOT registered (RISK-2).
- **Vault resolution** — `resolveProjectVault()` in `state/vault.ts:39`. Phase A's `MODE_SHARED_PREFIX` and SUBAGENT_SHARED_PREFIX migration handled mode and skill files. Remaining vault prose is in raw-recall sites that need to keep their boilerplate (or replace with one-liner) per RISK-8.

## Architectural debt
- Schema-vs-memory drift (RISK-1) — `ProjectPreferencesSchema` in `state/project-preferences.ts` uses `pr.titleFormat`, `release.versionBump`, `commits.convention: 'conventional'|'none'`, `tracker.kind: 'github'`. Seeded MuninnDB memory uses `pr.titleTemplate`, `release.bumpMapping`, `'conventional-commits'`, `'github-issues'`. Memory must be re-seeded as a Phase C prerequisite.
- `consult-section` reads `.planning/preferences.json` (NOT MuninnDB). Memory is a backup/canonical record only. The local file must be committed for Phase C consultations to return non-default values on fresh clones (RISK-3).
- Schema is narrower than memory: schema lacks `pr.titleTemplate`, `pr.forbidden`, `pr.titleExamples`, `commits.trailers`, `commits.subjectMaxLength` (RISK-5 information narrowing).
