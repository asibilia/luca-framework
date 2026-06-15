# Audit: Luca Governance Floors

**Date:** 2026-06-15
**Status:** Audit (phase 06-governance-audits)
**Scope:** Every governance gate in the `/lu` pipeline — its floor (hard vs soft), its documented relaxation path(s), and its source of truth.

---

## Problem

Luca enforces pipeline discipline through a layered set of gates: a coarse-phase tool matrix, a pipeline-step transition table, per-step artifact allowlists, complexity-scaled iteration budgets, a bash-command classifier, a confidence gate, a rule gate, and a postmortem exit-code gate. Each gate is either a **hard floor** (no flag bypasses it) or a **soft floor** (a named, documented flag relaxes it). Until now there was no single place that stated, gate-by-gate, which floors are hard, which are soft, and exactly how each soft floor is relaxed.

This audit closes that gap. Its conclusion is that the enumeration is **CLOSED**: the hard floors have no flag bypass, and every soft floor has a named, documented relaxation path.

---

## Gate Inventory

| Gate | Floor | Relaxation path(s) | Source (file:line) |
|---|---|---|---|
| `STAGE_TOOL_MATRIX` (coarse-phase → tool-category allow/deny) | **HARD** | None — no flag bypasses the matrix. IDLE is permissive by definition (not a bypass). | `packages/luca-core/src/state/configs/stage-tool-matrix.ts:34-85` |
| `PIPELINE_TRANSITIONS` (legal `pipelineStep` → next-step set) | **HARD** | None — `isLegalTransition` rejects any FROM→TO pair not in the table. | `packages/luca-core/src/state/configs/pipeline-transitions.ts:12-33` |
| `STEP_ARTIFACTS` (per-step legal phase-artifact paths) | **HARD** | None. `[]` entries (e.g. `idle`, `triage`, `architect`, `checks`) are intentional phase-agnostic carve-outs — those steps produce no freeform artifact, not a bypass. | `packages/luca-core/src/state/configs/step-artifacts.ts:40-56` |
| `WRITE_COMMAND_PHASES` (write-verb → allowed `pipelineStep[]`) | **HARD** | None. `[]` entries (e.g. `confidence log`, `workflow reset`, `todo add/list/update`, `state advance`, `plan lint`) are deliberately phase-agnostic write/read tools, not bypasses of a phase restriction. | `packages/luca-core/src/state/configs/step-artifacts.ts:74-120` |
| `BUDGET_BY_COMPLEXITY` (iteration caps: checks-fix / verify / plan-review / research-review / review / phases) | **SOFT** | Caps scale with the triage-assigned complexity level (`TRIVIAL`→`CRITICAL`); a higher level raises every cap. The relaxation path is the complexity assignment itself (see `--complexity=`/`--force-complex` below). | `packages/luca-core/src/state/configs/budget-matrix.ts:15-65` |
| Code-review gate (reviewers spawned at the `review` step) | **SOFT** | `--skip-review` flag OR `workflow.code_review: false` config skips the code-review gate entirely. **Pipeline-reachable** via `/lu` `execute` → `Skill(phase-execute)` (`skills/lu/index.ts:105`). | `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1234`, `:1270` |
| UAT gate (user-acceptance verification at the `review` step) | **SOFT** | `--skip-uat` flag OR `workflow.uat_required: false` config skips UAT entirely (the verification step itself still always runs). **Pipeline-reachable** via `/lu` `execute` → `Skill(phase-execute)` (`skills/lu/index.ts:105`). | `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1609`, `:1611` |
| Bash classifier — always-denied + pipe-to-shell + conservative-mutate fallback | **HARD** | None. `eval`/`source`/`.` are always denied; `curl\|bash`, `wget\|bash`, `base64 -d\|bash`, `echo <b64>\|sh` patterns are denied; unparseable/unknown commands fall through to `bash-mutate` (conservative). No flag relaxes any of these. | `packages/luca-cli/src/hook/helpers/classify-bash-command.ts:172` (`ALWAYS_DENIED_COMMANDS`), `:643-675` (`detectPipeToShell`), `:595-599` (unknown→mutate) |
| Confidence gate (`luca confidence gate`) — the only full-auto pause | **HARD** | None. Low-confidence + unresearchable entries bucket to `ask` (fail-toward-human) and block until the user answers; this is the only pause in `full-auto` mode and no flag suppresses it. | `packages/luca-cli/src/commands/write-surface/confidence.ts:285-311` |
| Rule gate (`luca rules gate`) — exit 1 on any must-fix finding | **HARD** (exit-code) | None at the exit-code level: any `must-fix` finding sets `process.exitCode = 1`. **Soft seam:** the orchestrator's *honoring* of that exit code is prose-enforced, not mechanically enforced — a non-honoring caller could ignore the non-zero code. | `packages/luca-cli/src/commands/rules.ts:91-110` |
| Postmortem exit-code gate (`computePostmortemExitCode`, surfaced by `luca retro`) | **HARD** | None. Any `critical`-severity violation yields exit code `1`; `luca retro` sets `process.exitCode` to that value. There is **no** dedicated `postmortem`-gate subcommand under `luca retro` — `luca retro` (args `--run`/`--list`/`--json`) prints the report and its EXIT CODE is the gate. | `packages/luca-core/src/analysis/postmortem.ts:451-453` (`computePostmortemExitCode`); `packages/luca-cli/src/commands/retro.ts:91-105` |

