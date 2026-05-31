# Parity review #1 — Inventory completeness

> Lens: every `packages/luca-mastracode/src/**/*.{ts,md}` file must have a
> documented disposition (PORTED / SUPERSEDED / DROPPED / **ORPHANED**)
> before Phase H deletes the package. Read-only audit, no code changes.

## 1. Executive verdict

**`luca-mastracode/src/` ships 141 files.** Net classification after a
file-by-file cross-reference against §5.5 of `docs/repo-restructure-plan.md`,
`docs/repo-restructure-dropped-actions-audit.md`, and `docs/repo-restructure-parity-report.md`:

| Disposition | Count |
|---|---|
| PORTED       | 51  |
| SUPERSEDED   | 53  |
| DROPPED      | 36  |
| **ORPHANED** | **1 functional + 1 prose-only drift** |

**Phase H verdict: CLEAR — with one carry-forward and one corrective patch
that should land before or alongside Phase H deletion.**

The single live functional orphan is `util/plan-checkboxes.ts` — the
PLAN.md checkbox auto-ticking module that mastracode wired into
`workflow-state.complete-phase`. The dropped-actions audit's verdict
"`complete-phase` is SUPERSEDED by `luca state advance`" is true for the
state-machine transition, but `luca state advance` does **not** call
`tickPhaseTasks()`, so the PLAN.md auto-tick side effect is silently lost.
This is a behavioural regression but a narrow one — the checkbox sync was
"advisory" (per the source-file docstring) and never blocking. **Severity:
CARRY-FORWARD to v14**; not a Phase H blocker.

The prose-only drift is significant by surface area but does not block
Phase H: 6 of 10 ported mode-agent prompts in `luca-tools/src/artifacts/
modes/` reference **CLI commands that do not exist** in `luca-cli` —
`luca state complete-phase`, `luca state start-phase`,
`luca state switch-mode --target …`, `luca state advance-wave`,
`luca state record-iteration`, `luca state save-plan-artifacts`,
`luca state re-enter`, `luca state archive-loose`,
`luca state reset-pipeline`, `luca state set`, `luca state lock release`.
The dropped-actions audit classified each of these as SUPERSEDED by
`luca state advance`, but the agent prose was never retargeted from the
mastracode action names to the surviving v13 surface. The prompts will
shell out to non-existent commands and fail loud at runtime. **Severity:
CARRY-FORWARD to v14** — the v13 baseline behaviour is preserved (the
agents fall back to the human via the failure), but the migration's
"port-as-TS-source" promise was not honoured here.

Two smaller findings (both BENIGN):

- `util/numeric.ts` (`finiteOrNull`, `clampTokens`) is not re-exported by
  any luca-core/cli/tools module. The mastracode caller (`tools/workflow-
  state.ts` telemetry write paths) is dropped along with the harness, so
  the helper has no remaining consumer. SUPERSEDED by the Zod schemas in
  `luca-core/src/telemetry/schemas.ts` doing input-boundary validation.
- `util/sanitize.ts` exports three sibling helpers; only `sanitizeForLog`
  was ported (to `luca-core/src/telemetry/helpers/sanitize-for-log.ts`).
  `sanitizeForStorage` and `displayBounded` have no remaining caller —
  the schemas they backed are now Zod-enforced. SUPERSEDED.

The Phase G parity report's verdict ("READY WITH CAVEATS") corroborates;
this second-opinion review confirms the file inventory is complete with
the one orphan called out above.

## 2. Method

1. Enumerated all 141 files in `packages/luca-mastracode/src/` (`find` +
   `sort`). Captured line counts for triage.
2. Grouped by mastracode subdirectory (12 logical clusters).
3. For each file, checked four sources of truth in order:
   - Plan §5.5 Migration disposition (the contract).
   - `docs/repo-restructure-dropped-actions-audit.md` (the per-action
     audit produced in Phase C).
   - `docs/repo-restructure-parity-report.md` (the Phase G/G-1 audit).
   - The actual landing site in `packages/luca-{core,cli,tools,umbrella}/
     src/`, by `grep`/`find` for the relevant symbol or filename.
4. For each file with no clear port destination and no §5.5 drop
   rationale, ran `grep` for the exported symbols across all four
   active packages to confirm orphan status before classifying.
5. For prose-drift detection, grep'd the compiled-artifact source
   (`packages/luca-tools/src/artifacts/`) for references to dropped
   mastracode CLI/tool surfaces and cross-checked against the actual
   `luca-cli` command tree.

No code was modified. No package was built. The audit is read-only.

## 3. Inventory table

Grouped by mastracode subdirectory.

### 3.1 `__tests__/` (29 files)

