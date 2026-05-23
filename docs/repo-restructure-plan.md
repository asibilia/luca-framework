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
- **Phase B** — port logic into `luca-core` — ✅ **done**, all 14
  subsystem-units ported:
  - ✅ `classify-complexity` → `luca-core/src/complexity/`
  - ✅ `check-parsers` → `luca-core/src/checks/`
  - ✅ `rule-engine/define-rule` → `luca-core/src/rule-engine/`
  - ✅ `vault` → `luca-core/src/vault/`
  - ✅ `phase-diff` → `luca-core/src/analysis/`
  - ✅ `telemetry` → `luca-core/src/telemetry/`
  - ✅ `session-ledger` → `luca-core/src/ledger/`
  - ✅ `verification-result` → `luca-core/src/verification/`
  - ✅ `confidence-journal` → `luca-core/src/confidence/`
  - ✅ `claim-verifier` → `luca-core/src/claim-verifier/`
  - ✅ `review-analysis` → `luca-core/src/review-analysis/` (relocated
    from `luca-framework/src/write-surface/helpers/`)
  - ✅ `postmortem` → `luca-core/src/analysis/postmortem.ts`
  - ✅ `rule-engine` runner + recurrence → `luca-core/src/rule-engine/`
  - ✅ `preferences` read/merge logic → `luca-core/src/preferences/`
    (schema was already ported; this added `extractPreferences` /
    `mergePreferences` and rewired the v13 write-surface handlers)
- **Phase C** — `luca-cli` relocate + extend the CLI — ✅ **done**:
  - ✅ dropped the mastracode `run` launcher + `migrate-planning` +
    `src/migration/`
  - ✅ relocated all of `luca-framework/src/` → `luca-cli/src/` (git mv,
    history preserved); retargeted the one mastracode import
    (`sanitizeVaultName`) to luca-core; `luca-framework` is now a husk
    (Phase H removes it)
  - ✅ added CLI surfaces for every ported luca-core logic module —
    `luca claim-verify`, `luca telemetry` (emit / new-run), `luca retro` (a
    real postmortem *generator*, not a hollow reader), `luca rules`
    (list / run / gate / suggest), `luca classify`. Closes §3 functional
    gaps #1, #4, #5, #6, #7.
  - ✅ dropped-actions audit produced
    (`docs/repo-restructure-dropped-actions-audit.md`). Audit finding F2
    closed with `luca confidence read|summary|render` and
    `luca verification read|aggregate`. F1 (confidence-log schema
    divergence) and F3–F5 (design calls; small `luca state advance` side-
    effect verifications) are documented in the audit as follow-ups that
    need a design decision before they can land.
- **Phase D** — `luca-tools` artifact model + TS→Claude-Code compiler — ✅ **done**:
  - ✅ **D-1** — `define-*` factories landed at
    `packages/luca-tools/src/define/` (`defineAgent`, `defineSubagent`,
    `defineCommand`, `defineSkill`, `defineHook`, `defineRule`
    re-export). Discriminated union `Artifact` + narrow guards for the
    D-2 compiler. Schemas declare D1 guidance / telemetry / pipeline-
    invocation fields explicitly so D-3 can port subagents without
    scattering restored guidance into per-subagent prose.
  - ✅ **D-2** — TS→Claude-Code compiler landed at
    `packages/luca-tools/src/compile/`. Top-level
    `compile(artifacts, outputRoot)` dispatches off the `Artifact`
    discriminator into six per-kind emitters (agent, subagent, command,
    skill, hook, rule); hook slices merge into a single
    `<outputRoot>/.claude/settings.json` with events ordered by a fixed
    `HOOK_EVENT_ORDER`. The shared `render-body.ts` interpolates D1
    `guidance` / `pipelineInvocations` / `telemetryHooks` into
    deterministic `## Guidance` / `## Pipeline Invocations` / `##
    Telemetry` preludes appended below the author's own instructions —
    so D-3 can port subagents from luca-mastracode by flipping flags on
    definitions instead of re-writing dropped guidance into every body.
    `render-frontmatter.ts` is a hand-rolled deterministic YAML emitter
    calibrated against the hand-written precedents in
    `packages/luca-framework/.claude/`. Rules are pass-through
    bookkeeping — they live as `.luca/rules/<id>.ts` in the consuming
    repo and are loaded by `@alecsibilia/luca-core/rule-engine`; the
    compiler only records them in the report so the parity audit can
    enumerate the full surface. CLI driver at
    `packages/luca-tools/src/compile/bin/compile.ts` (run via
    `bun run --filter @alecsibilia/luca-tools compile -- --manifest
    <path>`). Executable smoke fixture at
    `src/compile/__fixtures__/compile-smoke.ts` (run via `bun run
    --filter @alecsibilia/luca-tools compile:smoke`). Idempotence
    verified: same input → byte-identical output across two compile
    runs. D-4 will swap the outputRoot at the host repo's tracked
    `.claude/` and `skills/`.
  - ✅ **D-3** — ported 8 subagents (researcher, discussion,
    plan-reviewer, executor, verifier, reviewer, learner,
    shadow-scanner) and 10 mode-agents (triage, research, architect,
    execute, review, finalize, discuss, build, plan, fast) + the 3
    shared glue files (shared-prefix, agent-constraints,
    memory-tier-discipline) from luca-mastracode TS source to
    `packages/luca-tools/src/artifacts/{subagents,modes,shared}/` as
    `defineSubagent` / `defineAgent` definitions. Dropped the
    `planner` (orphan: registered, never invoked — architect mode
    does the planning work directly) and `fix` (orphan: referenced in
    execute.md but never existed as a concrete subagent) subagents
    per plan §5.6. D1 restoration applied throughout via flags on
    the factory schemas (verticalSlice / tdd / selfVerify /
    antiSycophancy guidance; telemetry hooks for phase / wave /
    subagent / verification boundaries; pipeline invocations for
    rule-run, claim-verify, postmortem-generate, confidence-log,
    muninn-recall). Specifically: executor + execute + architect
    carry verticalSlice; executor + execute + build carry tdd;
    every reviewer-shaped subagent + review + finalize carry
    antiSycophancy; execute owns the full telemetry hook set per
    §3 #1; execute + verifier carry rule-run + claim-verify per
    §3 #5/#6/#7; learner + finalize carry postmortem-generate per
    §3 #4. Path retargeting: every `.planning/` reference rewrites
    to `.luca/`; the legacy uppercase filenames (`PLAN.md`,
    `RESEARCH.md`, `CONTEXT.md`, `REVIEW-{n}.md`, `POSTMORTEM.md`)
    retarget to the LUCA_DIR_CONTRACT canonical names (`plan.md`,
    `research.md`, `context.md`, `audits/<reviewer>.md`,
    `learn.md`). Mastra harness tool names (`workflowState`,
    `writePlanningFile`, `runChecks`, `runRules`, `runPostmortem`,
    `claimVerifier`, `manageRoadmap`, `manageTodos`,
    `ensureFeatureBranch`, `projectPreferences`, `pipelineLock`,
    `repoCleanup`, `verificationResult`, `confidenceJournal`,
    `sessionLedger`) retargeted to the `luca` CLI write surface.
    Hardcoded model IDs stripped from every mode-agent (the runtime
    picks per the complexity-routing table). Canonical Artifact[]
    manifest landed at
    `packages/luca-tools/src/artifacts/index.ts` as both a default
    and a named `ARTIFACTS` export of `[...SUBAGENTS, ...MODES]`.
    Wired `compile:artifacts` package script
    (`bun run --filter @alecsibilia/luca-tools compile:artifacts --
    --out <path>`). Verified end-to-end: 18 files render to a /tmp
    output tree, two consecutive runs produce byte-identical bytes,
    and spot-checks of the rendered executor confirm the D1
    Guidance / Pipeline Invocations / Telemetry preludes appear
    below the body (the compiler is doing exactly what D1
    specified: flipping flags expands into deterministic prose).
  - ✅ **D-4** — superseded and deleted the hand-written
    `packages/luca-framework/.claude/` (110 files: 36 agents + rules +
    skills + settings.json + .build-manifest.json) and
    `packages/luca-framework/skills/` (37 files: 11 SKILL.md + supporting
    files) — 147 files total — replaced wholesale by the
    `compile:artifacts` pipeline landed in D-3. Compiled artifacts land
    at `packages/luca-tools/dist/claude/` as **build output** (per the
    D-2 contract, the default `--out`); they are NOT committed to this
    repo. The framework's own dev work uses the user-level
    `~/.claude/` toolbox; consumer repos receive the artifacts via
    `luca init` (wired in Phase F-2). Deletion commit:
    `fd0b169be5240872f75a1904f8c72784ef95ec41`. tsc gate green on
    luca-tools + luca-core + luca-cli post-deletion (luca-cli has no
    dependency on the deleted dirs, confirmed via grep).