---

## Soft Relaxation Flags

Every soft floor has a named, documented relaxation flag. Each was grep-verified against source before citation:

| Flag / setting | Effect | Source (file:line) |
|---|---|---|
| `oversight ∈ {full-auto, checkpoint, human-in-loop}` (`.luca/config.json`) | Selects how many pipeline steps pause for human confirmation. `full-auto` pauses only on confidence-gate `ask` items + CRITICAL safety; `checkpoint` adds pauses after `plan-review`/`verify`/`learn`; `human-in-loop` pauses after every step. | `packages/luca-core/src/state/schemas.ts:19-21` (`OversightMode` enum); described in `packages/luca-tools/src/artifacts/skills/lu/index.ts:231-233` |
| `/lu --complexity=<TRIVIAL\|SIMPLE\|MODERATE\|COMPLEX\|CRITICAL>` | Overrides the triage classifier's complexity level — directly raises/lowers the `BUDGET_BY_COMPLEXITY` iteration caps. | `packages/luca-tools/src/artifacts/skills/lu/index.ts:15`, `:71` |
| `/lu --force-complex` | Forces a high complexity level regardless of the classify score. | `packages/luca-tools/src/artifacts/skills/lu/index.ts:15`, `:71` |
| `/lu --skip-memory` | Skips the cognitive memory recall step. | `packages/luca-tools/src/artifacts/skills/lu/index.ts:15` |
| `/lu --skip-branch` | Skips automated branch management. | `packages/luca-tools/src/artifacts/skills/lu/index.ts:15` |
| `/phase-plan --skip-research` | Skips the research step in standalone planning. | `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:21`, `:117`, `:156` |
| `/phase-plan --gaps` | Gap-closure mode — skips research, uses `verify.json` instead. | `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:21`, `:118`, `:154` |
| `/phase-plan --skip-memory` | Skips the memory recall step in standalone planning. | `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:21`, `:41` |
| `/phase-plan --skip-verify` | Bypasses the verification loop in **standalone** planning only (see resolution below). | `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:21`, `:119` |
| `phase-execute --skip-review` / `workflow.code_review: false` | Skips the code-review gate entirely. **Pipeline-reachable** via `/lu` `execute` → `Skill(phase-execute)`. | `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1234`, `:1270` |
| `phase-execute --skip-uat` / `workflow.uat_required: false` | Skips UAT entirely (verification step still always runs). **Pipeline-reachable** via `/lu` `execute` → `Skill(phase-execute)`. | `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1609`, `:1611` |
| `/gh-pr-address --skip-validation` | Skips comment categorization; treats all comments as actionable. | `packages/luca-tools/src/artifacts/skills/gh-pr-address/index.ts:21`, `:73` |

---

## `--skip-verify` Resolution