Per the no-tests rule (`/Users/alecsibilia/.claude/projects/-Users-
alecsibilia-Github-luca-framework/memory/MEMORY.md`), tests were
intentionally removed across the working tree as part of an earlier
unblock-development decision. Tests in mastracode-only territory are
therefore not expected to migrate.

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `aggregator-skill-presence.test.ts` | — | DROPPED | no-tests rule. |
| `branch-template.test.ts` | — | DROPPED | no-tests rule (also: subject module is SUPERSEDED — see §3.10). |
| `correlationid-format-prose.test.ts` | — | DROPPED | no-tests rule. |
| `dual-layer-schema-drift.test.ts` | — | DROPPED | no-tests rule. |
| `ensure-feature-branch-actions.test.ts` | — | DROPPED | no-tests rule + subject tool DROPPED (§3.7). |
| `ensure-feature-branch.test.ts` | — | DROPPED | same as above. |
| `fixtures/preferences-eng-pt.ts` | — | DROPPED | no-tests rule. |
| `fixtures/preferences-luca-framework.ts` | — | DROPPED | no-tests rule. |
| `install-bundled-assets.test.ts` | — | DROPPED | no-tests rule + subject DROPPED (§3.11). |
| `luca-store.test.ts` | — | DROPPED | no-tests rule + subject SUPERSEDED (§3.6). |
| `memory-audit.test.ts` | — | DROPPED | no-tests rule. |
| `memory-tier-callsite.test.ts` | — | DROPPED | no-tests rule. |
| `memory-tier-prefix.test.ts` | — | DROPPED | no-tests rule. |
| `memory-tier-verified-followup.test.ts` | — | DROPPED | no-tests rule. |
| `no-luca-leak.test.ts` | — | DROPPED | no-tests rule. |
| `pipeline-guard.test.ts` | — | DROPPED | no-tests rule (subject PORTED to luca-core orchestration — §3.5). |
| `postmortem-vault-comment.test.ts` | — | DROPPED | no-tests rule (subject PORTED to luca-core analysis — §3.4). |
| `preferences-mode-coverage.test.ts` | — | DROPPED | no-tests rule. |
| `project-preferences.test.ts` | — | DROPPED | no-tests rule (subject PORTED — §3.6). |
| `recall-prose.test.ts` | — | DROPPED | no-tests rule. |
| `repo-cleanup-placeholder.test.ts` | — | DROPPED | no-tests rule (subject SUPERSEDED — §3.7). |
| `shared-prefix-semantics.test.ts` | — | DROPPED | no-tests rule. |
| `spawn-site-invariant.test.ts` | — | DROPPED | no-tests rule. |
| `stale-filter.test.ts` | — | DROPPED | no-tests rule (subject PORTED — §3.4). |
| `subagent-telemetry-prose.test.ts` | — | DROPPED | no-tests rule. |
| `telemetry.test.ts` | — | DROPPED | no-tests rule (subject PORTED — §3.6). |
| `todos.test.ts` | — | DROPPED | no-tests rule (subject DROPPED — §3.6). |
| `upstream-patches.test.ts` | — | DROPPED | no-tests rule (subject DROPPED — §3.5). |
| `workflow-state-actions.test.ts` | — | DROPPED | no-tests rule (subject SUPERSEDED — §3.7). |

### 3.2 `subagents/` (10 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `discussion.ts` | 102 | PORTED | `packages/luca-tools/src/artifacts/subagents/discussion.ts` (D-3). |
| `executor.ts` | 91 | PORTED | `packages/luca-tools/src/artifacts/subagents/executor.ts` (D-3, D1 restored: verticalSlice + tdd + selfVerify). |
| `learner.ts` | 98 | PORTED | `packages/luca-tools/src/artifacts/subagents/learner.ts` (D-3, postmortem-generate invocation). |
| `plan-reviewer.ts` | 84 | PORTED | `packages/luca-tools/src/artifacts/subagents/plan-reviewer.ts` (D-3). |
| `planner.ts` | 64 | DROPPED — orphaned | Plan §5.6: "registered, never invoked — architect mode plans inline." Parity report row "Drop — orphaned." Confirmed: no `planner` entry in `luca-tools/src/artifacts/subagents/`. |
| `researcher.ts` | 38 | PORTED | `packages/luca-tools/src/artifacts/subagents/researcher.ts` (D-3). |
| `reviewer.ts` | 116 | PORTED | `packages/luca-tools/src/artifacts/subagents/reviewer.ts` (D-3, antiSycophancy). |
| `shadow-scanner.ts` | 245 | PORTED | `packages/luca-tools/src/artifacts/subagents/shadow-scanner.ts` (D-3, retargeted to `LUCA_DIR_CONTRACT`). |
| `shared-prefix.ts` | 40 | PORTED | `packages/luca-tools/src/artifacts/shared/shared-prefix.ts` (D-3). |
| `verifier.ts` | 81 | PORTED | `packages/luca-tools/src/artifacts/subagents/verifier.ts` (D-3, claim-verify + rule-run invocations). |

### 3.3 `modes/` + `instructions/` (10 + 10 = 20 files)

