# Fix wave — applied (pre-Phase-H GO)

> Sign-off report for the pre-Phase-H synthesis-driven fix wave.
> Source: `docs/parity-review/00-synthesis.md` (and reviewer reports
> 01-…–06-…). Five commits land the closures: four parallel territory
> agents (A/B/C/D) and one Wave-2 coordination commit.
> Date: 2026-05-24.

## 1. Executive verdict

**GO for Phase H.** Every finding surfaced by the synthesis and the
six reviewer reports is closed. All four packages type-check clean
(`bunx --bun tsc` zero exit on `luca-tools`, `luca-core`, `luca-cli`,
`luca`); the artifact compile produces the expected counts (18 agents,
17 commands, 41 skills, 6 hook entries against 4 hook handlers). The
five fix-wave commits — Fix-A `a4607428e` (luca-tools artifacts),
Fix-B `df3b343ce` (luca-cli surfaces), Fix-C `204c045a2` (luca-core
modules), Fix-D `a986bd6e1` (compiler YAML block-scalar bug), and this
Wave-2 commit — together close 3 pre-publish blockers, 5 alpha→beta
items, 12 carry-forward gaps, and 6 minor items per the synthesis's
finding inventory. No carry-forwards remain pending; the synthesis's
TL;DR "do not publish blind after Phase H" guard is now fully resolved.

## 2. Findings closed (by tier)

### Pre-publish (P-tier, 3 closed)

