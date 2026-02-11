---
id: 14-01
title: Execution Pipeline Audit & Signal Inventory
phase: 14-execution-verification-audit
wave: 1
delivers: AUDIT-01, AUDIT-02
depends_on: null
tasks: 4
---

# Plan 14-01: Execution Pipeline Audit & Signal Inventory

## Objective

Map every step of `lu-execute-phase` and `lu-verifier`. For each step, identify what verification signals it uses and classify them by reliability tier. Produce a comprehensive audit report documenting the execution pipeline map, signal inventory, blind spots, and reliability distribution. This is a pure analysis plan — no code changes.

## Context

- **Execution pipeline:** `.claude/skills/lu-execute-phase/SKILL.md` (~1000 lines, 12+ steps)
- **Verifier agent:** `.claude/agents/lu-verifier.md` (~860 lines, 10 steps)
- **Executor agent:** `.claude/agents/lu-executor.md`
- **Cognition agent:** `.claude/agents/lu-cognition.md`
- **Router agent:** `.claude/agents/lu-router.md`
- **Learner agent:** `.claude/agents/lu-learner.md`
- **UAT skill:** `.claude/skills/lu-verify-work/SKILL.md`
- **Harness runner:** `src/harness/runner.ts`
- **Harness types:** `src/harness/types.ts`
- **Harness parsers:** `src/harness/parsers/index.ts`
- **Complexity types:** `src/complexity/types.ts`
- **Complexity defaults:** `src/complexity/defaults.ts`
- **Project config:** `.planning/config.json`

## Signal Classification Taxonomy

Each verification signal gets classified into one of 4 reliability tiers:

| Tier | Name              | Reliability | Examples                                                     |
| ---- | ----------------- | ----------- | ------------------------------------------------------------ |
| T1   | Deterministic     | Highest     | Test pass/fail, TypeScript compiler, ESLint, file existence  |
| T2   | Schema/Structural | High        | Zod validation, export checks, import resolution, line count |
| T3   | LLM-Judge         | Medium      | Code review agents, plan-checker, lu-verifier reasoning      |
| T4   | Self-Assessment   | Lowest      | Executor claiming task done, SUMMARY.md claims               |

## Tasks

### Task 1: Audit lu-execute-phase Pipeline

**Goal:** Map every step of the execution pipeline with its purpose, inputs, outputs, verification signals, and signal tier.
**Files to read:** `.claude/skills/lu-execute-phase/SKILL.md`

Walk through each step (0 through 12) and document:

- Step number and name
- Purpose (what it does)
- Inputs (what data/files it reads)
- Outputs (what it produces)
- Verification signals (how correctness is checked)
- Signal tier (T1-T4 classification)
- Blind spots (any step with no verification signal)

### Task 2: Audit lu-verifier Pipeline

**Goal:** Map every step of the verifier pipeline with the same detail as Task 1.
**Files to read:** `.claude/agents/lu-verifier.md`

Walk through each step (0 through 10) and document the same fields. Pay special attention to which verifier steps use deterministic signals vs. LLM reasoning.

### Task 3: Audit Supporting Systems

**Goal:** Document verification signals from hooks, harness, and complexity gating.
**Files to read:** `src/harness/runner.ts`, `src/harness/types.ts`, `src/harness/parsers/index.ts`, `src/complexity/types.ts`, `src/complexity/defaults.ts`, `.planning/config.json`

Document:

- Harness checks (test, typecheck, lint, build) and their signal tiers
- Hook checks (post-edit-typecheck, pre-commit-gate) and their signal tiers
- Complexity gating signals (how complexity level is determined and verified)

### Task 4: Produce AUDIT-REPORT.md

**Goal:** Synthesize findings from Tasks 1-3 into the comprehensive audit report.
**Output:** `.planning/phases/14-execution-verification-audit/AUDIT-REPORT.md`

The report must include:

1. **Execution Pipeline Map** — Every step with: purpose, inputs, outputs, verification signals, signal tier
2. **Verification Signal Inventory** — Complete list of all signals across both pipelines, classified by tier
3. **Coverage Analysis** — Which steps have no verification signals (blind spots)
4. **Reliability Distribution** — How many signals per tier, what percentage of the pipeline relies on each
5. **Recommendations** — Specific improvements to increase T1/T2 signal coverage

## Verification Criteria

- [ ] Report covers ALL lu-execute-phase steps (0 through 12, including sub-steps)
- [ ] Report covers ALL lu-verifier steps (0 through 10)
- [ ] Every verification signal is classified into a tier (T1-T4)
- [ ] Blind spots (steps with no verification) are identified
- [ ] Reliability distribution shows coverage percentages
- [ ] Recommendations are specific and actionable
