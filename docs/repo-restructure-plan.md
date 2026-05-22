# Luca Repo Restructure & Migration-Recovery Plan

> **Status:** DRAFT — living document. Started 2026-05-22.
>
> Tracks the design discussion for (a) restructuring the monorepo into clean
> packages and (b) properly completing the v13 "Claude Code-first" migration,
> which a parity audit found to be lossy. The implementation plan (§6) is
> assembled once §4 (package structure) and §5 (mastracode inventory) settle.

## 1. Background

Luca's v13 migration moved the workflow off the `luca-mastracode` Mastra
harness toward a Claude Code-first model, across two PRs:

- **#262** — "Claude Code-first migration (Phases 1–5B)"
- **#266** — "v13 write-surface — replace the MCP server with the luca CLI"

A parity audit (2026-05-22) found the migration **lost functionality**. Root
cause: the agents / commands / skills were **hand-rewritten** as Claude-Code
markdown rather than carried across from the `luca-mastracode` TypeScript
source. Hand-translation is lossy — entire subsystems were dropped.

## 2. Architecture findings (verified 2026-05-22)

### 2.1 The pillar

One TypeScript definition per agent / skill / command / rule / hook,
**compiled** into each harness provider's shape. Functionality lives in TS;
the per-provider markdown (`.claude/`, `.cursor/`, `.pi/`, …) is build output.

### 2.2 Current reality

| Concern | Where it is now | Where the pillar says it belongs |
|---|---|---|
| Workflow functionality (TS) | `luca-mastracode/src/` | The canonical TS source |
| Claude agents/skills/commands | `luca-framework/skills/*.md` + `.claude/` — hand-written, git-tracked (created in #262) | **Generated** from the TS source |
| TS → harness-shape compiler | Not found — no `compilers/`, no `*.agent.ts`, no compile step | Needs to exist |

`luca-mastracode/src/` holds: `subagents/` (10), `modes/` + `instructions/`
(10 pipeline stages), `tools/` (~26), `rule-engine/`, `analysis/`,
`orchestration/`, `review-analysis/`, `state/`, `integration/`.

The functionality therefore exists in **two diverged copies** — the real one
(mastracode TS) and a degraded hand-written one (`skills/` + `.claude/`).

## 3. Functional gaps (parity audit — audit-level; §5 supersedes with detail)

Lost / degraded in the hand-rewrite:

1. Telemetry writer — reader skill + `.luca/telemetry/` contract exist; nothing emits.
2. Vertical-slice planning guidance — gone; planner models the horizontal anti-pattern.
3. TDD guidance — mostly dropped from the executor.
4. Postmortem analyzer — `luca retro` is a hollow reader.
5. Repo-local rule engine — `.luca/rules/` packs + verify gate; no equivalent.
6. Recurrence-driven rule promotion — pitfalls seen ≥3× → draft rules.
7. Claim verifier — verifies PR / changeset claims pre-PR.
8. Phase-diff empty-phase guard.

Partial: finalize postmortem gate · deterministic check-parsers · pipeline-lock
recovery strategy · `classify_complexity` heuristic · context-budget reminders.

Not a regression: todo-confidence scoring — spec'd, never built (spec preserved
in `.legacy-planning-archive/`).

## 4. Target package structure — discussion item 1

### 4.1 Proposed (user)

| Package | Responsibility | Visibility |
|---|---|---|
| `luca-cli` | The `luca` CLI | private |
| `luca-core` | State management, todos, … | private |
| `luca-tools` | Skills, rules, commands, hooks, … | private |
| `luca` | Bundles everything for distribution | **public** |

3 private workspace packages + 1 public umbrella. `luca-mastracode` and (TBD)
`luca-studio` are removed.

### 4.2 Refinements (Claude)

- **R1 — Artifacts vs logic split.** Two distinct kinds of thing must not be
  conflated:
  - *Prompt-bearing artifacts* — agents/subagents, skills, commands, rules,
    hooks. TS definitions that **compile** to provider shapes → `luca-tools`.
  - *Deterministic logic* — state machine, todos, rule-engine, postmortem
    analyzer, claim verifier, telemetry, checks runner, phase-diff,
    review-analysis. TS libraries the CLI executes → `luca-core`.

  So `luca-core`'s "etc." must explicitly absorb the rule-engine / analysis /
  telemetry / verification logic. `luca-tools` is *only* the artifact layer.