Each mode loader pairs with a markdown instruction body. The new model
combines both into a single `defineAgent` TS file in `luca-tools/src/
artifacts/modes/`.

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `modes/architect.ts` + `instructions/architect.md` | 80 + (md) | PORTED | `luca-tools/src/artifacts/modes/architect.ts` — explicit docstring credit, verticalSlice flag. |
| `modes/build.ts` + `instructions/build.md` | 36 + (md) | PORTED | `luca-tools/src/artifacts/modes/build.ts` — tdd flag. |
| `modes/discuss.ts` + `instructions/discuss.md` | 39 + (md) | PORTED | `luca-tools/src/artifacts/modes/discuss.ts`. |
| `modes/execute.ts` + `instructions/execute.md` | 116 + (md) | PORTED (with **PROSE DRIFT** — see §4) | `luca-tools/src/artifacts/modes/execute.ts` — D1 restoration flags applied, but body still references dropped CLI commands. |
| `modes/fast.ts` + `instructions/fast.md` | 36 + (md) | PORTED | `luca-tools/src/artifacts/modes/fast.ts`. |
| `modes/finalize.ts` + `instructions/finalize.md` | 79 + (md) | PORTED (with **PROSE DRIFT** — see §4) | `luca-tools/src/artifacts/modes/finalize.ts`. |
| `modes/plan.ts` + `instructions/plan.md` | 38 + (md) | PORTED | `luca-tools/src/artifacts/modes/plan.ts`. |
| `modes/research.ts` + `instructions/research.md` | 77 + (md) | PORTED (minor drift) | `luca-tools/src/artifacts/modes/research.ts`. |
| `modes/review.ts` + `instructions/review.md` | 81 + (md) | PORTED (minor drift) | `luca-tools/src/artifacts/modes/review.ts`. |
| `modes/triage.ts` + `instructions/triage.md` | 100 + (md) | PORTED (minor drift) | `luca-tools/src/artifacts/modes/triage.ts`. |

### 3.4 `analysis/` + `review-analysis/` (3 + 4 = 7 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `analysis/phase-diff.ts` | 175 | PORTED | `luca-core/src/analysis/phase-diff.ts`. |
| `analysis/postmortem.ts` | 602 | PORTED | `luca-core/src/analysis/postmortem.ts` — full 7-type analyzer, pitfall routing to `default` vault confirmed in parity report §6. |
| `analysis/retro.ts` | 119 | PORTED (re-platformed) | Was a standalone CLI driver. Re-platformed wholesale into `luca-cli/src/commands/retro.ts` (citty-based, `--list`/`--run`/`--json` flags preserved). |
| `review-analysis/convergence.ts` | 275 | PORTED | `luca-core/src/review-analysis/convergence.ts`. |
| `review-analysis/index.ts` | 36 | PORTED | `luca-core/src/review-analysis/index.ts`. |
| `review-analysis/regression.ts` | 245 | PORTED | `luca-core/src/review-analysis/regression.ts`. |
| `review-analysis/stale-filter.ts` | 433 | PORTED | `luca-core/src/review-analysis/stale-filter.ts`. |

### 3.5 `orchestration/` (6 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `context-refresher.ts` | 85 | PORTED (re-implemented) | Algorithm at `luca-core/src/orchestration/context-refresher.ts`; hook at `luca-tools/src/hooks/context-refresher/`. E-4. |
| `continuation-messages.ts` | 144 | PORTED (re-implemented) | Algorithm at `luca-core/src/orchestration/continuation-messages.ts`; hook at `luca-tools/src/hooks/continuation-messages/`. E-3. |
| `pipeline-guard.ts` | 259 | PORTED (re-implemented) | Algorithm at `luca-core/src/orchestration/pipeline-guard.ts`; hook at `luca-tools/src/hooks/pipeline-guard/`. E-1. |
| `pipeline-tui.ts` | 93 | DROPPED — dies with mastracode | Mastra-TUI presentation layer (renders `<system-reminder>` boxes in pi-tui). Plan §5.5 row "Drop — dies with mastracode." No equivalent in Claude Code; Claude Code provides its own UI surface. |
| `read-only-enforcement.ts` | 199 | PORTED (re-implemented) | Algorithm at `luca-core/src/orchestration/read-only-enforcement.ts`; 3 sibling hooks (Write/Edit/NotebookEdit) at `luca-tools/src/hooks/read-only-enforcement/`. E-2. |
| `upstream-patches.ts` | 381 | DROPPED — dies with mastracode | Monkey-patches Mastra/pi-tui internals (ask_user truncation, multiline slash-command parse). Plan §5.5 row "Drop — dies with mastracode." |

