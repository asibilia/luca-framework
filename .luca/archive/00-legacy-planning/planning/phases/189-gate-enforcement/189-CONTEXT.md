# Phase 189 Context — Gate Enforcement

## Gray Area 1: Where Gates Are Resolved [researched]

**Current:** Sub-skills (phase-discuss, phase-execute) resolve gates themselves via bridge/grep
**Target:** Lu orchestrator resolves gates and passes explicit flags to sub-skills

**Decision:** Lu orchestrator checks gates via bridge, passes --run-premortem/--skip-premortem to phase-discuss and --run-process-data/--skip-process-data to phase-execute.

## Gray Area 2: Fail-Closed Default [researched]

**Decision:** If a sub-skill receives no flag, it defaults to SKIP (fail-closed). This prevents LLM ad-hoc reasoning about whether to run a gate.

## Gray Area 3: Skill Source vs Generated Output [researched]

**Decision:** Edit source files in src/skills/luca/. The .claude/ generated output will be stale until build:all runs. This is expected — the user runs build:all manually after the session.

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