- **Phase E** — re-implement orchestration as Claude Code hooks — ✅ **done**:
  - ✅ **E-1** — `pipeline-guard` hook landed. Pure algorithm at
    `packages/luca-core/src/orchestration/pipeline-guard.ts` —
    `checkPipelineGuard()` is a stateless decision function that
    delegates legality to the canonical `PIPELINE_TRANSITIONS` table in
    `state/configs/`; rejects unknown steps, same-step no-ops, and
    illegal transitions with a typed reason code + structured telemetry
    payload. Hook surface in luca-tools at
    `packages/luca-tools/src/hooks/pipeline-guard/{index.ts,handler.ts}`
    — registered as `PreToolUse` on `Bash` matcher with the bun-script
    runtime; handler narrows to `luca state advance <step>` invocations
    (the single structured surface for pipelineStep mutations in v13's
    write-surface), reads `.luca/state.json`, calls the algorithm, and
    exits 2 with a stderr message on rejection. Failure-open on every
    error path (the CLI's own legal-transition check is the
    authoritative gate; the hook is a fast-path). The
    `emit-hook.ts` compiler needed no extension; the existing
    bun-script emission produces the correct
    `bun "$CLAUDE_PROJECT_DIR"/<handler>` command. Handler source
    distribution from luca-tools to the consumer repo's
    `.claude/hooks/pipeline-guard.ts` is a Phase F-2 (`luca init`)
    concern. Smoke verified at `/tmp/e1-verify-$$`: the merged
    settings.json contains the `PreToolUse[Bash]` entry with the
    correct command. No audit follow-ups closed this run (F3 stays
    open for opportunistic pickup later in Phase E).
  - ✅ **E-2** — `read-only-enforcement` hook landed. Pure algorithm
    at `packages/luca-core/src/orchestration/read-only-enforcement.ts`
    — `enforceReadOnly()` is a stateless decision function that
    derives the read-only-step set (`READ_ONLY_STEPS`) from the
    canonical `coarsePhaseOf()` mapping (every step whose coarse
    phase is `PLANNING` or `REVIEWING`: triage, research, discuss,
    architect, plan, plan-review, verify, review, learn) plus a
    small `ReadOnlyToolClass` taxonomy (`write-file`, `edit-file`,
    `notebook-edit`, `bash-mutate`, `other`). Reports a typed
    verdict `{ allowed, reason, message, telemetry? }`. A module-
    load dev-guard asserts `READ_ONLY_STEPS` agrees with
    `coarsePhaseOf` so edits in either place fail loud. No new
    `READ_ONLY_STEPS`-style constant was added to `state/configs/`
    — the coarse-phase map is the single source of truth.
    Hook surface in luca-tools at
    `packages/luca-tools/src/hooks/read-only-enforcement/{index.ts,handler.ts}`
    — three sibling `PreToolUse` definitions
    (`read-only-enforcement-write`, `…-edit`, `…-notebook-edit`)
    with matchers `Write` / `Edit` / `NotebookEdit` respectively,
    all `bun-script` runtime, all referencing the same shared
    handler at `.claude/hooks/read-only-enforcement.ts`. The
    handler reads the PreToolUse payload, classifies the tool via
    `READ_ONLY_TOOL_CLASS_BY_NAME`, loads `.luca/state.json`, calls
    `enforceReadOnly()`, and exits 0 (allow) or 2 (block + stderr).
    Bash is intentionally NOT in the matcher set: pre-classifying
    Bash commands would require lifting `classify-bash-command`
    out of luca-cli, and the stage-gate hook (luca-cli, fires on
    `Bash`) already covers Bash mutation enforcement via the
    `STAGE_TOOL_MATRIX` in `REVIEWING`/`PLANNING` phases — defense
    in depth without duplicating the parser. Failure-open on
    every error path (empty stdin, JSON parse error, unknown tool,
    internal throw). The `emit-hook.ts` compiler needed no
    extension — the existing `bun-script` emission produces the
    correct `bun "$CLAUDE_PROJECT_DIR"/<handler>` command for all
    three slices, and the per-event merge in `compile()` composes
    them into the same `PreToolUse` array. Handler source
    distribution from luca-tools to the consumer repo's
    `.claude/hooks/read-only-enforcement.ts` is a Phase F-2
    (`luca init`) concern. Smoke verified at `/tmp/e2-verify`:
    merged `settings.json` contains four `PreToolUse` entries in
    stable order — `Bash` (pipeline-guard), `Write`, `Edit`,
    `NotebookEdit` — each with the correct command + status
    message. No audit follow-ups closed this run (F3 still open
    for opportunistic pickup; F4/F5 not relevant to this surface).
  - ✅ **E-3** — `continuation-messages` hook landed. Pure
    algorithm at
    `packages/luca-core/src/orchestration/continuation-messages.ts`
    — `computeContinuationMessage()` is a stateless builder that
    decides whether to surface a mode-entry kick-off prompt for
    the freshly-entered `pipelineStep` and what it says. Returns
    `{ message, severity, reason, telemetry? } | null` (null when
    the new step is `idle`). Per-step templates live in a
    `Record<ContinuationStep, string>` where
    `ContinuationStep = Exclude<PipelineStep, 'idle'>`, giving
    compile-time exhaustiveness across the 13 non-idle steps; a
    module-load dev-guard asserts every non-idle step has a
    template. The Mastra-only `LucaWorkflowState` fields the
    original templates leaned on (`intent`, `assignedTodos`,
    `affectedAreas`, `planFile`, `roadmapFile`,
    `currentPhaseSlug`) do NOT survive — luca-core's state schema
    is intentionally narrower; the artifact-path anchors moved
    into the D-3 per-mode subagent instructions instead. The
    message envelope still carries `coarsePhase`, `complexity`,
    `oversight`, and optional `currentPhase/totalPhases` so the
    next mode knows what regime it's in. The whole message is
    `<system-reminder>`-wrapped per
    `docs/research/prompt-architecture/02` (cache-friendly,
    invisible to user, visible to model).
    Hook surface in luca-tools at
    `packages/luca-tools/src/hooks/continuation-messages/{index.ts,handler.ts}`
    — `PostToolUse` on `Bash` matcher, `bun-script` runtime.
    Handler narrows to successful `luca state advance <step>`
    invocations: parses the requested target step out of argv
    (parser duplicated from pipeline-guard's, intentionally —
    parser is ~30 lines and stable, and lifting it to luca-core
    would add a transitive dep that needs to survive Phase F-2's
    `luca init` artifact copy), reads `.luca/state.json`, and
    only emits a continuation when the now-current `pipelineStep`
    matches the requested target step (i.e. the advance actually
    happened — if the CLI rejected the transition the state
    still shows the old step and the hook exits silently). On
    success the handler emits Claude Code's PostToolUse JSON
    output shape:

    ```json
    {
      "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": "<system-reminder>…</system-reminder>"
      }
    }
    ```

    The `additionalContext` channel is the message-layer
    injection surface from `docs/research/prompt-architecture/02`
    — cache-warm, invisible to the user, visible to the model.
    Failure-open everywhere; no stderr writes (informational
    hook). Event/matcher choice rationale: PostToolUse is the
    only Claude Code event with the same post-state-change
    semantics as the mastracode original (which fired AFTER a
    successful Mastra mode switch); Bash matcher catches every
    transition (skills, agents, manual invocations all funnel
    through `luca state advance`); UserPromptSubmit would mis-fire
    on every user message, and Stop lacks the deterministic
    transition signal. The `emit-hook.ts` compiler needed NO
    extension — PostToolUse + Bash matcher + bun-script runtime
    are all already supported (same primitives as E-1). Smoke
    verified at `/tmp/e3-verify`: merged `settings.json` contains
    one new `PostToolUse[Bash]` entry alongside the four
    `PreToolUse` entries from E-1/E-2 (5 hooks total), and two
    consecutive compile runs produce byte-identical output. F3
    audit follow-up still open for opportunistic pickup; F1/F4/F5
    not relevant to this surface.
  - ✅ **E-4** — `context-refresher` hook landed. Pure algorithm at
    `packages/luca-core/src/orchestration/context-refresher.ts` —
    `computeContextRefresher()` is a stateless decision function that
    decides whether to surface a per-step `<luca-reminder>` to combat
    context rot. Returns `{ message, severity, reason, telemetry?,
    nextState? } | null`. Per-step reminder templates live in a
    `Record<RefresherStep, string>` where
    `RefresherStep = Exclude<PipelineStep, 'idle'>`, giving
    compile-time exhaustiveness across the 13 non-idle steps; two
    module-load dev-guards assert every non-idle step has a reminder
    AND every reminder targets a step whose coarse phase is NOT IDLE.
    Mastracode-mode-specific bodies (`luca:1-triage`, `luca:4-execute`,
    …) were retargeted to luca-core's `pipelineStep` vocabulary; stock-
    Mastra utility modes (`build`, `plan`, `fast`) were dropped (they
    were harness utilities and do not map to a pipelineStep). Reminder
    envelope is `<luca-reminder>` (matching the mastracode original)
    rather than `<system-reminder>` — these are tactical mid-
    conversation nudges, distinct from continuation-messages's
    step-entry kick-off prompt.
    Threshold model: a deterministic tool-call-count proxy substitutes
    for the mastracode `TokenBudgetMonitor` (Claude Code does not
    expose a context-window utilization API to hooks). Defaults live in
    `packages/luca-core/src/orchestration/context-refresher-config.ts`
    as `CONTEXT_REFRESHER_DEFAULTS.toolCallsPerRefresh = 30` — a rough
    analogue for the mastracode 30% threshold on a 200K window. The
    algorithm fires when EITHER the step changed since the last fire
    (re-anchor on the new mode) OR the counter crosses the threshold
    within the current step.
    Hook surface in luca-tools at
    `packages/luca-tools/src/hooks/context-refresher/{index.ts,handler.ts}`
    — `PostToolUse` with matcher `*` (every tool call), `bun-script`
    runtime. Rationale: tool calls correlate with context growth more
    tightly than UserPromptSubmit or Stop in an autonomous run where
    one user prompt may chain hundreds of tool calls; PreToolUse would
    tick BEFORE the tool output is folded in, so PostToolUse is the
    right post-context-update edge. Matcher `*` because every tool
    call grows context — narrowing to e.g. `Bash` would miss read-
    heavy planning sessions that bloat context via Read/Grep/Glob
    without shelling out.
    Cooldown-state location decision: **sidecar file at
    `.claude/cache/context-refresher-state.json`** (NOT `.luca/`).
    Three options were considered: (1) sidecar file, (2) extend the
    luca-core state schema with a `lastContextRefreshAt` field, (3)
    stateless count from the ledger. Picked option (1) because the
    `.luca/` contract is a strict allowlist of pipeline-state
    artifacts (a hook-managed cooldown counter is not pipeline state),
    extending state.json would mean a breaking schema change for a
    cosmetic feature, and the ledger doesn't record raw tool-call
    ticks. `.claude/cache/` is a fresh subdirectory inside Claude
    Code's config dir — independently discardable at Phase H without
    touching `.luca/`. The handler reads/writes the sidecar atomically
    (write-then-rename); the algorithm itself stays pure and stateless
    across invocations via a `ContextRefresherCarryState` shape
    (`toolCallCount`, `lastFiredStep?`, `lastFiredAt?`) the handler
    threads in and out.
    Handler ticks the counter BEFORE calling the algorithm so the
    threshold check reflects THIS tool call, persists `nextState` (or
    the incremented prior state on no-op verdicts) BEFORE writing
    stdout so a stdout error doesn't leak ticks, and emits the
    reminder via `additionalContext` in the PostToolUse JSON output
    shape:

    ```json
    {
      "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": "<luca-reminder>…</luca-reminder>"
      }
    }
    ```

    Failure-open everywhere — informational hook, never blocks. Every
    error path (stdin parse error, sidecar read/write failure,
    state.json missing/malformed, internal throw) exits 0 silently.
    `emit-hook.ts` needed NO extension — PostToolUse + matcher `*` +
    bun-script runtime are all already supported (same primitives as
    E-3). HOOKS barrel: `HOOKS = [pipelineGuardHook,
    ...READ_ONLY_ENFORCEMENT_HOOKS, continuationMessagesHook,
    contextRefresherHook]` (6 hooks total). Smoke verified at
    `/tmp/e4-verify`: merged `settings.json` adds a `PostToolUse[*]`
    entry alongside the four `PreToolUse` entries from E-1/E-2 and the
    `PostToolUse[Bash]` entry from E-3 (6 hooks total). Continuation
    runs first within `PostToolUse` (registration order = per-event
    order) so a step-advance Bash invocation receives the kick-off
    message before the refresher reminder. Two consecutive compile
    runs produce byte-identical output (idempotent). F3 audit follow-
    up still open for opportunistic pickup; F1/F4/F5 not relevant to
    this surface.
  - ✅ **E-5** — ported 40 user-facing skills from `~/.claude/skills/`
    + the pre-D-4 `packages/luca-framework/{.cursor/skills,skills/
    commands}/` snapshot into `packages/luca-tools/src/artifacts/
    skills/<name>/index.ts` as `defineSkill` definitions. Closes the
    manifest gap surfaced by the post-E-4 audit ("ZERO skills + ZERO
    commands in the compiled output"). Each skill compiles to
    `skills/<name>/SKILL.md` via the existing D-2 `emit-skill.ts` (the
    emitter needed NO extension).

    Batch shape:
      - **Batch 1 — Luca-pipeline core (9 skills):** lu, luca-init,
        luca-telemetry-report, luca-write-surface, phase-discuss,
        phase-plan, phase-execute, phase-research, phase-assumptions.
      - **Batch 2 — peripheral milestones / GH / backlog (13 skills):**
        phase-add, phase-insert, phase-remove, milestone-new,
        milestone-complete, milestone-audit, milestone-gaps,
        gh-prepare, gh-issue-triage, gh-pr-address, lu-review,
        todo-check, todo-add.
      - **Batch 3 — utility, repo audits, Luca extras (18 skills):**
        grill-me, memory-audit, rename-audit, arch-audit,
        repo-cleanup, repo-audit (the user-listed set); plus
        Luca-pipeline-essential extras included by judgment per the
        E-5 brief: seed-memory, session-pause, session-plan,
        session-resume, post-init-tour, workflow-save, progress,
        project-new, note, autopilot, quick, choose.
      - **Batch 4 — manifest registration:** SKILLS barrel at
        `packages/luca-tools/src/artifacts/skills/index.ts`,
        `ARTIFACTS = [...SUBAGENTS, ...MODES, ...HOOKS, ...SKILLS]` in
        `packages/luca-tools/src/artifacts/index.ts`.

    Source priority outcomes (per the E-5 brief's "user copy WINS over
    pre-D-4" rule):
      - **User copy canonical** (9 skills present in `~/.claude/skills/
        <name>/SKILL.md` as real files): luca-init, luca-telemetry-
        report, luca-write-surface, grill-me, memory-audit,
        rename-audit, arch-audit, gh-prepare, gh-issue-triage.
      - **Pre-D-4 cursor copy** (`fd0b169be^:packages/luca-framework/
        .cursor/skills/<name>/SKILL.md`) for everything else where the
        user has only a (now-dangling) symlink: lu, all `phase-*`, all
        `milestone-*`, `todo-*`, and the Luca-pipeline extras.
      - **Pre-D-4 skills/commands** (`fd0b169be^:packages/luca-
        framework/skills/commands/<name>.md`) for skills that never
        had a SKILL.md / cursor variant pre-D-4: `gh-pr-address`,
        `lu-review`, `repo-cleanup`.
      - **No divergence audit required** — every skill resolved to
        exactly one source (either present-and-user-edited OR
        symlink-only-and-recovered-from-git); no skill had BOTH a
        non-dangling user copy AND a divergent pre-D-4 copy needing
        per-line reconciliation.

    Per-action D3 judgement outcomes (per the E-5 brief's RESTORE +
    IMPROVE posture for guidance-dropped skills): for E-5 the bodies
    are markdown procedures, not subagent contracts, so D1 factory
    flags (`verticalSlice` / `tdd` / `selfVerify` / pipeline
    invocations) do NOT apply to skills — those are agent concerns and
    were already restored in D-3. Skill bodies port verbatim with
    deterministic path retargeting (`.planning/` → `.luca/`;
    `PLAN.md/RESEARCH.md/CONTEXT.md/POSTMORTEM.md` → lowercase
    LUCA_DIR_CONTRACT canonicals); references to the v13 write-surface
    CLI (`luca preferences write`, `luca todo list`, `luca state
    advance`, etc.) carried over as-is from the user's current copies
    where present, and the pre-D-4 cursor copies already use that
    surface from the v13 migration.

    Out-of-scope artifacts (NOT ported in E-5, per the brief's
    cross-cutting exclusion list): vercel:*, cloudflare:*,
    frontend-design:*, skill-creator:*, firecrawl-*, claude-api,
    mastra, shadcn, impeccable, playwright-cli, run, init,
    code-review, security-review, verify.

    Examined-but-deferred Luca-adjacent skills (candidates for a
    follow-up port if they prove load-bearing in F-2 onboarding):
    `help`, `help-tour` (generic CLI helpers, not pipeline machinery);
    `pr-address` (duplicated by `gh-pr-address` — same job, different
    naming); `pr-create`, `outcome`, `restructure-driver` (current-
    session driver only — installed at `~/.claude/skills/` and not
    intended as a framework artifact), `shadow-cleanup`, `git-feature`,
    `jira-issue`, `jira-start`, `update`, `qa-consolidate`,
    `workflow-start`, `profile-export`, `profile-import`,
    `config-profile`, `config-settings`, and the `rule-*` reference
    skills (`rule-complexity-gating`, `rule-file-naming`,
    `rule-harness-verification`, `rule-hook-skill-boundary`,
    `rule-lu-workflow` — arguably better as `.claude/rules/` advisory
    files than skills; deferring until the rule-engine port settles
    that contract); `codebase-map` (cursor-mode-specific multi-agent
    spawn pattern — needs a Claude-Code-native re-think). `bug-diagnose`
    has a working user copy but is generic enough that it falls under
    the cross-cutting exclusion.

    Audit follow-ups (per the E-5 brief): no F1/F3 closure landed
    in this run — skills reference the v13 write surface
    (`luca confidence log`, `luca state advance`) generically; F1's
    schema-alignment + F3's `luca state advance` side-effect
    verification remain follow-ups for a later phase (F1 will be
    resolved by reshaping the writer when callers in agents need the
    full ConfidenceEntrySchema shape — none of the ported skills
    construct confidence-log payloads directly).

    Smoke verified at `/tmp/e5-verify-XXXX*`: `bun run --filter
    @alecsibilia/luca-tools compile:artifacts -- --out <tmp>` emits
    all 40 skill files at `<tmp>/skills/<name>/SKILL.md` with valid
    YAML frontmatter (`name` + `description`) and verbatim markdown
    bodies. Two consecutive compile runs produce byte-identical output
    (`diff -r` exit 0). Spot-checked `lu`, `grill-me`, `memory-audit`,
    `phase-execute` (largest at 1843 source lines) all render
    correctly. tsc green on luca-tools + luca-core + luca-cli post-
    increment. Commands surface lands in E-6.
  - ✅ **E-6** — ported 17 user-facing slash commands from
    `~/.claude/commands/<name>.md` (user copy canonical at E-6 time) as
    `defineCommand` TS definitions at
    `packages/luca-tools/src/artifacts/commands/<name>.ts`. The 17
    ported commands: bug-diagnose, gh-issue-triage, gh-pr-address,
    gh-prepare, grill-me, lu, lu-review, luca-init,
    luca-telemetry-report, memory-audit, milestone-new, phase-discuss,
    phase-execute, phase-plan, repo-cleanup, todo-add, todo-check. Each
    file uses the D-1 `defineCommand` factory. Bodies sourced verbatim
    from the user's working copies (the user has already applied
    `.planning/` → `.luca/` retargeting). Manifest extended at
    `packages/luca-tools/src/artifacts/index.ts`:
    `ARTIFACTS = [...SUBAGENTS, ...MODES, ...HOOKS, ...SKILLS,
    ...COMMANDS]` (commands appended last).

    Decision-algorithm outcomes (per the E-6 brief — the commands-vs-
    skills surface question in Claude Code: SKILL.md auto-surfaces as
    a slash command, but a `commands/<name>.md` shipped alongside it
    overrides the SKILL.md body for the explicit `/<name>` invocation
    context):
    - **17 ported**: every Luca-specific command the user has been
      maintaining at `~/.claude/commands/`. Each has a meaningfully
      different body from the corresponding SKILL.md — the commands
      are tighter, more imperative "do this right now when the user
      explicitly types `/<name>`" prompts (e.g. `/lu` is a 75-line
      orchestrator script that drives the pipeline loop end-to-end;
      the `lu` SKILL is a broader routing skill). Both surfaces ship
      intentionally and the user has been editing them in tandem.
    - **1 skipped (aidesigner)**: third-party, auto-generated from
      `packages/aidesigner-agent-skills`; falls under the same
      "cross-cutting NOT ported" rule as vercel:*, cloudflare:*, etc.
    - **23 examined-but-no-port**: every other E-5 skill where the
      user has not maintained a separate `commands/<name>.md`. For
      these, Claude Code's auto-surface-SKILL.md-as-`/<name>`
      behavior is the entire user-facing slash-command surface — no
      separate command body needed. Examples: arch-audit, autopilot,
      choose, milestone-audit, milestone-complete, milestone-gaps,
      note, phase-add, phase-assumptions, phase-insert, phase-remove,
      phase-research, post-init-tour, progress, project-new, quick,
      rename-audit, repo-audit, seed-memory, session-pause,
      session-plan, session-resume, workflow-save, luca-write-surface.

    Pre-D-4 baseline check: `git show fd0b169be^:packages/luca-
    framework/.claude/commands/` did not exist (commands were under
    `packages/luca-framework/skills/commands/`, which carried 17
    files — exactly the user's current set). No pre-D-4 commands
    existed for the 23 examined-but-no-port skills, which corroborates
    the decision to rely on SKILL.md auto-surfacing for them.

    No `emit-command.ts` extension needed — the D-2 emitter handles
    every shape in the ported set.

    Audit follow-ups (per the E-6 brief): F1/F3 stay open. F1
    (confidence schema alignment) is not touched by any ported
    command — the commands reference \`luca state advance\` and other
    write-surface verbs generically, never constructing
    confidence-log payloads. F3 (\`luca state advance\` side-effect
    verification) likewise not addressed; the ported commands invoke
    \`luca state advance --to-step <step>\` but do not assert anything
    about the events it emits. Both carry forward to Phase G.

    Smoke verified at \`/tmp/e6-verify-9122-{a,b}\`: \`bun run --filter
    @alecsibilia/luca-tools compile:artifacts -- --out <tmp>\` emits
    all 17 command files at \`<tmp>/.claude/commands/<name>.md\` with
    valid YAML frontmatter (\`name\` + \`description\`) and verbatim
    markdown bodies. Two consecutive compile runs produce
    byte-identical output (\`diff -r\` exit 0). tsc green on
    luca-tools + luca-core + luca-cli post-increment. Phase E
    complete — orchestration hooks + skills + commands all ported.
- **Phase F** — `luca` umbrella + distribution — ✅ **done** 2026-05-23:
  - **F-1** ✅ **done** 2026-05-23: wire the publishable umbrella.
    - `packages/luca/package.json` flipped from private workspace stub
      to publish-shaped: name `@alecsibilia/luca`, version
      `13.0.0-alpha.0` (new lineage; supersedes legacy
      `@alecsibilia/luca-framework@12.0.0-alpha.16` once Phase H
      lands), `private` removed, `publishConfig.access: public`,
      `bin: ./bin/luca.js`, `files: [bin, dist, README.md, LICENSE]`,
      `exports.import: ./dist/index.mjs`, `exports.types:
      ./dist/index.d.mts`. Runtime deps mirror luca-cli's
      (`citty`, `@clack/prompts`, `consola`, `pathe`, `semver`,
      `shell-quote`, `update-notifier`, `zod`); workspace siblings
      (`luca-cli`, `luca-core`, `luca-tools`) live in
      `devDependencies` (dev-only — inlined at build time, not
      shipped to consumers).
    - `tsconfig.json` already matched the strict baseline
      (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
      `allowImportingTsExtensions`, `noUnusedLocals: false`) — no
      change needed.
    - `src/index.ts` re-exports `runMain`, `runInit`, `LUCA_VERSION`,
      and `ProjectContext` from `@alecsibilia/luca-cli`. Intentionally
      minimal — most consumers use the bin, not the library surface.
    - `bin/luca.js`: `#!/usr/bin/env bun` + import `../dist/index.mjs`
      + `runMain()`. Identical shape to the luca-framework precedent.
      Made executable (`chmod +x`).
    - `README.md` + `LICENSE`: minimal quickstart README + MIT
      license copied from repo root.
    - `build.config.ts` (unbuild): `inlineDependencies: true` rolls
      luca-cli + luca-core + luca-tools source into a single
      `dist/index.mjs` (+ chunks/ + shared/). Externals list pins
      every runtime npm dep so only the three workspace siblings
      inline. Rollup `replace` plugin substitutes the
      `__LUCA_VERSION__` sentinel that luca-cli's `utils/manifest.ts`
      uses — since luca-cli is inlined here, the umbrella's build is
      now the one doing the substitution.
    - **Build verified** (package-scoped — never `bun run build:all`):
      `bun run build` → `dist/index.mjs` (2.74 kB) + chunks/ +
      shared/ (~265 kB total). `__LUCA_VERSION__` correctly
      substituted to `"13.0.0-alpha.0"`. dist/ is gitignored
      (root .gitignore line 5).
    - **Tarball verified** (`bun pm pack` — proper catalog/workspace
      resolution; `npm pack --dry-run` is misleading here because
      npm doesn't resolve `catalog:`): 46 files, 74.7 kB packed,
      279.7 kB unpacked. Contents: `bin/luca.js`, `dist/{index.mjs,
      index.d.{ts,mts}, chunks/, shared/}`, `package.json`,
      `README.md`, `LICENSE`. `catalog:` refs resolved to `^4.3.6`
      (zod), workspace:* refs resolved to `0.1.0` (cli/core/tools)
      and kept in devDependencies (NOT shipped as runtime deps to
      consumers). No `src/` files. No workspace:* in runtime deps.
    - tsc green on all 4 packages (tools, core, cli, NEW: luca).
    - **Audit followups**: F1 + F3 carry forward unchanged. F-1 is
      pure umbrella wiring; no CLI/skill bodies touched. F1's
      `confidence log` writer-alignment is unaffected; F3's
      `luca state advance` ledger-event verification is unaffected.
  - **F-2** ✅ **done** 2026-05-23: rewire `luca init` to install the
    compiled luca-tools artifacts from inside the umbrella tarball.
    - **Build extension**: `packages/luca/build.config.ts` gained a
      `build:done` hook that imports `ARTIFACTS` from
      `@alecsibilia/luca-tools/artifacts` and calls
      `compile(ARTIFACTS, dist/claude)`. The umbrella build now emits
      `dist/claude/.claude/{agents,commands,settings.json}` +
      `dist/claude/skills/<name>/SKILL.md` alongside `dist/index.mjs`.
      Compile-at-publish-time was chosen over compile-at-install-time
      because (a) faster install — no per-install compilation; (b)
      idempotent — every user gets bit-identical artifacts; (c) avoids
      pulling unbuild + rollup + TS artifact source files into the
      consumer environment.
    - **Runtime-agnostic compile pipeline**:
      `packages/luca-tools/src/compile/emit-util.ts` switched
      `writeFileBytes` from `Bun.write` to `node:fs/promises writeFile`.
      Unbuild's CLI is Node-shebanged, so the `build:done` callback
      executes under Node where `Bun` is not defined. The compile
      pipeline is now runtime-agnostic; the CLI driver
      (`bin/compile.ts`) is still Bun-shebanged for shell ergonomics.
    - **install-skills resolver decision — TWO SOURCE ROOTS (option ii
      from the F-2 prompt)**: the compiler emits commands + agents
      under `<outputRoot>/.claude/` and skills under
      `<outputRoot>/skills/` — a single combined source would only
      match three of those four buckets. Surfacing BOTH roots
      explicitly (defaulting to `<dist/claude>/.claude` and
      `<dist/claude>/skills`) keeps the compiler's emission layout
      unchanged and the resolver semantics explicit. The new
      `InstallSkillsOptions` exposes `claudeArtifactsRoot` and
      `skillsRoot`; `skillsSource` is removed (breaking — only
      internal callers).
    - **Resolution algorithm**: walks up from `import.meta.url`
      looking for `@alecsibilia/luca/package.json`. Covers three
      scenarios: (a) installed —
      `<node_modules>/@alecsibilia/luca/dist/...` finds the package
      root one or two levels up; (b) umbrella dev tree —
      `packages/luca/...` finds the package root directly; (c)
      luca-cli dev tree — walks past luca-cli, doesn't find the
      umbrella, falls back to a monorepo-layout probe that looks for
      `packages/luca/package.json` from the workspace root. If
      `dist/claude/` hasn't been built yet, the helper skips with a
      clear message rather than failing.
    - **`listBundledArtifacts` signature change**: widened from
      `(skillsSource?: string)` to `(opts: { ... } = {})`. The single
      existing caller (`utils/doctor/checks/stray-local-install.ts`)
      invokes it with no arguments, so the call site is unchanged.
    - **`wire-claude-hooks.ts` LEFT UNCHANGED (analysis)**: the
      bundled `settings.json` from luca-tools registers hooks that
      reference per-project `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts`
      handler paths (pipeline-guard, read-only-enforcement,
      continuation-messages, context-refresher). Merging that into
      `~/.claude/settings.json` (global) would mean every project
      Claude Code runs in tries to execute those hooks — but their
      handler scripts only exist in per-luca projects. The existing
      `wireClaudeHooks` helper registers the path-free
      `luca hook stage-gate` command globally, which delegates to the
      CLI handler and reads `.luca/state.json` from cwd — correct
      design for a global registration. Per-project distribution of
      the bundled hooks' handler scripts + a per-project settings.json
      merge is a follow-up gap (handler-script distribution per
      `writeProjectSkeleton`), recorded for Phase G parity audit.
    - **Test fixture updated**: `install-skills.test.ts` now seeds
      the temp tree as `<dist-claude>/.claude/{commands,agents}` +
      `<dist-claude>/skills/` to mirror the compiler's emission
      layout, and passes both roots explicitly to `installSkills`.
    - **Build verification**: `cd packages/luca && bun run build` →
      `dist/index.mjs` (2.74 kB) + `dist/claude/...` populated.
      Report: agents:10 subagents:8 commands:17 skills:40 hooks:6
      rules:0. The umbrella's `files: [bin, dist, ...]` already
      includes `dist/` so the compiled artifacts ship inside the
      tarball without further config.
    - **Audit followups**: F1 + F3 carry forward unchanged; F-2 did
      not touch confidence-log payloads or `luca state advance`
      ledger-event emission. New follow-up recorded above
      (per-project hook handler distribution).
    - tsc green on all 4 packages.
  - **F-3** ✅ **done** 2026-05-23: final publish-readiness pass for
    `@alecsibilia/luca@13.0.0-alpha.0`. **Driver does PREP only — npm
    publish remains a manual user step.**
    - **`packages/luca/package.json` metadata additions**: `license:
      Apache-2.0` (matches the LICENSE file already shipped in the
      package), `author: Alec Sibilia <sibilia.alec@gmail.com>`,
      `homepage` + `bugs` (point at the GitHub repo / issues),
      `engines.bun: >=1.0.0` (Luca requires Bun at runtime).
      Vestigial `test: bun test` script removed (tests intentionally
      absent — no-tests rule; the script would have failed on every
      install attempt).
    - **`packages/luca/PUBLISHING.md` (new)**: end-to-end publish
      runbook covering: versioning lineage (`luca-framework@12` →
      `luca@13`), pre-publish checklist (4-package tsc, package-scoped
      build via `bun run --filter`, **`bun pm pack` — NOT `npm pack`
      because npm doesn't resolve `catalog:` refs**), tarball
      verification grep recipes (file count, exclusion of
      `src/`/`node_modules/`/`tsconfig`/`build.config`, confirmation
      that `catalog:`/`workspace:*` refs are resolved in the published
      `package.json`), offline smoke-test recipe (`tar -xzf` to temp
      + `bun bin/luca.js --help`), the actual user publish command
      (`npm publish --access public --tag alpha`), post-publish
      verification (`npm view ...`), tag promotion (alpha → beta →
      stable), deprecation flow, and a troubleshooting section
      covering common failure modes (unresolved catalog refs, missing
      `dist/claude/`, install-skills resolver edge cases).
    - **Build verification** (`bun run --filter @alecsibilia/luca
      build`): `dist/index.mjs` (2.74 kB) + `dist/claude/` populated.
      Report: agents:10 subagents:8 commands:17 skills:40 hooks:6
      rules:0. Total dist size ~265 kB.
    - **Tarball verification** (`bun pm pack`): 122 files, 245.27 kB
      packed, 0.86 MB unpacked. Contents: `bin/luca.js` (executable,
      `-rwxr-xr-x`), `dist/{index.mjs, index.d.{ts,mts}, chunks/,
      shared/, claude/}`, `package.json`, `README.md`, `LICENSE`.
      `catalog:` refs resolved to `^4.3.6` (zod). `workspace:*` refs
      resolved to `0.1.0` (cli/core/tools) — kept in `devDependencies`
      only, **NOT** in the shipped `dependencies`. No `src/` files,
      no `node_modules/`, no `tsconfig`/`build.config`. PUBLISHING.md
      correctly **excluded** from the tarball (the `files` field is
      `[bin, dist, README.md, LICENSE]` — PUBLISHING.md is for the
      publisher, not consumers). dist/claude tree fully present:
      40 skill SKILL.mds, 17 commands, 18 agents, settings.json.
    - **Offline smoke test**: extracted tarball to `mktemp -d`,
      confirmed `bin/luca.js` executable bit survives pack/extract,
      confirmed `bun bin/luca.js --help` reaches the entry point.
      (Errors on missing npm deps under raw `bun bin/luca.js` —
      expected; consumers run `npm install` to resolve.)
    - **Audit follow-ups (inspected against the BUILT bundle —
      both confirmed as Phase G blockers, not fixable cheaply here)**:
      - **F1 (confidence-log schema D2)** — **NOT applied**.
        `dist/chunks/confidence.mjs` shows the `log` subcommand still
        accepts the v13 `{score, stage, rationale, metadata}` shape
        rather than the canonical `ConfidenceEntrySchema` shape
        (`{phase, wave, task, confidence (high|medium|low), category,
        decision, alternatives, reasoning, risk, files, reviewHint?}`).
        Rewriting the writer is a non-trivial breaking change with
        ripple effects through downstream consumers (skills/agents
        that construct confidence-log payloads); needs to be done in
        Phase G alongside the parity audit, not slipped into F-3.
      - **F3 (`luca state advance` ledger emission)** — **confirmed
        missing**. The `lucaStateAdvanceTool` handler in
        `dist/shared/luca.Bs1mFXxQ.mjs` validates the transition,
        writes `.luca/state.json` atomically, returns success — but
        **emits no ledger events**. The shadow scanner's reader side
        explicitly handles `phase-empty-justification` (case statement
        + absence check in `dist/shared/luca.CIKVZO1U.mjs`), so the
        writer half of the contract is what's missing. Needs design
        work in Phase G — which ledger events get emitted on which
        transitions, and whether `state advance` is the right writer
        or if it belongs in a separate `state ledger` surface.
    - Commit: 2bb8917de.
    - tsc green on all 4 packages.
- **Phase G** — parity verification gate — ✅ **done** 2026-05-23:
  - **G-1** ✅ **done** 2026-05-23: comprehensive parity audit landed at
    `docs/repo-restructure-parity-report.md`. **Verdict: READY WITH
    CAVEATS.** Every §3 functional gap (1–8) closed (or partial in the
    case of #8, which carries F3 as a recorded follow-up); every §5
    port disposition row landed; tsc green on all four active packages
    (luca-tools, luca-core, luca-cli, luca); umbrella builds + packs to
    a 245.27 kB / 122-file tarball that resolves `catalog:` /
    `workspace:*` refs correctly; manifest verification confirms
    18 agents (10 modes + 8 subagents) + 17 commands + 40 skills + 6
    hooks (4 PreToolUse + 2 PostToolUse) + 0 rules, byte-identical
    across two compile runs (idempotent); D1 restoration preludes
    (Guidance / Pipeline Invocations / Telemetry) verified in compiled
    `executor.md`, `reviewer.md`, `learner.md`, `finalize.md`;
    telemetry round-trips end-to-end (verified at
    `/tmp/luca-parity-test.0Esf` with a real
    `.luca/telemetry/<runId>.jsonl` emission); learning loop wired
    structurally (`luca retro` → `analyzeRun()` → pitfall payloads
    with `vault: 'default'`). Four non-blocking caveats recorded for
    a follow-up v14 milestone:
      - **F1** — `luca confidence log` still accepts v13 `{score,
        stage, rationale}` shape; D2 reshape to canonical
        `ConfidenceEntrySchema` not yet applied (breaking change).
      - **F3** — `luca state advance` emits no ledger events;
        `phase-empty-justification` / `re-enter-pipeline` design call
        deferred.
      - **Hook handler distribution gap** — bundled `dist/claude/
        .claude/settings.json` registers 6 new Phase E hooks at
        `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts` but the
        handlers are not copied by `writeProjectSkeleton`. The new
        orchestration hooks (pipeline-guard, read-only-enforcement,
        continuation-messages, context-refresher) are dead on arrival
        in fresh `luca init` projects until this is wired.
      - **`vault-init` `.planning/` residue** — `vault-init.ts` /
        `vault-setup.ts` still write `.planning/config.json`, create
        `.planning/` directories, and reference the dropped `luca run`
        command in user-visible strings. Small focused patch.
    None of these regress the v13 baseline. The restructure achieves
    its primary goal (artifacts compiled from TS via the D-2
    compiler, with D1 guidance / telemetry / pipeline invocations
    restored, replacing the v13 hand-rewritten markdown). Phase H
    (destructive removal of `luca-mastracode/` + `luca-framework/`
    husk + Cursor/Pi support + root `package.json` script cleanup) is
    structurally safe to proceed.
  - **Phase G complete — driver halts at the G→H boundary.**
- **Phase H** — DESTRUCTIVE legacy removal — not started (user-only).

Each Phase B subsystem is ported test-first (TDD), gated on `tsc` + `bun test`,
and committed individually (`feat(restructure): Phase B — …`).
