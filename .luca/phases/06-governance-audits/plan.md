---
id: 06-governance-audits
title: Governance Floors Audit + Bitter-Pilled Instruction Trim
waves: 2
tasks: 7
---

# Plan: Governance Floors Audit + Bitter-Pilled Instruction Trim

## Objective
REQ-08: audit hard-vs-soft governance floors and produce a closed enumeration of relaxation paths (audit doc + machine-checkable const). REQ-09: trim over-prescriptive ("bitter-pilled") instruction text from mode/subagent bodies while preserving load-bearing constraints. Fold in the carried-forward phantom-verb fix (execute.ts/finalize.ts cite non-existent `luca todo move`/`move-batch`/`retro postmortem gate`).

## Context
Gate universe (REQ-08 source-of-truth): STAGE_TOOL_MATRIX (stage-tool-matrix.ts:34-85), PIPELINE_TRANSITIONS (pipeline-transitions.ts:12-33), STEP_ARTIFACTS + WRITE_COMMAND_PHASES (step-artifacts.ts:40-120), BUDGET_BY_COMPLEXITY (budget-matrix.ts:15-65), bash classifier (classify-bash-command.ts), confidence gate (confidence.ts:285-311), rule gate (rules.ts:91-110), postmortem exit-code gate (retro.ts — `computePostmortemExitCode`, NO `postmortem gate` subcommand). Real relaxation flags (grep-verified): oversight field; /lu --complexity/--force-complex/--skip-memory/--skip-branch; /phase-plan --research/--skip-research/--gaps/--skip-verify/--skip-memory; /gh-pr-address --skip-validation; complexity-scaled budget caps. EXCLUDED: `luca init`/`vault:init --skip-*` (gate SETUP not pipeline — boundary stated in doc). Phantom verbs confirmed at execute.ts:411 and finalize.ts:470,474,476 — finalize.ts:492 gotcha ALREADY says "no move/move-batch verb" (self-contradiction). Real verbs: `luca todo add|list|update`, `luca retro` (exit code = gate). No tests; verify = `bunx --bun tsc --noEmit` + grep/structural probes.

## Phases

### Phase 1: Governance Floors Audit (REQ-08)

#### Wave A: audit doc + relaxation registry (disjoint files from Wave B — parallel-safe)

- [ ] **Task 1.A.1**: Author `docs/decisions/governance-floors-audit.md` — markdown table (gate → hard/soft → relaxation path → file:line) covering every gate in the inventory, plus an explicit "Excluded scope" section stating init/vault:init flags gate setup not pipeline. Every cited `luca` verb/flag and every file:line grep-verified real against source at authoring.
  - Files: docs/decisions/governance-floors-audit.md
  - Verification: ac-01, ac-02, ac-08, anti-03
  - Dependencies: none

- [ ] **Task 1.A.2**: Create `packages/luca-core/src/state/configs/relaxation-paths.ts` — export `RelaxationPath` type and static `RELAXATION_PATHS` const (array of `{ gate, floor: 'hard'|'soft', flag?, configKey?, source }`). Static const only — NO Zod schema (no runtime parse consumer), NO new CLI verb.
  - Files: packages/luca-core/src/state/configs/relaxation-paths.ts
  - Verification: ac-03, ac-04, ac-05, ac-09, anti-01, anti-02
  - Dependencies: none

- [ ] **Task 1.A.3**: Resolve `--skip-verify` in both artifacts as a standalone-skill-only SOFT floor (annotated `source: phase-plan standalone`), documenting that /lu pipeline has no verify bypass (verify is a mandatory PIPELINE_TRANSITIONS step).
  - Files: docs/decisions/governance-floors-audit.md, packages/luca-core/src/state/configs/relaxation-paths.ts
  - Verification: ac-06.1, ac-06.2, ac-08
  - Dependencies: 1.A.1, 1.A.2

### Phase 2: Instruction Trim + Phantom-Verb Fix (REQ-09 + carried-forward)

#### Wave B: trim over-prescription, fix phantom verbs (per-file ownership; disjoint from Wave A)

