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
- **Phases F–H** — not started.

Each Phase B subsystem is ported test-first (TDD), gated on `tsc` + `bun test`,
and committed individually (`feat(restructure): Phase B — …`).
