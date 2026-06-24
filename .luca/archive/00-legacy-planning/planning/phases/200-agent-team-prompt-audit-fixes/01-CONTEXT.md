# Phase 200: Agent Team Prompt Audit Fixes — Context

## Decisions

### 1. Code Review Team Composition (Fix 4)

[auto-resolved] Keep 3 core reviewers: `dx-advocate`, `code-simplifier`, `code-architect`. Drop `ui` reviewer (irrelevant for this tooling monorepo — no user-facing UI in src/skills/). Security-auditor is available conditionally but not in the default set. This reduces the team from 5+ to 3, following the "3-5 teammates" best practice.

### 2. XML Block Naming Convention (Fix 1)

[auto-resolved] Adapt the codebase-map XML block pattern per skill domain. The structure (context/targets/requirements) is the best practice — the exact tag names should match the skill's purpose:

- phase-research: `<research_context>`, `<analysis_targets>`, `<output_requirements>`
- phase-execute: `<execution_context>`, `<execution_targets>`, `<output_requirements>`
- phase-discuss: `<research_context>`, `<analysis_targets>`, `<output_requirements>` (for researcher prompts)
- pr-address: `<review_context>`, `<review_targets>`, `<output_requirements>`
- lu.skill.ts: Already uses structured prompts; update parallel swarm prompts with XML blocks

### 3. Fix Ordering

Apply fixes in order of file impact to minimize merge conflicts:

1. phase-execute.skill.ts (5 fixes: #2, #3, #4, #6, #8)
2. phase-research.skill.ts (2 fixes: #1, #2)
3. phase-discuss.skill.ts (1 fix: #5)
4. lu.skill.ts (1 fix: #7)
5. pr-address.skill.ts (1 fix: #2 + missing reviewer prompts)

### 4. Scope Boundary

Only modify prompt text and team structure within existing skill files. Do NOT:

- Change skill schemas or exported types
- Add new skill files
- Modify agent definitions
- Change workflow step ordering

## Deferred Ideas

None — scope is tightly defined by the audit.
