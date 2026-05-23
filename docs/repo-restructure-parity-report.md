# Phase G — Parity Audit Report

> Produced 2026-05-23 by the restructure driver, increment **G-1**, against
> branch `refactor/repo-restructure` at commit `ac23ec09d`.
> Inputs: `docs/repo-restructure-plan.md` (§3 functional gaps, §5 port
> disposition, §10 progress), `docs/repo-restructure-dropped-actions-audit.md`
> (F1–F5), the four active package source trees, the compiled artifact
> manifest, and the packed umbrella tarball.

## 1. Executive verdict

**READY WITH CAVEATS.** Every §5 port disposition row has landed; every §3
functional gap (1–8) is structurally closed; the TS → Claude-Code compiler
emits the full 76-file artifact set (18 agents + 17 commands + 40 skills +
6 hooks + 1 settings.json) with the D1 restoration preludes
(Guidance / Pipeline Invocations / Telemetry) visible in the rendered
output; tsc is green on all four new packages; the umbrella builds and
packs to a 245 kB, 122-file tarball that resolves `catalog:` /
`workspace:*` references correctly; telemetry round-trips end-to-end; and
the postmortem → MuninnDB `default`-vault learning loop is wired through
`luca retro` → `analyzeRun()` → pitfall payloads with the correct vault
target. Phase H — user-only legacy deletion of `luca-mastracode/` and
`luca-framework/` — can proceed.

The four caveats below are **known, recorded, and non-blocking for Phase
H**, but require a follow-up milestone (call it v14) to fully close. They
do not regress the v13 baseline:

1. **F1 — `luca confidence log` schema not realigned.** The writer still
   accepts `{score, stage, rationale}` instead of the canonical
   `ConfidenceEntrySchema`. Breaking change; needs caller updates across
   skills/agents. (D2 design decision recorded; implementation deferred.)
2. **F3 — `luca state advance` emits no ledger events.** No
   `phase-empty-justification` or `re-enter-pipeline` events on advance.
   Needs a design call on which transitions emit which events.
3. **Hook handler distribution.** The bundled `settings.json` in the
   published tarball references
   `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts` for the four new Phase E
   hooks (pipeline-guard, read-only-enforcement, continuation-messages,
   context-refresher), but the handler `.ts` files are NOT shipped to
   `dist/claude/` and the per-project `luca init writeProjectSkeleton` does
   not copy them. As shipped today, only the legacy global `luca hook
   stage-gate` registration is wired — the 6 new hooks would have a
   settings.json entry pointing at nonexistent files.
4. **Residual `.planning/` writes in `vault-init`.** `vault-init.ts` /
   `vault-setup.ts` still write `.planning/config.json`, create
   `.planning/` directories, and reference the dropped `luca run` command
   in user-facing messages. The Phase B/C narrative says vault config lives
   in `.luca/config.json`; this is a small but live regression in the
   surface a fresh user would hit on `luca init`.

None of (1)–(4) re-introduces the v13 regression set §3 was written to
close. The restructure achieves its primary goal: artifacts are once
again **compiled from TS** via the D-2 compiler, with D1 guidance /
telemetry / pipeline invocations restored, instead of being hand-rewritten
markdown. Phase H is safe to proceed.

## 2. Restructure scoreboard

### §3 functional gaps (audit-level)