- [ ] **Task 2.B.1**: In execute.ts + finalize.ts, replace phantom verbs (`todo move`, `move-batch`, `retro postmortem gate`) with real calls (`luca todo update --id <id> --status done --verification-criterion <ac-id>`; `luca retro` exit-code gate) AND trim over-prescription in the same pass. One owner per file; both files owned by this task to avoid conflict.
  - Files: packages/luca-tools/src/artifacts/modes/execute.ts, packages/luca-tools/src/artifacts/modes/finalize.ts
  - Verification: ac-07, ac-10, anti-04, anti-05
  - Dependencies: none

- [ ] **Task 2.B.2**: Trim over-prescription in review.ts (densest, 26 directives) — remove ALL-CAPS banner stacking, redundant CRITICAL blocks, "Caveman mode always active" line; PRESERVE criteria grammar (ac-NN), deferred handling, doctrine refs, verificationRef rules.
  - Files: packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-10, anti-04, anti-06
  - Dependencies: none

- [ ] **Task 2.B.3**: Trim over-prescription in architect.ts + triage.ts — remove redundant CRITICAL/ALL-CAPS stacking and preachy rationale; preserve stage-gate, criteria-grammar, and load-bearing rules.
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts, packages/luca-tools/src/artifacts/modes/triage.ts
  - Verification: ac-10, anti-04
  - Dependencies: none

- [ ] **Task 2.B.4**: Trim over-prescription in subagents verifier.ts + reviewer.ts — remove redundant directive stacking; preserve doctrine and verification-evidence rules.
  - Files: packages/luca-tools/src/artifacts/subagents/verifier.ts, packages/luca-tools/src/artifacts/subagents/reviewer.ts
  - Verification: ac-10, anti-04
  - Dependencies: none

## Deliverables
- **D1**: REQ-08 audit doc enumerating hard-vs-soft floors with relaxation paths and excluded-scope boundary → ac-01, ac-02, ac-08
- **D2**: REQ-08 machine-checkable RELAXATION_PATHS const + RelaxationPath type → ac-03, ac-04, ac-05, ac-09
- **D3**: REQ-08 --skip-verify resolved (standalone-only soft floor) in both artifacts → ac-06.1, ac-06.2
- **D4**: REQ-09 over-prescription trimmed across mode + subagent bodies, load-bearing constraints survive → ac-10, anti-04, anti-06
- **D5**: Carried-forward phantom-verb fix in execute.ts + finalize.ts → ac-07, anti-05
- **D6**: Whole tree type-checks clean → ac-09