### 3.6 `state/` (11 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `claim-verifier.ts` | 631 | PORTED | `luca-core/src/claim-verifier/claim-verifier.ts`. |
| `confidence-journal.ts` | 280 | PORTED (partial — F1) | `luca-core/src/confidence/confidence-journal.ts`. Writer schema realignment open as F1 (carry-forward to v14). |
| `luca-store.ts` | 362 | SUPERSEDED | Mastra harness state file (`.planning/luca-state.json`) — entirely replaced by `luca-core/src/state/` schemas + `.luca/state.json`. The mastracode file itself says "stored in `.planning/luca-state.json` because Mastra strips unknown keys" — that constraint dies with the harness. |
| `project-preferences.ts` | 276 | PORTED | `luca-core/src/preferences/preferences.ts` + `luca-core/src/preferences/schemas.ts`. |
| `session-ledger.ts` | 447 | PORTED | `luca-core/src/ledger/ledger.ts`. |
| `shadow-scanner.ts` | 195 | PORTED | `luca-core/src/shadow-scan/schemas.ts` + `luca-cli/src/write-surface/handlers/luca-repo-cleanup-apply.ts`. Whitelists retargeted to `LUCA_DIR_CONTRACT`. |
| `state.ts` | 292 | SUPERSEDED | Self-annotates "retained until mastracode retires (Phase 5)." Mastracode-only schemas (ProfileLevel, 2D budget matrix, deprecated `profile`/`workflowVersion`/`skipBranch`). Replaced by `luca-core/src/state/schemas.ts`. |
| `telemetry.ts` | 317 | PORTED | `luca-core/src/telemetry/telemetry.ts`. Round-trip verified in parity report §5. |
| `todos.ts` | 377 | DROPPED — dead on arrival | Plan §5.5 row "Drop — dead on arrival (MuninnDB now)." Todos live in MuninnDB. `luca-core/src/todos/schemas.ts` keeps only the schema for the export/import shape. |
| `vault.ts` | 53 | PORTED | `luca-core/src/vault/helpers/{resolve-project-vault,sanitize-vault-name}.ts`. |
| `verification-result.ts` | 246 | PORTED | `luca-core/src/verification/verification-result.ts`. |

### 3.7 `tools/` (24 top-level + 5 parsers = 29 files)