| # | Gap                                          | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                |
|---|----------------------------------------------|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Telemetry writer                             | ✅ closed   | `packages/luca-core/src/telemetry/telemetry.ts` (logic) + `packages/luca-cli/src/commands/telemetry.ts` (`luca telemetry emit`/`new-run` surfaces). Round-trip verified at `/tmp/luca-parity-test.0Esf` — emit → `.luca/telemetry/<runId>.jsonl` with the expected JSONL shape. Subagent prelude (`executor.md` Telemetry section) names `wave-start`/`wave-end` hooks. |
| 2 | Vertical-slice planning guidance             | ✅ closed   | D1 `verticalSlice` flag on `executor` + `execute` + `architect` definitions in `packages/luca-tools/src/artifacts/{subagents,modes}/`. Renders as **"Vertical-slice planning"** bullet under `## Guidance` in `executor.md` (verified at `/tmp/parity-audit-out/.claude/agents/executor.md`).                                                                            |
| 3 | TDD guidance                                 | ✅ closed   | D1 `tdd` flag on `executor` + `execute` + `build` definitions. Renders as **"Test-driven development"** bullet under `## Guidance`. Note: caveat — repo has no-tests rule in force today; the discipline is restored in prompts and will activate when tests are re-introduced.                                                                                          |
| 4 | Postmortem analyzer                          | ✅ closed   | `packages/luca-core/src/analysis/postmortem.ts` is a full analyzer (7 violation types, pitfall routing to `default` vault — lines 22, 85–91, 377–380). `packages/luca-cli/src/commands/retro.ts` wires `analyzeRun` + `renderPostmortemMarkdown` + `listRuns` — a real generator, not a hollow reader. `learner` + `finalize` agents carry `postmortem-generate` invocation. |
| 5 | Repo-local rule engine                       | ✅ closed   | `packages/luca-core/src/rule-engine/` (define-rule, runner, recurrence). CLI: `luca rules list/run/gate/suggest` at `packages/luca-cli/src/commands/rules.ts`. `executor` + `verifier` subagents carry `rule-run` pipeline invocation prelude.                                                                                                                            |
| 6 | Recurrence-driven rule promotion             | ✅ closed   | `packages/luca-core/src/rule-engine/recurrence.ts` — pitfalls seen ≥3× → draft rule. Surfaced via `luca rules suggest`.                                                                                                                                                                                                                                              |
| 7 | Claim verifier                               | ✅ closed   | `packages/luca-core/src/claim-verifier/claim-verifier.ts` + CLI `luca claim-verify`. `verifier` + `finalize` agents carry `claim-verify` pipeline invocation.                                                                                                                                                                                                            |
| 8 | Phase-diff empty-phase guard                 | 🟡 partial  | `packages/luca-core/src/analysis/phase-diff.ts` (analyzer, ported). **But** the writer side (`luca state advance` emitting `phase-empty-justification` events that postmortem looks for) is missing — see F3 / caveat 2 below. Reader half complete; writer half open.                                                                                                  |

### §5 port disposition (functionality inventory)