- **R2 — The compiler lives in `luca-tools`.** It owns the artifact
  definitions and emits each provider shape; the compiled markdown is
  `luca-tools` build output.
- **R3 — Dependency DAG.** `luca-core` (base, no sibling deps) ← `luca-tools`
  and `luca-cli` (both depend on core) ← `luca` (bundles all three).
  `luca-cli` also depends on `luca-tools` to install the artifacts.
- **R4 — `luca` bundles, not references.** The three sub-packages are
  private/unpublished, so `luca`'s build must inline their code.

### 4.3 Resolved (item 1)

| # | Decision |
|---|---|
| Q1 | Keep `luca-tools`. The naming overlap with *agent tools* is noted but minor. |
| Q2 | Public package: `@alecsibilia/luca`. `@alecsibilia/luca-framework` is deprecated on npm (handled by the user). |
| Q3 | `luca-studio` is **out of scope** for this restructure — left as-is, neither folded into the 4-package model nor deleted. |
| Q4 | Hooks: definitions → `luca-tools` (compiled per provider); shared hook logic → `luca-core`. |

## 5. Mastracode functionality inventory — discussion item 2

> Produced by a 5-part parallel audit (subagents · modes · tools · logic
> subsystems · planned-but-unfinished), 2026-05-22. `luca-mastracode/src/` is
> ~99 source modules. Pattern: each subsystem is a **pure data-layer module**
> with a thin **Mastra tool wrapper** in `tools/`.

### 5.1 Subagents (9)

`subagents/*.ts` — typed `HarnessSubagent` objects (id, description, maxSteps,
allowedWorkspaceTools, `instructions` prompt). Glue: `shared-prefix.ts`
(prepended to all 9), `create-static-agent.ts` (mode-agent factory),
`agent-constraints.ts`, `memory-tier-discipline.ts`.

| Subagent | Role | Flag |
|---|---|---|
| researcher | One research dimension (scope/arch/impl/ecosystem/risk) | — |
| discussion | Captures user decisions → `CONTEXT.md` ("never skipped") | — |
| planner | Goal-backward plan authoring | **ORPHANED** — registered, never invoked (architect plans inline) |
| plan-reviewer | Cold-isolation plan review + convergence detection | — |
| executor | Implements a wave, per-task commits, confidence logging | — |
| verifier | Goal-backward verification + checks fix-loop | — |
| reviewer | One review perspective (arch/dx/security/simplification/test-quality) | stale 4-vs-5 enum |
| learner | Extracts patterns/pitfalls → MuninnDB | — |
| shadow-scanner | Repo-debris scan | **BROKEN** — excluded from MCP tools yet instructions call `muninn_*` |

### 5.2 Modes / pipeline (10)

Pipeline: **triage → research → architect → execute → review → finalize**
(TRIVIAL/SIMPLE skip research; review loops back to execute; finalize loops to
architect, ≤3 milestones/session). Standalone: discuss, build, plan, fast. Each
mode = a thin loader file + an `instructions/*.md` prompt body (the substance).

Flags: `fix` subagent referenced in `execute.md` but **never existed**; 7 of 10
instruction files hardcode `.planning/` + uppercase artifact names; stock modes
hardcode model IDs.

### 5.3 Tools (17 agent-facing + helpers)

17 `createTool` instances registered in `tool-manifest.ts`, per-mode scoped via
`create-scoped-tool.ts`, plus deterministic helpers. Status vs. the v13 `luca`
CLI write-surface:

| Tools | v13 status |
|---|---|
| pr-review, project-preferences | Ported cleanly |
| run-checks (+ parsers) | Ported (`luca checks run`) |
| workflow-state | Split-ported; `switch-mode` + telemetry actions dropped |
| manage-todos | Ported, re-platformed to MuninnDB |
| manage-roadmap, verification-result, confidence-journal, ensure-feature-branch, repo-cleanup | Partially ported — actions dropped |
| write-planning-file | Replaced by native Write + named handlers |
| **run-postmortem, claim-verifier, run-rules, session-ledger, classify-complexity, pipeline-lock** | **DROPPED — no v13 handler** |
| tool-manifest, create-scoped-tool | Dropped — superseded by the stage-gate hook |