Mastra `createTool` instances. v13 model: deterministic logic in
`luca-core`, agent-facing surface via `luca-cli` write-surface or its
CLI command groups.

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `tools/check-convergence.ts` | 109 | PORTED | `luca-core/src/review-analysis/convergence.ts` (logic) + `luca-cli/src/write-surface/handlers/luca-pr-review-detect-convergence.ts`. |
| `tools/check-parsers.ts` | 36 | PORTED | `luca-core/src/checks/helpers/parser-registry.ts`. |
| `tools/check-runner.ts` | 193 | PORTED | `luca-core/src/checks/index.ts` runner; CLI surface at `luca-cli/src/commands/write-surface/checks.ts` (`luca checks run`). |
| `tools/checks-schemas.ts` | 22 | PORTED | `luca-core/src/checks/schemas.ts`. |
| `tools/claim-verifier.ts` | 259 | PORTED | Logic at `luca-core/src/claim-verifier/`; CLI surface at `luca-cli/src/commands/claim-verify.ts`. |
| `tools/classify-complexity.ts` | 120 | PORTED | Logic at `luca-core/src/complexity/helpers/classify-complexity.ts`; CLI surface at `luca-cli/src/commands/classify.ts`. |
| `tools/cleanup-fixes.ts` | 78 | SUPERSEDED | Bundled into `luca-cli/src/write-surface/handlers/luca-repo-cleanup-apply.ts`. |
| `tools/cleanup-report.ts` | 80 | SUPERSEDED | Subsumed by shadow-scan schemas in `luca-core/src/shadow-scan/`. The `parse-report` / `summary` / `archive-loose` actions are listed in the dropped-actions audit §7 as "MISSING (small)" — design call deferred to v14 (F5). |
| `tools/confidence-journal.ts` | 119 | PORTED (partial — F1) | Logic at `luca-core/src/confidence/`; CLI at `luca-cli/src/commands/write-surface/confidence.ts` (`read`/`summary`/`render` ported; `log` divergent — F1). |
| `tools/create-scoped-tool.ts` | 75 | DROPPED — dies with mastracode | Plan §5.5: "Drop — superseded by the stage-gate hook." The hook validates per-phase tool access at runtime instead of per-mode scoping at registration time. |
| `tools/ensure-feature-branch.ts` | 1054 | PORTED (1 of 7 actions; design-deferred for the rest) | `luca-cli/src/write-surface/handlers/luca-branch-guard.ts` ports only the `assert-not-default` action. `status`, `create`, `rename`, `consult`, `resolve`, `apply` DROPPED per F4 design call (audit §6). |
| `tools/index.ts` | 22 | DROPPED — dies with mastracode | Mastra tool barrel. |
| `tools/manage-roadmap.ts` | 213 | PORTED (3 of 4 actions) | `luca-cli/src/commands/write-surface/roadmap.ts` (`read`/`create`). `update-status` MISSING (audit §3 — likely covered by `luca state advance` side effects, needs verification); `compute-order` DROPPED — dead on arrival. |
| `tools/manage-todos.ts` | 376 | PORTED (re-platformed to MuninnDB) | Plan §5.3. `luca-cli/src/write-surface/handlers/luca-todo-{add,list,update}.ts`. |
| `tools/parsers/bun-test.ts` | 129 | PORTED | `luca-core/src/checks/helpers/parse-bun-test.ts`. |
| `tools/parsers/eslint.ts` | 81 | PORTED | `luca-core/src/checks/helpers/parse-eslint.ts`. |
| `tools/parsers/generic.ts` | 47 | PORTED | `luca-core/src/checks/helpers/parse-generic.ts`. |
| `tools/parsers/parser-registry.ts` | 20 | PORTED | `luca-core/src/checks/helpers/parser-registry.ts`. |
| `tools/parsers/tsc.ts` | 32 | PORTED | `luca-core/src/checks/helpers/parse-tsc.ts`. |
| `tools/pipeline-lock.ts` | 262 | **DROPPED** (Phase G acknowledged) | Plan §5.3: "DROPPED — no v13 handler." Dropped-actions audit §9: "not surfaced because it was never ported to luca-core in Phase B. Phase G parity will determine whether to add it." Phase G concluded with no decision recorded. `.luca/lock.json` is in `LUCA_DIR_CONTRACT` and `workflow reset` / `repair` know how to remove a stale lock, but no code acquires the lock. Severity: **CARRY-FORWARD to v14** (concurrent-run protection is a single-user nice-to-have, not a Phase H blocker). |
| `tools/pr-review.ts` | 269 | PORTED | `luca-cli/src/commands/write-surface/pr-review.ts` + `luca-cli/src/write-surface/handlers/luca-pr-review-*.ts` (3 handlers). |
| `tools/project-preferences.ts` | 292 | PORTED | `luca-cli/src/commands/write-surface/preferences.ts` + `luca-cli/src/write-surface/handlers/luca-preferences-{read,write}.ts`. |
| `tools/repo-cleanup.ts` | 622 | PORTED (1 of 6 actions; F5 design-deferred for the rest) | `luca-cli/src/write-surface/handlers/luca-repo-cleanup-apply.ts` ports only `apply-fix`. `scan`/`parse-report`/`summary`/`cleanup-artifacts`/`archive-loose` DROPPED per F5 design call. |
| `tools/run-checks.ts` | 172 | PORTED | `luca-cli/src/commands/write-surface/checks.ts`. |
| `tools/run-postmortem.ts` | 125 | PORTED | `luca-cli/src/commands/retro.ts` (the `luca retro` driver — calls `analyzeRun()`). |
| `tools/run-rules.ts` | 175 | PORTED | `luca-cli/src/commands/rules.ts` (`luca rules list`/`run`/`gate`/`suggest`). |
| `tools/session-ledger.ts` | 85 | PORTED | `luca-core/src/ledger/ledger.ts`. |
| `tools/tool-manifest.ts` | 372 | DROPPED — dies with mastracode | Plan §5.5: "superseded by the stage-gate hook." The hook at `luca-cli/src/hook/` enforces what `tool-manifest` enforced via per-mode tool scoping. |
| `tools/verification-result.ts` | 124 | PORTED (3 of 4 actions) | `luca-cli/src/commands/write-surface/verification.ts` + handler at `luca-cli/src/write-surface/handlers/luca-phase-write-verify.ts`. `read-history` DROPPED by contract (`verification-history.jsonl` has no `.luca/` home). |
| `tools/workflow-state.ts` | 1923 | PORTED (action-by-action) + **PROSE DRIFT** | The dominant mastracode tool with 18 actions. Per the dropped-actions audit §2, 11 are SUPERSEDED by `luca state advance` + native Write + `luca telemetry emit`, 2 are PORTED (`read` → `luca state read`), 5 are MISSING/design-deferred (incl. `justify-empty-phase`/`re-enter-pipeline` as F3). **Major prose drift**: 6 of 10 mode-agent prompts still reference dropped action names (`complete-phase`, `start-phase`, `switch-mode`, `advance-wave`, `record-iteration`, `re-enter`, `archive-loose`, `reset-pipeline`, `set`, `lock release`). See §4. |
| `tools/write-planning-file.ts` | 157 | SUPERSEDED | Plan §5.3 row "Replaced by native Write + named handlers." The agent uses the Claude Code `Write` tool directly (with stage-gate hook validating path-for-phase) for freeform `.luca/` artifacts, and the `luca` CLI for structured mutations. |

### 3.8 `rule-engine/` (4 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `define-rule.ts` | 110 | PORTED | `luca-core/src/rule-engine/define-rule.ts`. |
| `index.ts` | 31 | PORTED | `luca-core/src/rule-engine/index.ts`. |
| `recurrence.ts` | 263 | PORTED | `luca-core/src/rule-engine/recurrence.ts`. |
| `runner.ts` | 469 | PORTED | `luca-core/src/rule-engine/runner.ts` + CLI at `luca-cli/src/commands/rules.ts`. |

### 3.9 `integration/` (4 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `branding.ts` | 79 | DROPPED — dies with mastracode | Mastracode-specific ASCII banner / version-resolution shim. Plan §5.5: "Drop — dies with mastracode." |
| `install-bundled-assets.ts` | 173 | DROPPED — dies with mastracode | `.mastracode/` symlinks. Plan §5.5: "Drop — dies with mastracode." Replaced by `luca init writeProjectSkeleton` + `luca init installSkills` in `luca-cli`. |
| `mastracode-config.ts` | 103 | DROPPED — dies with mastracode | Reads `~/.config/mastracode/settings.json`. Plan §5.5 row. |
| `model-routing.ts` | 204 | DROPPED — dead on arrival | Plan §5.5 row: dup of `luca-framework`'s `MODEL_ROUTING_TABLE`; single source of truth lives in luca-core today. |