| Disposition                                       | Item                                       | Status        | Evidence / Notes                                                                                                                                                                                                                       |
|---------------------------------------------------|--------------------------------------------|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Port as artifact definitions → `luca-tools`**   | 9 subagents (minus orphans planner+fix → 8) | ✅ closed     | 8 subagents in `packages/luca-tools/src/artifacts/subagents/` (researcher, discussion, plan-reviewer, executor, verifier, reviewer, learner, shadow-scanner). `planner` + `fix` dropped per plan §5.6 (D-3 commit `79893461c`). |
|                                                   | 10 mode instruction bodies                  | ✅ closed     | All 10 mode-agents in `packages/luca-tools/src/artifacts/modes/`: triage, research, architect, execute, review, finalize, discuss, build, plan, fast (D-3).                                                                              |
|                                                   | shared-prefix · agent-constraints · memory-tier | ✅ closed | `packages/luca-tools/src/artifacts/shared/` (3 files, D-3).                                                                                                                                                                              |
|                                                   | TS → Claude-Code compiler                  | ✅ closed     | `packages/luca-tools/src/compile/` with `compile(artifacts, outputRoot)`, six per-kind emitters, hook merge, D1 prelude rendering (`render-body.ts`). Idempotent across runs (verified — `diff -r` exit 0).                                  |
| **Port as logic → `luca-core` (.planning→.luca)** | rule-engine                                 | ✅ closed     | `packages/luca-core/src/rule-engine/` (define-rule.ts, runner.ts, recurrence.ts) — all .luca/-anchored.                                                                                                                                  |
|                                                   | postmortem                                  | ✅ closed     | `packages/luca-core/src/analysis/postmortem.ts`, pitfalls route to `default` vault.                                                                                                                                                       |
|                                                   | phase-diff                                  | ✅ closed     | `packages/luca-core/src/analysis/phase-diff.ts`.                                                                                                                                                                                          |
|                                                   | review-analysis                             | ✅ closed     | `packages/luca-core/src/review-analysis/` (relocated from luca-framework helpers).                                                                                                                                                      |
|                                                   | telemetry                                   | ✅ closed     | `packages/luca-core/src/telemetry/telemetry.ts`. Round-trip verified.                                                                                                                                                                    |
|                                                   | session-ledger                              | ✅ closed     | `packages/luca-core/src/ledger/ledger.ts`.                                                                                                                                                                                                |
|                                                   | verification-result                         | ✅ closed     | `packages/luca-core/src/verification/verification-result.ts`.                                                                                                                                                                            |
|                                                   | confidence-journal                          | 🟡 partial    | Logic ported (`packages/luca-core/src/confidence/`). Writer-side CLI surface (`luca confidence log`) still on v13 shape — see F1 / caveat 1.                                                                                            |
|                                                   | claim-verifier                              | ✅ closed     | `packages/luca-core/src/claim-verifier/claim-verifier.ts`.                                                                                                                                                                                |
|                                                   | check parsers + runner + convergence        | ✅ closed     | `packages/luca-core/src/checks/`.                                                                                                                                                                                                          |
|                                                   | classify-complexity                         | ✅ closed     | `packages/luca-core/src/complexity/helpers/classify-complexity.ts`.                                                                                                                                                                       |
|                                                   | project-preferences                         | ✅ closed     | `packages/luca-core/src/preferences/preferences.ts`.                                                                                                                                                                                      |
|                                                   | vault resolution                            | ✅ closed     | `packages/luca-core/src/vault/`.                                                                                                                                                                                                          |
| **Re-implement for Claude Code (hooks)**          | pipeline-guard                              | ✅ closed     | Algorithm: `packages/luca-core/src/orchestration/pipeline-guard.ts`. Hook def + handler in `packages/luca-tools/src/hooks/pipeline-guard/`. Settings.json entry verified. **Distribution gap — see caveat 3.**                       |
|                                                   | read-only-enforcement                       | ✅ closed     | Algorithm + 3 sibling hook slices (Write / Edit / NotebookEdit). **Distribution gap — see caveat 3.**                                                                                                                                  |
|                                                   | continuation-messages                       | ✅ closed     | PostToolUse[Bash] hook, kick-off prompt via `additionalContext`. **Distribution gap — see caveat 3.**                                                                                                                                  |
|                                                   | context-refresher                           | ✅ closed     | PostToolUse[*] hook with sidecar-file cooldown state at `.claude/cache/`. **Distribution gap — see caveat 3.**                                                                                                                          |
| **Drop — dies with mastracode**                   | launch.ts, install-bundled-assets, mastracode-config, upstream-patches, index.ts boot, tool-manifest, create-scoped-tool | ✅ dropped | Not present in active packages; `grep -r 'from.*luca-mastracode'` returns ZERO actual import statements. Only docstring breadcrumbs ("Ported from luca-mastracode `state/...`") remain. |
| **Drop — dead on arrival**                        | state/todos.ts, .planning/ whitelists, model-routing dup | ✅ dropped    | `luca-core` uses MuninnDB for todos; `LUCA_DIR_CONTRACT` for paths; single `MODEL_ROUTING_TABLE`.                                                                                                                                       |
| **Drop — orphaned**                               | planner subagent, fix subagent              | ✅ dropped    | Per D-3 (plan §5.6).                                                                                                                                                                                                                       |
| **Skills + commands surface (E-5/E-6 additions)** | 40 skills, 17 commands                      | ✅ closed     | `packages/luca-tools/src/artifacts/skills/<name>/index.ts` (40 entries), `packages/luca-tools/src/artifacts/commands/<name>.ts` (17 entries). Manifest barrel: `ARTIFACTS = [...SUBAGENTS, ...MODES, ...HOOKS, ...SKILLS, ...COMMANDS]`. |

## 3. Manifest verification