### 5.4 Logic subsystems

All are **complete, clean pure-data-layer TS modules** — the functionality is
intact; it was simply never wired into the Claude Code workflow.

- **`rule-engine/`** — `define-rule` (rule-pack schema), `runner` (discover/run
  `.luca/rules/*.ts`), `recurrence` (pitfalls seen ≥3× → draft rule). Already
  targets `.luca/`.
- **`analysis/`** — `postmortem` (run retrospective → 7 violation types →
  `pitfall` payloads, routed to the `default` vault), `phase-diff` (git-diff
  empty-phase proof), `retro` (the `luca retro` CLI).
- **`review-analysis/`** — `convergence`, `regression`, `stale-filter` — already
  ported into `luca-framework`.
- **`orchestration/`** — `pipeline-guard` (switch-mode watchdog),
  `read-only-enforcement`, `continuation-messages`, `context-refresher`,
  `pipeline-tui`, `upstream-patches`. Mostly harness-specific (reaches into
  `@mastra/core` private fields).
- **`state/`** — persistence: `luca-store`, `session-ledger`, `telemetry`,
  `verification-result`, `confidence-journal`, `claim-verifier`, `todos`,
  `shadow-scanner`, `project-preferences`, `vault`. All anchored on `.planning/`.
- **`integration/`** — `install-bundled-assets` (`.mastracode/` symlinks),
  `model-routing` (dup of luca-framework's table), `mastracode-config`,
  `branding`. Mostly dies with mastracode.

### 5.5 Migration disposition

| Disposition | Units |
|---|---|
| **Port as artifact definitions** → `luca-tools` (TS → compiled) | the 9 subagents · the 10 mode instruction bodies · `shared-prefix` · `agent-constraints` · `memory-tier-discipline` · the prose-rule loader |
| **Port as logic** → `luca-core` (retarget `.planning/`→`.luca/`) | rule-engine · postmortem · recurrence · phase-diff · review-analysis · telemetry · verification-result · confidence-journal · claim-verifier · session-ledger · check parsers · classify-complexity · project-preferences · vault resolution |
| **Re-implement for Claude Code** | pipeline-guard · read-only-enforcement · continuation-messages · context-refresher — orchestration concerns become Claude Code hooks/settings, not Mastra subscriptions |
| **Drop — dies with mastracode** | `launch.ts` · `create-static-agent` · `install-bundled-assets` · `mastracode-config` · `upstream-patches` · `index.ts` boot · `tool-manifest`/`create-scoped-tool` (→ stage-gate hook) |
| **Drop — dead on arrival** | `state/todos.ts` (MuninnDB now) · the `.planning/` whitelists in `shadow-scanner`/`repo-cleanup` (→ `LUCA_DIR_CONTRACT`) · `model-routing` dup |
| **Drop — orphaned** | `planner` subagent (never invoked) · `fix` subagent (never existed) |

### 5.6 Planned-but-unfinished work

No genuine in-code unfinished paths (the only TODO markers are intentional
template stubs). But `.legacy-planning-archive/planning/todos/pending/` holds
**56 never-executed specs**, in coherent clusters:

- **Workflow slim-down (~11 specs)** — a *complete, never-executed pipeline
  redesign*: collapse triage+research+architect into one `plan` mode, remove
  `discuss`, renumber the pipeline, add todo `confidence`/`externalResearch`/
  `priority` frontmatter + a `backlog-groom` skill. **Directly relevant to §6 —
  see §8.**
- **Telemetry data-integrity (~14 specs)** — fabricated `durationMs`,
  correlationId unit drift, contradictory `success`/`outcome`. The telemetry
  *writer* works; its *data quality* is the known problem.
- **Prompt-engineering hardening (~9 specs)** — attention-curve exploitation,
  template→principle compression, quantified directives, tool-discipline.
- **Architecture / perf (~5 specs)** — conditional per-mode MCP loading, prompt
  cache-boundary split, progressive context compaction.
- **Testing (~3 specs)** — instruction-assembly snapshot tests, permission-
  system unit tests.

Full list: `.legacy-planning-archive/planning/todos/{pending,deferred}/`.

### 5.7 Cross-cutting migration concerns

1. **`.planning/` → `.luca/`** is the dominant mechanical cost — every
   persisting module + 7 of 10 instruction files hardcode the legacy tree.
2. **Duplicated tables** — `integration/model-routing.ts` dups luca-framework's
   `MODEL_ROUTING_TABLE`; `PIPELINE_ORDER` is mirrored in 3 places.
3. **`state/todos.ts` is superseded** by MuninnDB — drop, don't port.
4. **Test coverage** — ~24 of 99 modules tested; all 10 modes, 8 of 9
   subagents, the verification harness, and the rule engine have zero tests.
5. **Harness-specific glue** has no Claude Code equivalent — re-implement.

## 6. Migration plan — discussion item 3

Restructures the monorepo into the 4 packages (§4) and ports all mastracode
functionality as TS source (compiled to the Claude Code shape), then removes
legacy. **Sequenced so `luca-mastracode` stays intact as the reference until
parity is verified (Phase G)** — legacy removal (Phase H) is the last step.

Dependency order: **A → B → C → D → E → F → G → H.** Each phase ends with a
green typecheck; G is the comprehensive parity gate before anything is deleted.

### Phase A — Package scaffolding

Stand up the 4-package skeleton: create `luca-cli` and `luca-tools` (new) and
`luca` (new public umbrella); `luca-core` already exists. Wire the workspace,
per-package `package.json`, build config, and the dependency DAG (`luca-core` ←
`luca-tools` + `luca-cli` ← `luca`). Visibility: cli/core/tools private, `luca`
public. **Done when:** `bun install` + typecheck green on empty-but-wired packages.

### Phase B — `luca-core`: port the logic

Port the deterministic logic from `luca-mastracode/src/` into `luca-core`,
retargeting every `.planning/` path to `.luca/` via `LUCA_DIR_CONTRACT`:
rule-engine · postmortem · recurrence · phase-diff · review-analysis ·
telemetry · session-ledger · verification-result · confidence-journal ·
claim-verifier · check parsers/runner/convergence · classify-complexity ·
project-preferences · vault resolution. Drop `state/todos.ts` (MuninnDB-backed
now). De-duplicate `model-routing`. **Done when:** `luca-core` exports the full
logic surface; typecheck green.

### Phase C — `luca-cli`: relocate + extend the CLI

Move the current `luca-framework/src/` (cli, commands, write-surface, init,
repair, hook, utils) into `luca-cli`; re-point imports to `luca-core`. Add CLI
surfaces for the six dropped tools — `luca retro` as a real postmortem
*generator* (not a hollow reader), `luca rules` (rule-engine list/run/gate/
suggest), `luca claim-verify`, a telemetry-emit surface, and the dropped
workflow-state / roadmap / verification / confidence / branch actions. Drop
`migrate-planning` + `src/migration/` and the `luca run` mastracode launcher.
**Done when:** every ported logic module has a CLI surface; typecheck green.

### Phase D — `luca-tools`: artifact model + compiler  ⚠ largest / riskiest

The pillar. (1) Design the TS definition model for each artifact type — agents/
subagents, commands, skills, rules, hooks. (2) Build the **compiler** — TS defs
→ the Claude Code shape (`.claude/agents/`, `.claude/commands/`, `skills/`,
hooks config). (3) Port the 9 subagents + 10 mode instruction bodies +
shared-prefix + agent-constraints + memory-tier-discipline as TS definitions —
**restoring** the functionality the #262 hand-rewrite degraded (vertical-slice
+ TDD guidance, telemetry instrumentation, rule/postmortem/claim-verify
invocations). (4) The compiled output supersedes — and deletes — the
hand-written `skills/` + `.claude/`. **Done when:** `bun run build` regenerates
the full Claude Code artifact set from TS.