## Verification Criteria
- **ac-01**: `test -f docs/decisions/governance-floors-audit.md` exits 0.
- **ac-02**: `grep -c "stage-tool-matrix\.ts\|pipeline-transitions\.ts\|step-artifacts\.ts\|budget-matrix\.ts\|classify-bash-command\.ts\|confidence\.ts\|rules\.ts\|retro\.ts" docs/decisions/governance-floors-audit.md` returns ≥ 8 (one match per inventory gate file).
- **ac-03**: `grep -c "RELAXATION_PATHS" packages/luca-core/src/state/configs/relaxation-paths.ts` ≥ 1 (currently 0).
- **ac-04**: `grep -c "RelaxationPath" packages/luca-core/src/state/configs/relaxation-paths.ts` ≥ 1 (the exported type).
- **ac-05**: `grep -cE "floor:\s*'(hard|soft)'" packages/luca-core/src/state/configs/relaxation-paths.ts` returns ≥ 5 (≥5 enumerated floors classified hard|soft).
- **ac-06**: [SPLIT → ac-06.1, ac-06.2]
- **ac-06.1**: `grep -c "skip-verify" packages/luca-core/src/state/configs/relaxation-paths.ts` returns ≥ 1.
- **ac-06.2**: `grep -c "standalone" packages/luca-core/src/state/configs/relaxation-paths.ts` returns ≥ 1 (skip-verify entry annotated standalone-only).
- **ac-07**: `grep -cE "todo move|move-batch|retro postmortem gate" packages/luca-tools/src/artifacts/modes/execute.ts packages/luca-tools/src/artifacts/modes/finalize.ts` = 0 (currently 5).
- **ac-08**: `grep -c "init\|vault:init" docs/decisions/governance-floors-audit.md` ≥ 1 in an excluded-scope context (boundary stated).
- **ac-09**: `bunx --bun tsc --noEmit` exits 0.
- **ac-10**: directive-density drops in review.ts — `git show HEAD:packages/luca-tools/src/artifacts/modes/review.ts | grep -c "CRITICAL CONSTRAINT"` (baseline) is strictly greater than `grep -c "CRITICAL CONSTRAINT" packages/luca-tools/src/artifacts/modes/review.ts` (post-trim).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT register a new CLI verb for floors/relaxation — `grep -rc "floors\|relaxation" packages/luca-cli/src/commands/` shows no new `defineCommand` for this concept (3-registry trap).
- **anti-02**: MUST NOT add a Zod schema for the static const — `grep -c "z\.\|zod\|safeParse\|\.parse(" packages/luca-core/src/state/configs/relaxation-paths.ts` = 0.
- **anti-03**: MUST NOT cite a phantom verb/flag in the audit doc — manual cross-check: each `luca` verb/flag in `docs/decisions/governance-floors-audit.md` grep-resolves to a real CLI/skill arg in source (zero phantom).
- **anti-04**: MUST NOT trim a load-bearing constraint — `grep -cE "ac-NN|deferred|verificationRef" packages/luca-tools/src/artifacts/modes/review.ts` (post-trim) is ≥ `git show HEAD:packages/luca-tools/src/artifacts/modes/review.ts | grep -cE "ac-NN|deferred|verificationRef"` (baseline).
- **anti-05**: MUST NOT re-introduce a phantom CLI verb anywhere — `grep -rcE "todo move|move-batch|retro postmortem gate" packages/luca-tools/src/artifacts/` = 0.
- **anti-06**: MUST NOT touch agent-constraints.ts HARD_CONSTRAINTS — `git diff --name-only` does NOT list `packages/luca-tools/src/artifacts/shared/agent-constraints.ts`.
- **anti-07**: MUST NOT create `.test.ts` files or run `bun test` — `git diff --name-only` shows zero new `*.test.ts`.

## Risks & Mitigations
- REQ-08 scope blow-up → bound to PIPELINE gates; init/vault:init flags explicitly excluded with stated boundary (ac-08).
- REQ-09 over-trim of load-bearing constraints (DOMINANT risk) → anti-04 asserts token survival in review.ts; anti-06 keeps agent-constraints.ts off-limits.
- Phantom-capability re-introduction → every cited verb/flag grep-verified real (anti-03, anti-05); execute.ts/finalize.ts both owned by one task (2.B.1) to avoid conflict.
- Meta-doc drift (5th occurrence) → every doc + const claim grep-verified against STAGE_TOOL_MATRIX/PIPELINE_TRANSITIONS/WRITE_COMMAND_PHASES at authoring time.

## Decisions
- 2026-06-15 — REQ-08 ships BOTH audit doc and static RELAXATION_PATHS const; no new CLI verb, no Zod schema (phase-05 anti-06 lesson).
- 2026-06-15 — REQ-08 scope = pipeline gates only; init/vault:init --skip-* flags excluded (gate setup, not pipeline) — boundary stated in doc.
- 2026-06-15 — --skip-verify resolved as standalone-skill-only soft floor; /lu pipeline has no verify bypass (verify is a mandatory PIPELINE_TRANSITIONS step).
- 2026-06-15 — REQ-09 trim removes over-prescription only; load-bearing tokens (criteria grammar, doctrine, verificationRef, stage-gate) preserved; agent-constraints.ts untouched.
- 2026-06-15 — phantom-verb fix merged into REQ-09 wave (B.1) since both touch execute.ts/finalize.ts — one owner per file avoids conflict.