`bun run --filter @alecsibilia/luca-tools compile:artifacts -- --out /tmp/parity-audit-out`
produced **76 files** under the output tree:

| Bucket           | Expected | Actual | Verdict |
|------------------|----------|--------|---------|
| Agents (total)   | 18       | 18     | ✅      |
| — mode-agents    | 10       | 10     | ✅      |
| — subagents      | 8        | 8      | ✅      |
| Commands         | 17       | 17     | ✅      |
| Skills           | 40       | 40     | ✅      |
| Hooks (slices)   | 6        | 6      | ✅      |
| — PreToolUse     | 4        | 4      | ✅      |
| — PostToolUse    | 2        | 2      | ✅      |
| Rules            | 0        | 0      | ✅ (pass-through bookkeeping per D-2 design — rules live as `.luca/rules/<id>.ts`) |

**Idempotence:** two consecutive compile runs produced byte-identical
output (`diff -r /tmp/parity-audit-out /tmp/parity-audit-out2` → exit 0).

**Hook slice breakdown (verified from compiled settings.json):**
- PreToolUse[Bash] → pipeline-guard
- PreToolUse[Write] → read-only-enforcement
- PreToolUse[Edit] → read-only-enforcement
- PreToolUse[NotebookEdit] → read-only-enforcement
- PostToolUse[Bash] → continuation-messages
- PostToolUse[*] → context-refresher

**Spot-checks of D1 restoration in compiled artifacts:**

- `executor.md` — `## Guidance` carries "Vertical-slice planning",
  "Test-driven development", "Self-verification" bullets;
  `## Pipeline Invocations` carries "Pre-invoke MuninnDB recall", "Run
  repo-local rule packs", "Log confidence on the decision";
  `## Telemetry` carries `wave-start` / `wave-end` hook descriptions.
- `reviewer.md` — `## Guidance` carries "Self-verification" + "Anti-sycophancy";
  `## Telemetry` carries `subagent-end`.
- `learner.md` — `## Pipeline Invocations` carries "Generate a postmortem"
  (routing to `default` MuninnDB vault).
- `finalize.md` — `## Pipeline Invocations` carries rule-run, claim-verify,
  postmortem-generate, MuninnDB recall.

D1 restoration confirmed: the factory flags expand into deterministic
prose preludes appended after the body, exactly as the D-2 design promised.

## 4. Build + tsc parity

**tsc:** green on all four active packages, run independently with the
explicit project-flag form (`bunx --bun tsc -p packages/<pkg>/tsconfig.json`):

| Package       | Result   |
|---------------|----------|
| luca-tools    | ✅ green |
| luca-core     | ✅ green |
| luca-cli      | ✅ green |
| luca          | ✅ green |

**Umbrella build** (`bun run --filter @alecsibilia/luca build`):

- `dist/index.mjs` — 2.74 kB (re-export shim for `runMain`/`runInit`/
  `LUCA_VERSION`/`ProjectContext`).
- `dist/chunks/` + `dist/shared/` — inlined cli + core + tools — ~265 kB
  total dist size.
- `dist/claude/` — populated by the `build:done` hook with
  agents:10, subagents:8, commands:17, skills:40, hooks:6, rules:0.

**Tarball** (`bun pm pack`):

- Filename: `alecsibilia-luca-13.0.0-alpha.0.tgz`
- 122 files, 245.27 kB packed, 0.86 MB unpacked.
- Contents: `bin/luca.js` (executable bit preserved), `dist/{index.mjs,
  index.d.{ts,mts}, chunks/, shared/, claude/}`, `package.json`,
  `README.md`, `LICENSE`.
- `catalog:` refs resolved → `^4.3.6` (zod). `workspace:*` refs resolved
  → `0.1.0` (cli/core/tools), kept in `devDependencies` only — NOT in
  runtime `dependencies`.
- `PUBLISHING.md` correctly excluded from the tarball.
- Confirmed: no `src/`, no `node_modules/`, no `tsconfig.json`,
  no `build.config.ts`.

## 5. Telemetry end-to-end

Round-trip executed in a fresh project at `/tmp/luca-parity-test.0Esf`:

1. Created `.luca/state.json` (minimal scaffold).
2. `bun packages/luca/bin/luca.js telemetry new-run` →
   `runId=run_mpinn5z1_lsupgfkz`.
3. `bun packages/luca/bin/luca.js telemetry emit --kind=test.parity-audit
   --run-id=run_mpinn5z1_lsupgfkz --meta='{"check":"telemetry"}'`
   → exit 0, success message
   `[luca] ✔ telemetry: test.parity-audit emitted for run …`.
4. `.luca/telemetry/run_mpinn5z1_lsupgfkz.jsonl` created with one record:

```json
{"v":1,"ts":"2026-05-23T18:01:11.726Z","runId":"run_mpinn5z1_lsupgfkz","kind":"test.parity-audit","phase":null,"slug":null,"wave":null,"complexity":null,"oversight":null,"durationMs":null,"meta":{"check":"telemetry"}}
```

Schema fields present: `v`, `ts`, `runId`, `kind`, all optional context
slots (phase / slug / wave / complexity / oversight / durationMs), `meta`.
Verdict: ✅ telemetry writer ships, emits, and produces the schema the
luca-telemetry-report reader skill expects.

**One small UX issue worth noting:** the CLI requires `--run-id` (matches
the schema-first design) but the bare invocation hint in the original
G-1 brief omits it. The CLI's help text spells it out correctly; this is
a documentation-only nit, not a regression.

## 6. Learning loop end-to-end (structural verification)

Wiring confirmed without runtime exercise:

1. **`luca retro` CLI surface** exists at
   `packages/luca-cli/src/commands/retro.ts`. Default invocation
   analyzes the most recent run in `.luca/ledger.jsonl`; flags
   `--run <id>`, `--list`, `--json` cover the surface.
2. **CLI delegates to `analyzeRun()`** imported from
   `@alecsibilia/luca-core` (line 19, 86). Markdown rendering via
   `renderPostmortemMarkdown` (line 92).
3. **`analyzeRun()` routes pitfalls to the `default` MuninnDB vault.**
   Confirmed in `packages/luca-core/src/analysis/postmortem.ts`:
   - line 22 docstring: "Pitfalls are always routed to the canonical `default` vault".
   - line 85–91: comment + code.
   - line 377–380: `// ── Pitfall payloads (canonical default vault) ──` followed by `vault: 'default' as const`.
4. **Subagent / mode prompts invoke postmortem at the right pipeline
   points.** `grep -l "postmortem\|luca retro" /tmp/parity-audit-out/.claude/agents/*.md`
   returns `finalize.md`, `execute.md`, `learner.md` — three callsites,
   matching the plan: learner (extracts learnings each phase), finalize
   (milestone-close retro), execute (phase-close hand-off into learner).
5. **`finalize.md` Pipeline Invocations** includes "Generate a postmortem"
   with explicit "pitfalls route to the `default` MuninnDB vault so they
   cross-pollinate to future projects" — D1 restoration loud and clear.

Verdict: ✅ learning loop is structurally complete. Runtime exercise
(actually running a postmortem and writing pitfalls to MuninnDB) is left
to future workflow runs.

## 7. F1–F5 audit-followup table

