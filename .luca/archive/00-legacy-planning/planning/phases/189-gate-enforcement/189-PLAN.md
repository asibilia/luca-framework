---
phase: 189
plan: 1
type: implementation
autonomous: true
complexity: SIMPLE
---

# Phase 189: Gate Enforcement — Orchestrator Flag Plumbing

## Objective

Move gate decisions (premortem, process_data) from sub-skill prompts to explicit orchestrator flags, preventing LLM ad-hoc skip reasoning. The lu orchestrator resolves gates via bridge and passes explicit --run/--skip flags to sub-skills. Sub-skills use fail-closed semantics: absent flag = skip.

## Context

- @src/skills/luca/lu.skill.ts — orchestrator that invokes phase-discuss and phase-execute
- @src/skills/general/phase-discuss.skill.ts — currently resolves premortem gate internally
- @src/skills/general/phase-execute.skill.ts — currently resolves process_data gate internally
- @src/rules/general/\*.rule.ts — rule structure reference

## Tasks

### Task 1: Update lu.skill.ts — resolve gates and pass flags

type="auto"

Add gate resolution logic before invoking phase-discuss (for premortem) and phase-execute (for process_data). Pass --run-premortem/--skip-premortem and --run-process-data/--skip-process-data flags to sub-skills.

**Verification:**

- [ ] lu.skill.ts resolves premortem gate via bridge before calling phase-discuss
- [ ] lu.skill.ts resolves process_data gate via bridge before calling phase-execute
- [ ] Flags are passed in Skill() args to both sub-skills

### Task 2: Update phase-discuss.skill.ts — accept premortem flag (fail-closed)

type="auto"

Replace the bridge gate-check for premortem with a flag check. If --run-premortem present: run premortem. If --skip-premortem or no flag: skip. Update Arguments line.

**Verification:**

- [ ] phase-discuss no longer calls luca-bridge gate-check for premortem
- [ ] phase-discuss checks for --run-premortem flag in arguments
- [ ] Fail-closed: absent flag = skip premortem

### Task 3: Update phase-execute.skill.ts — accept process_data flag (fail-closed)

type="auto"

Replace the grep-based process_data gate check with a flag check. If --run-process-data present: run process data. If --skip-process-data or no flag: skip. Update Arguments line.

**Verification:**

- [ ] phase-execute no longer reads config.json for process_data gate
- [ ] phase-execute checks for --run-process-data flag in arguments
- [ ] Fail-closed: absent flag = skip process data collection

### Task 4: Create gate-enforcement rule

type="auto"

Create src/rules/general/gate-enforcement.rule.ts enforcing the orchestrator-resolved flag pattern. Register in assemble-registry.ts.

**Verification:**

- [ ] Rule file exists at src/rules/general/gate-enforcement.rule.ts
- [ ] Rule is registered in src/rules/\_\_helpers/assemble-registry.ts
- [ ] Rule content describes the fail-closed pattern

### Task 5: Type check

type="auto"

Run tsc to verify no type errors.

**Verification:**

- [ ] bunx --bun tsc --noEmit passes

## Success Criteria

- [ ] Gate decisions resolved by lu orchestrator, not sub-skills
- [ ] Sub-skills accept explicit flags (fail-closed semantics)
- [ ] Rule documents and enforces the pattern
- [ ] Type check passes