### Phase E — Re-implement orchestration as Claude Code hooks

The orchestration concerns that were Mastra subscriptions become Claude Code
hooks/settings: pipeline-guard (switch-mode watchdog), read-only-enforcement,
continuation-messages, context-refresher — hook definitions in `luca-tools`,
shared logic in `luca-core`. **Done when:** the pipeline self-enforces under
Claude Code with no Mastra harness.

### Phase F — `luca`: umbrella + distribution

`luca` depends on cli/core/tools; its build inlines them (they are private/
unpublished); `luca init` installs the compiled artifacts. Publish config →
`@alecsibilia/luca`. **Done when:** `@alecsibilia/luca` installs and runs the
full workflow.

### Phase G — Parity verification (gate)

Re-run the parity audit against the new structure. Confirm every §5 port /
re-implement item is present and wired, the eight §3 functional gaps are
closed, telemetry emits, and the learning loop runs end-to-end. **Done when:** a
clean parity report — this gates Phase H.

### Phase H — Remove legacy

Gated on G. Delete `luca-mastracode`; dissolve the old `luca-framework`
package; remove residual `.planning/` references and Cursor/Pi support; docs
cleanup. **Preserve `.legacy-planning-archive/`** (slim-down specs — §9). The
user handles the npm deprecations.