- **P1 — Skill-body cleanup pass** [commit `a4607428e`].
  All four sub-findings closed in luca-tools artifact territory:
  - 67 dead `bun run packages/luca-framework/src/state/bridge.ts <verb>`
    invocations across 20 skill bodies retargeted to native `luca` CLI
    verbs (`luca state read`, `luca state advance --to-step`,
    `luca telemetry emit`, `luca workflow reset`, MuninnDB engrams
    where issue/branch metadata no longer fits the state schema).
    Evidence:
    `grep -rn "bun run packages/luca-framework/src/state/bridge\.ts" packages/luca-tools/src/artifacts/`
    → 0 hits.
  - 30+ `luca state <verb>` references retargeted per the
    substitution table.
    Evidence:
    `grep -rEn "luca state (complete-phase|switch-mode|start-phase|advance-wave|record-iteration|archive-loose|reset-pipeline|re-enter)" packages/luca-tools/src/artifacts/`
    → 0 hits.
  - ~232 uppercase artifact filename refs (`STATE.md`, `ROADMAP.md`,
    `PROJECT.md`, `REQUIREMENTS.md`, `MILESTONE-AUDIT.md`,
    `MEMORY-SNAPSHOT`, `PLAN.md`, `RESEARCH.md`, `CONTEXT.md`,
    `POSTMORTEM.md`, `VERIFICATION.md`) retargeted per
    LUCA_DIR_CONTRACT.
    Evidence: remaining hits are JSDoc "Ported from" / migration
    breadcrumbs or explicit "the legacy X has no canonical home" notes
    — 0 unintentional residue.
  - `.luca/todos/` references collapsed onto `luca todo {add,list,update}`
    + MuninnDB. Evidence:
    `grep -rn "\.luca/todos/" packages/luca-tools/src/artifacts/` →
    3 hits, all explicit "there is no `.luca/todos/` directory"
    advisory notes.
  - 7 `lu-planner` subagent refs redirected to the `architect`
    mode-agent. Evidence: 5 surviving hits are intentional
    migration-explainer breadcrumbs ("the v12-era lu-planner subagent
    was dropped per plan §5.6").
  - 2 `luca_gate_check` MCP refs removed. Evidence:
    `grep -rn "luca_gate_check" packages/luca-tools/src/artifacts/` →
    0 hits.

- **P2 — YAML block-scalar compiler bug** [compiler fix
  `a986bd6e1`; source-side restoration in this Wave-2 commit].
  The frontmatter emitter (`render-frontmatter.ts`) collapsed any
  multi-line description into a JSON-escaped single-line scalar, which
  prevented Claude Code's skill auto-trigger surface from matching the
  multi-paragraph "Use when …" trigger phrases on four skills
  (luca-init, luca-telemetry-report, luca-write-surface, memory-audit).
  Fix-D landed the compiler fix (literal block scalars `|` / `|-`
  with chomp-indicator driven by trailing-newline presence) plus a
  smoke fixture asserting the round-trip. Wave-2 restored the
  multi-paragraph descriptions at source in the four affected skill
  `index.ts` files using the user's hand-maintained
  `~/.claude/skills/<name>/SKILL.md` as canonical reference.
  Evidence: the compiled SKILL.md files now emit
  `description: |-` with blank-line separators between primary
  description and the trigger paragraph.

- **P3 — `lu` SKILL broken Skill() refs** [commit `a4607428e`].
  Trimmed the legacy `lu` SKILL body to match the modernized `/lu`
  COMMAND surface. Removed the 5 broken `Skill(skill: …)` invocations
  (`jira-issue`, `git-feature`, `pr-address`, `debug`, `git-commit`);
  replaced the routing-skill prose with the pipeline-orchestrator flow
  per the COMMAND body. Evidence:
  `grep -n "jira-issue\|git-feature\|pr-address\|debug\|git-commit" packages/luca-tools/src/artifacts/skills/lu/index.ts`
  → 1 hit (an intentional advisory pointing at the user's own
  `gh-pr-address` / `bug-diagnose` skills under `~/.claude/skills/`,
  not a broken Skill() invocation).

### Alpha→beta (B-tier, 5 closed)

- **B1 — F1 confidence schema writer rewrite** [commit `df3b343ce`].
  `luca confidence log` writer rewritten to accept the FULL canonical
  `ConfidenceEntrySchema` shape (phase, wave, task, confidence,
  category, decision, alternatives, reasoning, risk, files,
  reviewHint?). CLI leaf supports flag-driven AND `--file <payload.json>`
  forms; writer/reader now round-trip exact. BREAKING per D2.
  Evidence:
  `packages/luca-cli/src/commands/write-surface/confidence.ts` —
  description text and arg definitions cite the canonical schema
  fields.

- **B2 — F3 ledger event emission** [commit `df3b343ce`].
  `appendLedger` side effects wired into `luca state advance` for
  three event kinds: `phase-advance` (always — telemetry signal),
  `re-enter-pipeline` (when `to` is at an earlier step ordinal than
  `from`), `phase-empty-justification` (when leaving a step whose
  expected artifact wasn't written). Failure-open semantics
  preserved. Evidence: `grep -n "appendLedger" packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts`
  shows the import + the three call sites with matching event-kind
  literals.

- **B3 — Hook handler distribution** [commit `df3b343ce`].
  (a) `packages/luca/build.config.ts` `build:done` step copies each
  `packages/luca-tools/src/hooks/<name>/handler.ts` into
  `dist/claude/.claude/hooks/<name>.ts`. (b) New helper
  `install-hooks.ts` copies bundled handlers into
  `<project>/.claude/hooks/` and merges bundled `settings.json` into
  `<project>/.claude/settings.json` (luca-defined entries de-duped
  via the `LUCA_HOOK_HANDLER_MARKER` substring; user entries
  preserved). (c) `luca init` step 5 now calls `installHooks` after
  `writeProjectSkeleton`. Evidence: building the umbrella prints
  `[luca] copied hook handlers → …/.claude/hooks (4: context-refresher.ts, continuation-messages.ts, pipeline-guard.ts, read-only-enforcement.ts)`.

- **B4 — `.planning/` / `luca run` / package-name residue cleanup**
  [commit `df3b343ce`]. `vault-init.ts`, `vault-setup.ts`, `init.ts`,
  `runtime-context.ts`, `version-check.ts`, `types.ts`, `detect.ts`,
  and `doctor/checks/muninndb-health.ts` updated for `.planning/` →
  `.luca/`, `luca run` → `lu "<your task>"`, `@alecsibilia/luca-framework`
  → `@alecsibilia/luca`. Evidence:
  `grep -rn "\.planning/" packages/luca-cli/src/ | grep -v "/test\|denylist"`
  → 0 hits;
  `grep -rEn "luca run\b" packages/luca-cli/src/` → 0 hits;
  `grep -rn "@alecsibilia/luca-framework" packages/luca-cli/src/` →
  0 hits.

- **B5 — Compiled hook handlers emit ledger events** [commit
  `a4607428e`]. All four hook handlers (pipeline-guard,
  read-only-enforcement, continuation-messages, context-refresher)
  now append `hook.<name>.fired` events to `.luca/ledger.jsonl` via
  `appendLedger` from luca-core. Failure-open: ledger errors do not
  block the hook. Evidence: each
  `packages/luca-tools/src/hooks/<name>/handler.ts` contains
  2 `appendLedger` calls (one fire-event + one defensive on
  blocked-tool path).

### Carry-forward (CF-tier, 12 closed)

Per the user's "fix all" directive issued during the Wave-1
spawn, the synthesis's carry-forward backlog was promoted to
must-close. No carry-forwards remain pending.

- **CF1 — Plan-checkboxes auto-tick** [commit `df3b343ce`].
  Ported mastracode's `tickPhaseTasks` into
  `packages/luca-cli/src/utils/plan-checkboxes.ts` (advisory
  `PLAN.md` → `plan.md` path retarget; verbatim algorithm). Wired
  `luca state advance` to call it on the EXECUTING→non-EXECUTING
  coarse-phase boundary; outcome emitted as a `plan-tick-result`
  ledger event. Best-effort: never blocks state advance.

- **CF2 — Pipeline-lock port** [commit `204c045a2`].
  `state/pipeline-lock.ts` exposes `acquirePipelineLock`,
  `releasePipelineLock`, `forcePipelineUnlock`, `readPipelineLock`,
  `PipelineLockSchema`. Atomic acquisition via
  `openSync(p, 'wx')`. PID liveness via `process.kill(pid, 0)`
  (ESRCH = dead, EPERM = treat as live). Distinct from the outer
  `.luca/orchestrator.lock` defined in `docs/orchestrator-design.md
  §5b`. Exported from the state barrel. Evidence:
  `grep -n "acquirePipelineLock\|PipelineLockSchema" packages/luca-core/src/state/index.ts`
  shows the re-exports.

- **CF3 — F4/F5 documentation** [commit `df3b343ce`].
  `luca branch` non-guard actions and `luca repo` non-cleanup-apply
  actions marked as INTENTIONALLY DROPPED in
  `docs/repo-restructure-dropped-actions-audit.md` §6/§7/§8 and
  `docs/repo-restructure-plan.md` §10. The v13 model is "thin
  framework, smart skills" — skills run git directly and parse
  shadow-scan output inline; framework owns only atomic mutations
  and the non-recoverable default-branch guard.

- **CF4 — Shadow-scan config-layer drop documented** [commit
  `204c045a2`]. The public-surface header for
  `packages/luca-core/src/shadow-scan/` now records why
  `loadShadowDebtConfig`, `determineScanMode`,
  `ShadowDebtConfigSchema`, and `SCAN_MODE_CATEGORIES` were
  intentionally not ported in Phase B, with a pointer to git
  history for downstream re-port.

- **CF5 — `luca retro` exit-code fidelity** [helper `204c045a2`,
  CLI wiring this Wave-2 commit].
  Fix-C added `computePostmortemExitCode(report) → 0 | 1` to
  `analysis/postmortem.ts` (pure helper, exported via the analysis
  barrel and the top-level package barrel). Wave-2 wired it into
  `packages/luca-cli/src/commands/retro.ts`: after the report renders,
  `process.exitCode = computePostmortemExitCode(report)` restores the
  legacy `process.exit(critical > 0 ? 1 : 0)` semantic. CI
  integrators that gate on `luca retro` exit code now see the
  expected signal. `process.exitCode` (not `process.exit`) is used
  so citty completes the command lifecycle cleanly. Evidence:
  `grep -n "computePostmortemExitCode\|process.exitCode" packages/luca-cli/src/commands/retro.ts`
  shows the import + the assignment.

- **CF6 — Raw-capture safety net restored** [this Wave-2 commit].
  Per user decision LOCKED on Item 3, the `LUCA_DIR_CONTRACT` was
  extended with a per-phase `raw/` slot (pattern `<stage>-<NN>.md`,
  written by PLANNING/REVIEWING modes as a safety net before
  consolidation). The schema gained the `phase.raw` artifact kind
  and the `isValidLucaPath` validator now accepts
  `raw/<stage>-<NN>.md` paths (constant `RAW_FILE_RE` in
  `constants.ts`). The legacy raw-capture prose from the v12
  research and review modes (recovered via
  `git show fd0b169be^:packages/luca-mastracode/src/instructions/{research,review}.md`)
  was ported into `packages/luca-tools/src/artifacts/modes/{research,review}.ts`
  with paths retargeted to the new contract slot:
    - research mode: `.luca/phases/<slug>/raw/research-<NN>.md`
      (NN = dimension order: 01 scope, 02 architecture, 03 patterns,
      04 dependencies, 05 risk).
    - review mode: `.luca/phases/<slug>/raw/review-<reviewer>-<NN>.md`
      (NN = review wave from `reviewIteration`).
  Compile verified: rendered `research.md` mode body line 89
  ("## Capture Raw Findings"); rendered `review.md` mode body
  line 73 ("### Step 4.5: Capture Raw Findings").

- **CF7 — Shared-prefix detailed record-subagent prose** [commit
  `a4607428e`]. The `success/durationMs` invariant prose in
  `shared/shared-prefix.ts` restored, retargeted to
  `luca telemetry emit --kind=subagent.invoke|complete`.

- **CF8 — Pipeline-guard research→research self-edge** [commit
  `204c045a2`]. `checkPipelineGuard` no longer rejects research →
  research. The same-step-no-op short-circuit fired BEFORE consulting
  `PIPELINE_TRANSITIONS`, contradicting the table's deliberate
  self-edge (`research: ['discuss', 'research']`). Decision tree
  reordered: legality is checked first via `isLegalTransition`;
  `same-step-no-op` is reserved for genuinely-illegal self-edges.
  Evidence:
  `grep -n "isLegalTransition\|PIPELINE_TRANSITIONS" packages/luca-core/src/orchestration/pipeline-guard.ts`.

- **CF9 — F4/F5 prompt-side retargeting** [commit `a4607428e`].
  `luca branch <anything>` callsites in mode prompts retargeted to
  `luca branch guard` + direct git inspection + `luca preferences read`;
  `luca repo <anything>` callsites retargeted to
  `luca repo cleanup-apply` + the shadow-scanner subagent.

- **CF10 — luca-core/README prose cleanup** [commit `204c045a2`].
  Removed stale `luca-framework` / `luca-mastracode` prose
  breadcrumbs from the consumer list and the "what lives where"
  section. Pointers updated to `@alecsibilia/luca-cli` /
  `luca-tools` / `luca`. Evidence:
  `grep -cE "luca-framework|luca-mastracode" packages/luca-core/README.md`
  → 0.

- **CF11 — `parseAdvanceCommand` promotion + caller migration**
  [helper `204c045a2`, caller migration this Wave-2 commit].
  Fix-C promoted `parseAdvanceCommand` + `stripQuotes` from the two
  byte-identical hook-handler copies into
  `packages/luca-core/src/state/cli-parse.ts` (exported via
  `@alecsibilia/luca-core/state`). Wave-2 migrated both callers:
  the local function definitions were deleted from
  `packages/luca-tools/src/hooks/pipeline-guard/handler.ts` and
  `packages/luca-tools/src/hooks/continuation-messages/handler.ts`,
  and the existing `loadCurrentState` import from
  `@alecsibilia/luca-core/state` extended to include
  `parseAdvanceCommand`. Evidence:
  `grep -E "^function parseAdvanceCommand|^function stripQuotes" packages/luca-tools/src/hooks/*/handler.ts`
  → 0 local definitions.

- **CF12 — Outer orchestrator-lock distinction** [commit
  `204c045a2`, via CF2's JSDoc]. The CF2 pipeline-lock module's
  header explicitly disambiguates it from the outer
  `.luca/orchestrator.lock` defined in `docs/orchestrator-design.md
  §5b`. The two locks are intentionally distinct; documentation
  drift between them is closed.

### Minor (M-tier, 6 closed)

- **M1 — `artifacts/index.ts` JSDoc** [commit `a4607428e`].
  "7 subagents" → "8 subagents" (shadow-scanner was already
  included; JSDoc was stale). Skills count bumped to 41 to reflect
  the M3 `bug-diagnose` addition.

- **M2 — Skill-body migration breadcrumb policy** [commit
  `a4607428e`]. Documented in the Fix-A body: surviving
  `.planning/` strings in skill bodies are intentional historical
  breadcrumbs in JSDoc; all live invocations retargeted.

- **M3 — `bug-diagnose` skill added** [commit `a4607428e`].
  41 skills total in the compile output (up from 40 in the
  pre-fix-wave state).

- **M4 — `detectRecurringPitfalls` `runIds` ordering** [commit
  `204c045a2`]. Documented that the field follows
  caller-supplied `reports` order; the function deliberately does
  not re-sort because `startedAt` may be absent.

- **M5 — `readLedger` warn on malformed entries** [commit
  `204c045a2`]. `readLedger` now emits a per-line `console.warn`
  on malformed JSON or schema-invalid entries. Functional
  behaviour unchanged (still skips bad lines, returns all valid
  ones); the warn gives operators an audible signal that the file
  is partially corrupt.

- **M6 — `verification-result.ts` JSDoc** [commit `204c045a2`].
  JSDoc strengthened to record the intentional drop of
  `verification-history.jsonl` (plan §5.5) with the rationale and
  the redirect to the session ledger.

## 3. Verification evidence

### Gate checks (all packages green)

```
bunx --bun tsc -p packages/luca-tools/tsconfig.json   # exit 0
bunx --bun tsc -p packages/luca-core/tsconfig.json    # exit 0
bunx --bun tsc -p packages/luca-cli/tsconfig.json     # exit 0
bunx --bun tsc -p packages/luca/tsconfig.json         # exit 0
```

All four packages type-check clean with zero diagnostics.

### Artifact compile smoke

```
bun run --filter @alecsibilia/luca-tools compile:artifacts -- \
  --out /tmp/wave2-final-$$
```

Output counts:
- `.claude/agents/`: **18** entries (10 modes + 8 subagents — matches
  M1 corrected JSDoc).
- `.claude/commands/`: **17** entries.
- `skills/`: **41** entries (40 ported + 1 new `bug-diagnose` per M3).
- `.claude/settings.json`: **6 hook entries** spanning 4 distinct hook
  handler scripts (`pipeline-guard.ts`, `read-only-enforcement.ts`,
  `continuation-messages.ts`, `context-refresher.ts`).
  - PreToolUse: 4 entries (pipeline-guard on `Bash`;
    read-only-enforcement on `Write`, `Edit`, `NotebookEdit`).
  - PostToolUse: 2 entries (continuation-messages on `Bash`,
    context-refresher on `Bash`).

### Umbrella build (B3 hook distribution)

```
bun run --filter @alecsibilia/luca build
# → [luca] compiled artifacts → packages/luca/dist/claude
#     (agents:10 subagents:8 commands:17 skills:41 hooks:6 rules:0)
# → [luca] copied hook handlers → packages/luca/dist/claude/.claude/hooks
#     (4: context-refresher.ts, continuation-messages.ts,
#         pipeline-guard.ts, read-only-enforcement.ts)
```

### Per-finding re-greps

Every P-tier, B-tier, CF-tier, and M-tier grep listed in the
verification protocol returns clean (zero hits, or hits that are
intentional explanatory breadcrumbs in JSDoc / advisory prose). See
§2 for the per-finding evidence lines.

## 4. Phase H readiness

**Yes — the repo is ready for Phase H.**

The synthesis's pre-Phase-H GO criteria are all met:

1. **No deletion would corrupt the working tree.** Phase H removes
   `packages/luca-framework/` (the legacy in-repo CLI) and the
   `packages/luca-mastracode/` Mastra harness. No source under
   `packages/luca-{cli,core,tools}/` or `packages/luca/` still
   references either: the cleanup confirmed zero live invocations of
   the bridge script, zero imports of `@alecsibilia/luca-framework`,
   and zero references to mastracode tools (`workflowState`,
   `writePlanningFile`, `manageTodos`, etc.) that would break on
   removal.

2. **No publish-blocker remains.** A fresh `luca init` + first `lu`
   run on a clean repo can now succeed: skill bodies invoke real
   `luca` CLI verbs, mode prompts cite paths the LUCA_DIR_CONTRACT
   accepts, and hook handlers ship to `.claude/hooks/` via the
   B3 install path.

3. **No carry-forward debt.** Per the user's "fix all" directive
   during Wave 1 spawn, every CF-tier finding from the synthesis was
   promoted to must-close and is now landed.

4. **All four packages type-check.** `tsc` is the only mechanical
   gate per the no-tests rule; all four packages pass with zero
   diagnostics.

## 5. Phase H execution checklist

This list is what the user runs (or a follow-up agent runs) to land
Phase H. Source: Reviewer 6 (`docs/parity-review/06-phase-h-deletion-safety.md`)
+ the synthesis's Phase H section.

1. **Snapshot before**: `git status --short` should be clean.
2. **Remove the two deletable packages**:
   ```
   git rm -r packages/luca-framework
   git rm -r packages/luca-mastracode
   ```
3. **Drop their workspace entries** from the root `package.json`
   workspaces array (if explicitly listed; if globbed, no edit needed).
4. **Re-run `bun install`** to regenerate `bun.lock` without the two
   removed packages.
5. **Re-run all four tsc gates** to confirm the workspace still
   resolves:
   ```
   bunx --bun tsc -p packages/luca-tools/tsconfig.json
   bunx --bun tsc -p packages/luca-core/tsconfig.json
   bunx --bun tsc -p packages/luca-cli/tsconfig.json
   bunx --bun tsc -p packages/luca/tsconfig.json
   ```
6. **Re-run the artifact compile smoke** and confirm the same counts
   (18/17/41/6).
7. **Re-run the umbrella build** and confirm the
   `[luca] copied hook handlers` log shows the same 4 handlers.
8. **Commit** with a clear subject (`feat(restructure): Phase H — remove luca-framework + luca-mastracode`)
   and the standard Co-Authored-By trailer.
9. **Update `docs/repo-restructure-plan.md`** §10 to mark Phase H
   complete and §1 high-level status accordingly.
10. **Tag the milestone snapshot** under `.luca/milestones/` per the
    LUCA_DIR_CONTRACT before publishing.

After Phase H lands, the alpha publish blocker enumerated in the
synthesis (skill bodies, hook distribution, confidence schema,
ledger emission, retro exit-code, raw-capture safety net) is closed.
The repo is then ready for the alpha publish step
(`bunx changeset publish` for `@alecsibilia/luca@13.0.0-alpha.0`).