| #  | Finding                                                  | Status                | Evidence                                                                                                                                                                                                                                                                                                                                          |
|----|----------------------------------------------------------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| F1 | Realign `luca confidence log` to `ConfidenceEntrySchema` | 🔴 **NOT CLOSED**     | `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts` lines 14–31 still accept `{score, stage, rationale}` (v13 shape) instead of the canonical `{phase, wave, task, confidence (high|medium|low), category, decision, alternatives, reasoning, risk, files, reviewHint?}`. D2 design recorded; implementation deferred to v14. |
| F2 | Wire trivial missing reads (confidence + verification)   | ✅ closed (Phase C)   | `luca confidence read|summary|render` at `packages/luca-cli/src/commands/write-surface/confidence.ts` lines 98/118/142. `luca verification read|aggregate` at `packages/luca-cli/src/commands/write-surface/verification.ts` lines 45/75.                                                                                              |
| F3 | `luca state advance` side-effect ledger emissions        | 🔴 **NOT CLOSED**     | `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` has ZERO `appendLedger` or ledger-emission calls. `grep -n "appendLedger\|ledger\|phase-empty\|re-enter"` returns no matches. Postmortem reader explicitly handles `phase-empty-justification` (writer side is what's missing). Design call needed in v14. |
| F4 | Decide `luca branch` scope                               | ✅ closed (D3)        | `packages/luca-cli/src/commands/write-surface/branch.ts` exposes only `guard` (1 subcommand). v13 simplification documented — skills run `git checkout -b` / `git branch -m` directly. status / create / rename / consult / resolve / apply: DROPPED.                                                                                          |
| F5 | Decide `luca repo` scope                                 | ✅ closed (D3)        | `packages/luca-cli/src/commands/write-surface/repo.ts` exposes only `cleanup-apply` (1 subcommand). v13 simplification documented — skills invoke shadow-scanner directly. scan / parse-report / summary / cleanup-artifacts / archive-loose: DROPPED.                                                                                       |

**Net F1–F5:** F2/F4/F5 closed. F1 + F3 carry into v14 as **non-blocking
caveats for Phase H** (they don't gate destructive cleanup — the v13
behavior is preserved as-is and the deficient surfaces simply weren't
realigned in this restructure).

## 8. Phase H readiness checklist

What can the user safely do once they enter Phase H?

| Action                                                              | Safe?  | Evidence                                                                                                                                                                                                                                                                                                                       |
|---------------------------------------------------------------------|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Delete `packages/luca-mastracode/`                                  | ✅ yes | `grep -rE "^import .* from ['\"]@alecsibilia/luca-mastracode\|^import .* from ['\"].*luca-mastracode['\"]"` across the four active packages returns ZERO. Only docstring breadcrumbs remain ("Ported from luca-mastracode `state/...`") — those are textual references in `.ts` comments, not imports, and survive removal harmlessly. |
| Delete `packages/luca-framework/` (the husk)                        | ✅ yes | Husk content: `bin/luca.js`, empty `src/`, `dist/`, `build.config.ts`, `scripts/`, `eslint.config.mjs`, `README.md`, `CHANGELOG.md`, `node_modules/`, `package.json` (still on `@alecsibilia/luca-framework@12.0.0-alpha.16`). 248 tracked files. No active package imports anything from it.                                  |
| Remove root-`package.json` references to legacy packages            | ⚠ yes (mechanical edit) | Three scripts in repo-root `package.json` still reference the legacy packages: `build`, `mastracode`, `publish:framework`, `release:local`. Edit these out as part of Phase H — they'll fail loudly post-deletion otherwise.                                                                                                  |
| Delete residual `.planning/` references in active source            | ⚠ partial | Most refs are comments/docstrings — harmless. **Live regressions:** `packages/luca-cli/src/commands/vault-init.ts` writes `.planning/config.json` (8 refs); `packages/luca-cli/src/utils/vault-setup.ts` mentions `.planning/config.json` in JSDoc (3 refs); both files reference dropped `luca run` command in user-visible strings. See caveat 4.       |
| Remove Cursor / Pi support                                          | ✅ yes | All `.cursor/` (37 files) and `.pi/` (15 files) tracked files are under `packages/luca-framework/` — deleted as part of the husk removal. None outside `.legacy-planning-archive/` or the husk.                                                                                                                                |
| Preserve `.legacy-planning-archive/`                                | ✅ yes | Directory exists at repo root with all slim-down spec subdirs intact: `planning/`, `migration/`, `milestones/`, `notes/`, `plans/`, `research/`, `summaries/`, `codebase/`, `done/`. Plan §9 explicitly requires preservation.                                                                                                  |
| Update docs to point at new package surface                         | ⚠ todo (Phase H) | `docs/repo-restructure-plan.md` is the migration log itself; root `README.md`, `AGENTS.md`, and `CLAUDE.md` may carry stale `@alecsibilia/luca-framework` install instructions — sweep during Phase H.                                                                                                                          |

**Phase H is structurally safe.** The two `⚠` rows are mechanical
follow-ups, not architectural blockers — they're "remember to edit the
package.json scripts and the vault-init copy" Phase-H housekeeping
items, not regressions that would make the deletion unsafe.

## 9. Open questions / blockers

Nothing blocks Phase H. The three open items are recorded follow-ups:

1. **F1 + F3** are v14-scope. They were known going into G; they remain
   known going out of G. The restructure was never going to close them
   per D2 (writer alignment, breaking) and the F3 design call.
2. **Hook handler distribution** (caveat 3) is a F-2 follow-up logged in
   §10 of the plan. The bundled settings.json has 6 hook entries but
   no project skeleton step copies their handlers — meaning a fresh
   `luca init` produces a tree where 6 of 7 registered hooks point at
   nonexistent scripts. **This makes the published `@alecsibilia/luca`
   technically broken for the new orchestration hooks**, but does NOT
   regress anything user-facing today (the legacy stage-gate hook still
   wires globally; the new hooks just silently fail-open per their
   design). The fix is well-scoped: extend `writeProjectSkeleton` to
   `cp <package>/dist/claude/.claude/hooks/*.ts <project>/.claude/hooks/`
   and merge the bundled settings.json into the per-project
   `.claude/settings.json`.
3. **`vault-init.ts` `.planning/` writes** (caveat 4) — a small, focused
   patch. Replace `.planning/config.json` with `.luca/config.json`,
   replace `luca run` references with current-CLI guidance. Half-day's
   work.

## 10. Recommendations for future milestones

Forward-looking notes, in priority order:

1. **v14 task 1 — Close F1 (`luca confidence log` schema).** Realign the
   writer to `ConfidenceEntrySchema`. Update the (small number of)
   skills/agents that construct confidence-log payloads. Breaking
   change; bump major.
2. **v14 task 2 — Close F3 (ledger emission from `luca state advance`).**
   Design call needed: which transitions emit which events? At minimum
   `phase-empty-justification` (postmortem expects it) and
   `re-enter-pipeline` (legal-transition table coverage). Consider
   whether `state advance` is the right writer or if a `state ledger`
   subcommand is cleaner separation of concerns.
3. **v14 task 3 — Close the hook handler distribution gap.** Wire the
   compiled `dist/claude/.claude/hooks/<name>.ts` into the consumer
   project's `.claude/hooks/` directory via `writeProjectSkeleton`, and
   merge the bundled `settings.json` into the per-project file. Without
   this, the new Phase E orchestration hooks are dead on arrival in any
   project the user `luca init`s.
4. **v14 task 4 — Sweep `.planning/` residue.** Migrate `vault-init.ts`
   to write `.luca/config.json`, update user-facing messages, drop
   `luca run` references in `init.ts` / `vault-init.ts`. Small focused
   patch.
5. **v14 task 5 — Documentation pass.** Update `README.md`, `AGENTS.md`,
   `CLAUDE.md` to reflect the four-package model. Add a quickstart that
   reflects the `@alecsibilia/luca@13.0.0-alpha.0` install path.
6. **Future — Orchestrator design.** `docs/orchestrator-design.md` is
   queued for a separate milestone (out of restructure scope, per the
   driver brief). Treat as a v15+ planning artifact.
7. **Future — Workflow slim-down.** Plan §9 defers the
   `.legacy-planning-archive/` pipeline redesign (~11 specs) to
   "post-migration, data-driven". Now that the migrated pipeline is
   live, this can be revisited with telemetry data from real runs.
8. **Future — Tests.** No-tests rule is in force (per CLAUDE.md). A
   deliberate testing reintroduction milestone, when it lands, should
   start with the four pure-data subsystems in `luca-core`
   (rule-engine, postmortem, telemetry, claim-verifier) since those
   are highest-leverage and hardest to validate by manual inspection.

---

**Audit complete.** Driver halts at the G→H boundary. User reviews this
report, runs Phase H deletions manually when ready, and addresses the
four caveats in a follow-up v14 milestone.