`--skip-verify` is a **STANDALONE-skill-only** soft floor. It exists exclusively on the `/phase-plan` standalone skill (`packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:119`, "flag to bypass verification loop").

The `/lu` **PIPELINE has NO verify bypass**: in `PIPELINE_TRANSITIONS`, `verify` is a mandatory step on the canonical flow (`checks → verify → review`, with `verify: ['review', 'checks']` at `packages/luca-core/src/state/configs/pipeline-transitions.ts:22`). There is no legal transition that routes around `verify`, and `--skip-verify` is not a `/lu` flag (`/lu` accepts only `--complexity=`/`--force-complex`/`--skip-memory`/`--skip-branch` per `skills/lu/index.ts:15`).

**Conclusion:** no hidden pipeline verify bypass exists. The only `--skip-verify` is scoped to the standalone planning skill.

---

## Excluded scope

Setup-time flags are **out of scope** for this audit because they gate SETUP, not the pipeline:

- `luca init` and `luca vault:init --skip-*` flags configure the project/vault before any `/lu` run begins. They never relax a pipeline gate (transition, matrix, step-artifact, classifier, confidence, rule, or postmortem floor).

These commands are classified as `luca-write` top-level commands (`packages/luca-cli/src/hook/helpers/classify-bash-command.ts:206-214`, `LUCA_TOPLEVEL_WRITE` includes `init` and `vault:init`), self-enforce their own preconditions, and are therefore excluded from the governance-floor enumeration below.

---

## Completeness Sweep

To prove the enumeration is exhaustive (not a strict subset of the human doc, nor missing pipeline-reachable paths), every `--skip*` / `skip*` / `*_required` / `*_enabled` / `enabled` token in the three pipeline-reachable skill bodies (`lu`, `phase-plan`, `phase-execute`) was grepped and classified. `/lu` reaches `phase-plan` (`skills/lu/index.ts:103`) and `phase-execute` (`skills/lu/index.ts:105`).

| Token | Skill (file:line) | Classification |
|---|---|---|
| `--complexity=` | `skills/lu/index.ts:15`, `:71` | **Soft floor** — `iteration-caps` (enumerated). |
| `--force-complex` | `skills/lu/index.ts:15`, `:71`, `:77` | **Soft floor** — `iteration-caps-force` (enumerated). |
| `--skip-memory` | `skills/lu/index.ts:15`; `skills/phase-plan/index.ts:21`, `:41` | **Soft floor** — `memory-recall` (enumerated). |
| `--skip-branch` | `skills/lu/index.ts:15` | **Soft floor** — `branch-creation` (enumerated). |
| `--skip-research` | `skills/phase-plan/index.ts:21`, `:117`, `:156` | **Soft floor** — `research-step` (enumerated). |
| `--gaps` | `skills/phase-plan/index.ts:21`, `:118`, `:154` | **Soft floor** — `gap-closure-research` (enumerated). |
| `--skip-verify` | `skills/phase-plan/index.ts:21`, `:119` | **Soft floor** — `verify-skip-standalone`, standalone-only (enumerated). |
| `--skip-review` / `workflow.code_review` | `skills/phase-execute/index.ts:1234`, `:1270` | **Soft floor** — `code-review`, pipeline-reachable (enumerated; was previously missing — fixed). |
| `--skip-uat` / `workflow.uat_required` | `skills/phase-execute/index.ts:1609`, `:1611` | **Soft floor** — `uat`, pipeline-reachable (enumerated; was previously missing — fixed). |
| `--skip-replay` | `skills/phase-execute/index.ts:21`, `:234`, `:852` | **Not a floor** — replays injected pre-plans (Step 0.6); execution-loop control, gates no enforced quality check. |
| `--skip-verify-loop` | `skills/phase-execute/index.ts:1084` | **Not a floor** — skips automated *gap re-execution* (Loop B). The `verify` step itself still always runs and still gates; this only suppresses the auto-fix retry. |
| `workflow.verification_tribunal_enabled` | `skills/phase-execute/index.ts:966`, `:975` | **Not a floor (enhancement)** — default `true`, fires only at COMPLEX+ on a T1/T3 conflict; an adversarial check layered *on top of* the verify gate, not the gate itself. |
| `workflow.tribunal_enabled` | `skills/phase-execute/index.ts:1463`, `:1470` | **Not a floor (enhancement)** — default `true`, COMPLEX+ only, fires only on reviewer disagreement; layered on top of the code-review gate. |
| `iteration.stall_debate_enabled` | `skills/phase-execute/index.ts:613` | **Not a floor (enhancement)** — default `true`; a debate aid for stall detection inside the execution loop. |
| `root_cause_tribunal_enabled` | `skills/phase-execute/index.ts:1699` | **Not a floor (enhancement)** — default `true`, COMPLEX+ AND multi-issue (≥2) only; a debug-diagnosis aid. |
| `tdd: true` (plan frontmatter), `testable: false` (per-task) | `skills/phase-execute/index.ts:340`, `:349` | **Not a relaxation** — per-plan/per-task execution mode, not a config/flag escape hatch. |
| `--gaps-only` / `--quality-fixes` | `skills/phase-execute/index.ts:21`, `:280`, `:1538` | **Not a floor** — re-entry *modes* that scope which plans re-run; they do not skip a gate. |