### 3.10 `util/` (12 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `atomic-write.ts` | 14 | PORTED (reimplemented) | `luca-cli/src/write-surface/helpers/write-atomic.ts` (`writeAtomicFile`). Async signature, otherwise same semantics (mkdir → write tmp → rename). |
| `branch-template.ts` | 23 | SUPERSEDED | `renderTemplate` was used by the dropped ensure-feature-branch `apply`/`rename` actions. The branch-template schema field is preserved in `luca-core/src/preferences/schemas.ts:115`, but the rendering function is not ported. SUPERSEDED by F4's "skills run git directly" design decision. |
| `numeric.ts` | 43 | SUPERSEDED | `finiteOrNull`/`clampTokens` exist only as workflow-state telemetry-write guards. Now superseded by Zod schemas at `luca-core/src/telemetry/schemas.ts` doing input-boundary validation. Not re-exported by any active package. |
| `numeric.test.ts` | 69 | DROPPED | no-tests rule + subject SUPERSEDED. |
| `phase-paths.test.ts` | 171 | DROPPED | no-tests rule + subject SUPERSEDED. |
| `phase-paths.ts` | 491 | SUPERSEDED | The `.planning/` filesystem chokepoint. Wholesale replaced by `luca-core/src/luca-dir/` (`LUCA_DIR_CONTRACT` + helpers — `phase-path-for`, `audit-path-for`, `wave-path-for`, `telemetry-path-for`, …). `slugifySegment` ported into `luca-core/src/vault/helpers/sanitize-vault-name.ts` (cited in docstring). |
| `plan-checkboxes.ts` | 237 | **ORPHANED** | `tickPhaseTasks()` auto-ticked PLAN.md checkboxes when `workflow-state.complete-phase` ran. The dropped-actions audit §2 calls `complete-phase` "SUPERSEDED by `luca state advance`", but `luca state advance` does NOT call `tickPhaseTasks`. The advisory-but-useful checkbox sync is silently lost. See §4 for full analysis. |
| `refs.ts` | 95 | DROPPED — dies with mastracode | Mutable refs (`resolveModelRef`, `switchModeRef`, `followUpRef`, `mcpManagerRef`) wired up by `createMastraCode()` after harness init. The chicken-and-egg problem these solve dies with the harness; in Claude Code, agents and tools are loaded statically. |
| `sanitize.test.ts` | 89 | DROPPED | no-tests rule. |
| `sanitize.ts` | 52 | PORTED (1 of 3 functions) | `sanitizeForLog` ported to `luca-core/src/telemetry/helpers/sanitize-for-log.ts`. `sanitizeForStorage` + `displayBounded` have no remaining caller (their callers are the dropped workflow-state telemetry-meta fields, now Zod-enforced at boundary). SUPERSEDED. |
| `token-budget.ts` | 142 | SUPERSEDED | `TokenBudgetMonitor` subscribed to a Mastra hook that fires on token-count changes. Claude Code does not expose token-count to hooks. E-4's `context-refresher` substitutes a deterministic tool-call counter (citation in `luca-core/src/orchestration/context-refresher-config.ts:4`). |
| `tui-text-helpers.ts` | 172 | DROPPED — dies with mastracode | ANSI + grapheme width helpers consumed only by `upstream-patches.ts`'s pi-tui monkey-patches. Both die together. |

### 3.11 Root files (5 + index = 6 files)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `agent-constraints.ts` | 55 | PORTED | `luca-tools/src/artifacts/shared/agent-constraints.ts` (D-3). |
| `create-static-agent.ts` | 67 | DROPPED — dies with mastracode | Plan §5.5: "Drop — dies with mastracode." Mastra-specific Agent factory; Claude Code agents are static markdown + frontmatter compiled from `defineAgent` definitions. |
| `index.ts` | 77 | DROPPED — dies with mastracode | Plan §5.5: "index.ts boot — drop." Module barrel + harness entry point. |
| `launch.ts` | 705 | DROPPED — dies with mastracode | Plan §5.5: "launch.ts — drop." Mastra-harness bootstrap (model routing, MCP wiring, harness lifecycle). The 705 lines are the entire mastracode top-of-stack that the v13 model replaces with `luca` CLI + Claude Code's native harness. |
| `memory-tier-discipline.ts` | 25 | PORTED | `luca-tools/src/artifacts/shared/memory-tier-discipline.ts` (D-3). |
| `rules-loader.ts` | 77 | SUPERSEDED | NOT the same as `rule-engine/runner.ts` — this is the `.mastracode/rules/*.md` (Cursor-style frontmatter rules with `alwaysApply: true`) prose-concatenator. SUPERSEDED by the in-line `shared-prefix` mechanism in the new compiler; the always-apply prose is embedded into every mode/subagent body during `compile()` via `render-body.ts`. |

### 3.12 `constants/` (1 file)