### Post-migration

Measure real workflow runs → revisit the slim-down (§9).

## 7. Decisions log

| Date | Decision |
|---|---|
| 2026-05-22 | Remove `luca-mastracode`, `.planning/`, Cursor/Pi support, `migrate-planning` — **after** functionality is ported, not before. |
| 2026-05-22 | Functionality is ported as **TS source + compiler**, never hand-written markdown. |
| 2026-05-22 | The 9 MuninnDB tracking todos are mis-framed ("patch markdown") — they will be re-derived from the §6 migration plan. |
| 2026-05-22 | Migrate the current 6-mode pipeline as-is; the workflow slim-down is **deferred** to post-migration — data-driven, re-oriented off the migrated workflow (§9). |
| 2026-05-22 | Item-1 package structure resolved (§4.3): `luca-cli` / `luca-core` / `luca-tools` / `luca`; public = `@alecsibilia/luca`; `luca-studio` out of scope. |
| 2026-05-22 | Phase B ports follow **TDD** — understand the module, write the `luca-core` test first (red), then port the implementation to green. Tests run scoped via `bun test <file>`. |

## 8. Open questions

All item-1 questions (§4.3) and the slim-down fork (§9) are resolved. New
questions surface here as the §6 migration plan is executed.

## 9. Deferred — workflow slim-down

The `.legacy-planning-archive/` pipeline redesign (~11 specs: collapse
triage+research+architect → one `plan` mode, drop `discuss`, renumber the
pipeline, add todo-confidence frontmatter, a `backlog-groom` skill) is
**deferred, not dropped**.

Sequence: migrate the current 6-mode pipeline as-is (§6) → measure real
workflow runs → revisit the slim-down, re-oriented off the *migrated* workflow
rather than the old mastracode one. The specs live in
`.legacy-planning-archive/planning/todos/pending/` — Phase H must **not**
delete that archive.

## 10. Progress

> Live progress marker. Full resumption detail is in MuninnDB —
> `session:repo-restructure-handoff` (luca-framework vault).

- **Phase A** — package scaffolding — ✅ done & committed.
- **Phase B** — port logic into `luca-core` — in progress, **6 of ~14
  subsystems** done:
  - ✅ `classify-complexity` → `luca-core/src/complexity/`
  - ✅ `check-parsers` → `luca-core/src/checks/`
  - ✅ `rule-engine/define-rule` → `luca-core/src/rule-engine/`
  - ✅ `vault` → `luca-core/src/vault/`
  - ✅ `phase-diff` → `luca-core/src/analysis/`
  - ✅ `telemetry` → `luca-core/src/telemetry/`
  - **next:** `session-ledger`, then `verification-result` ·
    `confidence-journal` · `claim-verifier` · `review-analysis` · `postmortem` ·
    `rule-engine` runner + recurrence · `preferences`.
- **Phases C–H** — not started.

Each Phase B subsystem is ported test-first (TDD), gated on `tsc` + `bun test`,
and committed individually (`feat(restructure): Phase B — …`).