The four tribunal/debate `*_enabled` toggles are quality **enhancements** (COMPLEX+-gated adversarial layers, default-on) rather than enforcement floors: disabling one removes an optional extra check, never the base gate it augments. They are recorded here for completeness but are deliberately NOT entries in `RELAXATION_PATHS`, which catalogues floors. Every remaining token resolves to an enumerated soft floor.

This sweep is mirrored 1:1 by the machine-readable `RELAXATION_PATHS` constant (`packages/luca-core/src/state/configs/relaxation-paths.ts`): the const is no longer a strict subset of this doc — every soft floor here has a matching entry there, and every entry there appears here.

---

## Conclusion

The governance-floor enumeration is **CLOSED** — re-asserted after the Completeness Sweep above, which grepped every `--skip*` / `*_required` / `*_enabled` token across all three pipeline-reachable skill bodies (`lu`, `phase-plan`, `phase-execute`) and accounted for each:

- The **hard floors** — `PIPELINE_TRANSITIONS`, `STAGE_TOOL_MATRIX`, `STEP_ARTIFACTS` / `WRITE_COMMAND_PHASES`, the bash classifier, and the confidence-gate `ask` pause — have **NO flag bypass**. The only soft seam is the rule-gate exit code, whose mechanism is hard (exit 1 on must-fix) but whose *honoring* is prose-enforced at the orchestrator.
- Every **soft floor** has a **named, documented relaxation path**, each grep-verified against source above. The set comprises: `BUDGET_BY_COMPLEXITY` iteration caps (`--complexity=`/`--force-complex`), `--skip-memory`, `--skip-branch`, `--skip-research`, `--gaps`, `--skip-verify` (standalone), `--skip-validation`, the `oversight` mode, and — **newly enumerated** because they are pipeline-reachable via `/lu execute → Skill(phase-execute)` — the **code-review gate** (`--skip-review` / `workflow.code_review: false`) and the **UAT gate** (`--skip-uat` / `workflow.uat_required: false`).
- The four COMPLEX+-gated, default-on tribunal/debate toggles (`verification_tribunal_enabled`, `tribunal_enabled`, `root_cause_tribunal_enabled`, `stall_debate_enabled`) and the execution-loop controls (`--skip-replay`, `--skip-verify-loop`, `--gaps-only`, `--quality-fixes`) are **enhancements / loop controls, not enforcement floors** — they layer on top of or scope a gate without removing it, and are documented in the Completeness Sweep but intentionally excluded from `RELAXATION_PATHS`.
- `--skip-verify` is standalone-only; the `/lu` pipeline has no verify bypass.
- Setup-time `luca init` / `luca vault:init --skip-*` flags gate setup, not the pipeline, and are out of scope.
- The machine-readable `RELAXATION_PATHS` constant is a faithful 1:1 mirror of the soft floors documented here — it is no longer a strict subset of this doc.