| File | Lines | Disposition | Evidence |
|---|---|---|---|
| `mode-ids.ts` | 77 | SUPERSEDED | The `MODES` map (`'luca:1-triage'`, …) is the Mastra-mode-id namespace. v13's pipeline-step vocabulary lives in `luca-core/src/state/configs/pipeline-transitions.ts` + per-mode `defineAgent` files. The `'luca:N-name'` IDs are no longer used — replaced by bare step names (`triage`, `research`, etc.) in the Claude Code surface. |

## 4. Orphaned findings

Two findings — one functional (1 file), one prose-only (6 files).

### 4.1 `util/plan-checkboxes.ts` — functional orphan (LIVE, advisory)

**What it does.** `tickPhaseTasks(planFile, phaseName)` flips `- [ ]` →
`- [x]` for matching tasks under a phase heading in `PLAN.md`. Called by
mastracode's `workflow-state.complete-phase` action AFTER the phase-diff
guard + verification-result PASS check both passed — i.e. only flips
boxes when the phase is independently attested.

**Why it's an orphan, not a SUPERSEDED.** The dropped-actions audit §2
classifies `complete-phase` as "SUPERSEDED by `luca state advance`."
That's true for the state-machine transition (which moves
`pipelineStep` forward), but `luca state advance` does **not** call
`tickPhaseTasks()`. Search confirms zero callers in active packages
(`grep -rn 'tickPhaseTasks\|plan-checkbox' packages/luca-{core,cli,tools}`
returns no matches). The advisory checkbox-sync behaviour is silently
lost.

**Severity assessment.**
- The source-file docstring explicitly calls the behaviour "advisory":
  failure never throws and never blocks `complete-phase`.
- The same docstring notes the value: "PLAN.md becomes a faithful audit
  trail, and any unchecked task remaining post-completion is a
  meaningful signal."
- Without the auto-tick, PLAN.md is again perpetually stale (the bug
  the module was originally written to fix). The v13 baseline regresses
  silently to "checkboxes are decorative."
- Not a Phase H blocker: nothing breaks. The migration's "port-as-TS-
  source" promise is broken for this one helper.

**Recommendation.** **CARRY-FORWARD to v14**. Either:
1. Re-implement `tickPhaseTasks` as a side effect of `luca state advance`
   when the target step crosses a phase boundary (the most faithful
   port); OR
2. Drop the behaviour intentionally with a documented "checkboxes are
   advisory; the source of truth is `.luca/state.json` and the audit
   ledger" decision in the v14 docs.

### 4.2 Six mode-agent prompts reference dropped CLI commands — prose orphan (LIVE, will fail at runtime)

**The drift.** During D-3, the mastracode mode instruction bodies were
re-imported verbatim into `luca-tools/src/artifacts/modes/*.ts` with
`.planning/` → `.luca/` and `PLAN.md` → `plan.md` retargets applied.
But the mastracode tool/action names (`workflow-state` actions:
`complete-phase`, `start-phase`, `switch-mode`, `advance-wave`,
`record-iteration`, `save-plan-artifacts`, `save-review-results`,
`justify-empty-phase`, `re-enter`, `archive-loose`, `reset-pipeline`,
`set-field`, `lock acquire|release`) were NOT retargeted. The prompts
now tell the agent to run CLI commands like:

```
luca state complete-phase --verification-passed true
luca state switch-mode --target review
luca state start-phase --phase-name "Phase 1: …"
luca state advance-wave
luca state record-iteration
luca state re-enter --target execute --reason "<…>"
luca state archive-loose
luca state reset-pipeline
luca state lock release
luca state set --field=prUrl --value="…"
```

**None of these subcommands exist.** `luca-cli/src/commands/write-
surface/state.ts` exposes ONLY `read` + `advance`. Every other invocation
above will exit non-zero with citty's "unknown command" error.

**Where the drift sits.** Confirmed by grepping the artifact source for
the dropped commands:

| File | Drifted invocations |
|---|---|
| `modes/execute.ts` | `start-phase`, `complete-phase` (×3), `advance-wave` (×2), `record-iteration` (×2), `switch-mode --target review` |
| `modes/finalize.ts` | `complete-phase` (×2), `archive-loose`, `re-enter` (×2), `lock release` (×2), `reset-pipeline`, `switch-mode --target architect`, `set --field=prUrl` |
| `modes/architect.ts` | `switch-mode`-style references in prose |
| `modes/review.ts` | `switch-mode --target` |
| `modes/triage.ts` | `save-…`/`switch-mode`-style references |
| `modes/research.ts` | `save-…`/`switch-mode`-style references |

**Severity assessment.**
- The dropped-actions audit explicitly says these are SUPERSEDED by
  `luca state advance --to-step <step>` + native Write. The audit's
  resolution was correct; the agent prompts were never updated.
- At runtime, an agent following the prompt will issue a command that
  doesn't exist, get an error, and (if well-trained) recover by reading
  `luca --help` or `luca state --help`. The pipeline does not silently
  do the wrong thing; it loudly fails to do anything.
- The Phase G parity report describes the D-3 retargeting work
  ("Mastra harness tool names retargeted to the `luca` CLI write
  surface") but does not list `workflow-state` action names in the
  retargeting set. This appears to be a missed retargeting pass.
- Not a Phase H blocker: the v13 baseline is preserved (the agent fails
  loud, the user sees the error, work continues by humans). But the
  migration's central promise — that artifacts are "compiled from TS
  via the D-2 compiler, with D1 guidance restored, replacing the v13
  hand-rewritten markdown" — is partially unfulfilled here.

**Recommendation.** **CARRY-FORWARD to v14** as a focused retargeting
patch: replace every `luca state <dropped-action>` invocation in
`packages/luca-tools/src/artifacts/modes/*.ts` with the
audit-prescribed `luca state advance --to-step <step>` (+ native Write
for artifact payload) form. This is a ~200-line mechanical edit across
6 files, gated on tsc; no functional change to the framework. The
substitutions are:

| Dropped invocation | Replacement |
|---|---|
| `luca state complete-phase --verification-passed true` | `luca state advance --to-step verify` (then `luca state advance --to-step review`) |
| `luca state switch-mode --target review` | `luca state advance --to-step review` |
| `luca state start-phase --phase-name "…"` | `luca state advance --to-step plan` + native Write of phase artifacts |
| `luca state advance-wave` / `record-iteration` | (drop — wave counter is bookkeeping that telemetry covers via `luca telemetry emit`) |
| `luca state archive-loose` | `luca repo cleanup-apply` |
| `luca state reset-pipeline` | `luca workflow reset --confirm` |
| `luca state lock release` | (drop — no lock acquisition in v13 either; see §3.7 pipeline-lock row) |
| `luca state set --field=prUrl …` | Native Write to `.luca/state.json` is forbidden; the field would need a new `luca state set --field` surface or to be tracked differently. **Design call.** |
| `luca state re-enter --target … --reason "…"` | `luca state advance --to-step <target>` (and confirm legal-transition table covers re-entries — that's F3) |

## 5. Phase H blockers

**None found.** The two orphan findings above are CARRY-FORWARD items,
not blockers:

- The functional orphan (`plan-checkboxes`) is advisory behaviour that
  was lost silently. No surface breaks; no v13 baseline regresses
  visibly. Deleting mastracode doesn't make this worse.
- The prose orphan (dropped CLI references in mode prompts) fails loud,
  not silent. Deleting mastracode doesn't make this worse either;
  rerunning a pipeline today fails at the same step as it would after
  Phase H deletion.

The Phase G parity report's four documented caveats (F1 confidence
schema; F3 ledger emission; hook handler distribution; vault-init
`.planning/` residue) likewise remain non-blockers. Concur with the
G-1 verdict: Phase H is safe to proceed.

## 6. Carry-forward gaps for v14

Aggregated from this audit + the Phase G report (Inventory-Completeness
lens only — other reviewers will surface additional gaps):

1. **F1** — realign `luca confidence log` writer to `ConfidenceEntrySchema`.
2. **F3** — emit `phase-empty-justification` + `re-enter-pipeline`
   ledger events from `luca state advance` (design call).
3. **Hook handler distribution** — `dist/claude/.claude/settings.json`
   references 6 new Phase E hook handler files that aren't copied by
   `luca init writeProjectSkeleton`. Dead on arrival in fresh projects.
4. **`vault-init` `.planning/` residue** — writes `.planning/config.json`,
   references dropped `luca run`. Small focused patch.
5. **NEW — `plan-checkboxes` reintegration** (§4.1) — either restore
   `tickPhaseTasks` as a side effect of `luca state advance`, or document
   the deliberate drop.
6. **NEW — Mode-prompt CLI retargeting** (§4.2) — replace dropped
   `luca state <action>` invocations in 6 mode artifact files with the
   `luca state advance` form prescribed by the dropped-actions audit.
7. **`pipeline-lock`** (§3.7) — decide whether concurrent-run protection
   matters for a single-user tool. The lock file is in the dir contract
   and `workflow reset` knows how to remove a stale one, but no code
   acquires it.
8. **F4 / F5 design calls** — `luca branch` and `luca repo` surface
   scope (open since Phase C dropped-actions audit).

## 7. Recommendations

For Phase H proceed-decision:

- **Proceed.** No blocker found from the Inventory Completeness lens.
- **Track**: the two new findings above (`plan-checkboxes` orphan, mode-
  prompt CLI drift). Append them to the parity report §10
  recommendations or open follow-up items.
- **Before Phase H deletion** (optional but cheap): land the mode-prompt
  CLI retargeting patch (§4.2). It's mechanical, tsc-gated, and would
  make the v13 pipeline actually runnable end-to-end without throwing
  on the first `luca state complete-phase` invocation. Without it, the
  first user to run `lu` on a fresh install will hit a citty "unknown
  command" error during the execute→verify boundary.
- **After Phase H**: revisit `plan-checkboxes` as part of the v14
  ledger-event design work (F3) — both are about wiring side effects
  onto the canonical state-machine transition.

The Phase G "READY WITH CAVEATS" verdict stands. The caveats list
should grow by two items (§4.1, §4.2) to reflect the orphans this
second-opinion lens surfaced.
