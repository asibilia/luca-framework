# Parity review — synthesis (pre-Phase-H GO/NO-GO)

> Synthesizer aggregating the six pre-Phase-H reviewer reports.
> Source inputs: `docs/parity-review/01-…` through `06-…`.
> Read-only synthesis; no new audit work and no code modified.
> Date: 2026-05-23.

## TL;DR

**Phase H is safe to execute.** All six independent reviewers (inventory,
subagent/mode fidelity, skills/commands fidelity, logic-module fidelity,
orchestration-hook equivalence, deletion safety) returned CLEAR with caveats;
no reviewer surfaced a finding that would corrupt the deletion or leave the
working tree broken.

**But do not publish `npm publish @alecsibilia/luca@13.0.0-alpha.0` blind
after Phase H.** Three skill/artifact-body cleanup items would cause a
fresh `luca init` + first `lu` run to fail loudly: (a) 20 skill bodies
still shell out to the deleted `bun run packages/luca-framework/src/state/bridge.ts`
script (67 dead invocations), (b) 6 mode-agent prompts call dropped
`luca state` subcommands (`complete-phase`, `switch-mode`, `start-phase`,
`advance-wave`, `record-iteration`, `re-enter`, `archive-loose`,
`reset-pipeline`, `lock release`), and (c) a YAML block-scalar compiler bug
silently truncates the "Use when …" auto-trigger sentences from 4 skills'
descriptions. All three are mechanical, tsc-gated, and bounded to
`packages/luca-tools/src/artifacts/` (plus the compiler).

The substantive framework bugs (F1 confidence writer/reader mismatch, F3
ledger event emission gaps, hook-handler distribution gap, `vault-init`
`.planning/` residue) do NOT break first-install; they undermine the
framework's working contract on the second or third run. These are the
alpha→beta blockers: must land before promoting the alpha tag, but do not
gate the deletion itself.

Recommended sequence: land Phase H today → land the pre-publish patch list
→ ship `@alecsibilia/luca@13.0.0-alpha.0` → smoke-test fresh install →
land F1/F3/hook-distribution → promote alpha to beta.

## Verdict

**GO for Phase H.**

Every reviewer arrived at the same conclusion through a different lens:

- **R1 (inventory):** 141 mastracode files all dispositioned; 1 functional
  orphan (`plan-checkboxes.ts` advisory checkbox auto-tick) and 1 prose-only
  drift cluster (mode prompts reference dropped CLI surfaces). Neither
  blocks deletion.
- **R2 (subagent/mode fidelity):** D1 restoration (telemetry hooks,
  vertical-slice, TDD, claim-verify, rule-run, postmortem-generate)
  landed end-to-end across all 8 ported subagents and 10 ported modes. Body
  prose faithful with documented compressions.
- **R3 (skills/commands fidelity):** Scope clean (zero out-of-scope
  artifacts in the bundle); body prose faithful; cross-reference integrity
  has one real break (5 `Skill(skill: …)` refs in `lu` SKILL); path
  retargeting incomplete (232 uppercase artifact paths, 67 dead bridge
  invocations).
- **R4 (logic-module fidelity):** Function-by-function parity COMPLETE for
  every Phase B port. F1 (confidence writer/reader divergence) confirmed
  open; intentional drops documented; one subtle exit-code drift in
  `luca retro`; one undocumented drop in `shadow-scan` config layer.
- **R5 (orchestration hooks):** 4 hooks substantively equivalent to the
  Mastra originals; Bash-mutation correctly delegated to stage-gate; one
  proxy substitution (context-refresher tool-call count vs. token
  utilization) is sound but lossy on log-heavy runs; one subtle divergence
  in `checkPipelineGuard` rejecting same-step research→research.
- **R6 (deletion safety):** Zero import-level dependencies from active
  packages into the dying ones. Umbrella self-contained. Working
  `.luca/archive/00-legacy-planning/` preserved. Build chain independent.

The Phase G "READY WITH CAVEATS" verdict stands and is now corroborated
from six independent lenses. Deleting `packages/luca-mastracode/` (174
tracked files) and `packages/luca-framework/` (248 tracked files, sweeping
the legacy `.cursor/`, `.pi/`, `.mastracode/`, `.planning/` support trees)
is a structural no-op for the build chain.

The caveats matter for publishing the alpha tag and for promoting it to
beta — but they are explicitly NOT Phase H prerequisites. The deletion is
clean; the next gate is the publish gate.

## Tiered findings

### 🛑 BLOCKERS (Phase H itself)

**None found across all 6 reviewers.**

Every documented finding either (a) predates Phase H (was already broken
in the v13 tree before the deletion) or (b) is a runtime-degradation, not
a build-break, that Phase H does not make worse. The clearest expression
comes from R3:

> "Any user-facing skill that invokes `bun run
> packages/luca-framework/src/state/bridge.ts` will fail post-Phase H
> (the script doesn't exist), BUT it also doesn't work pre-Phase H (Phase
> C already removed the bridge implementation). So Phase H does not change
> the failure surface — it merely confirms it."

### 🚨 PRE-PUBLISH (must land before `npm publish @alecsibilia/luca@13.0.0-alpha.0`)

These would cause `luca init` or first `lu` run to error on a fresh install.

#### P1. Skill-body cleanup pass — dead bridge + dropped CLI commands + uppercase artifact paths

**Source:** R3 §4.4 + R1 §4.2 + R4 §5 caveat + R6 §5

**Territory (consolidated from multiple reviewer flags):** A single sweep
over `packages/luca-tools/src/artifacts/{skills,modes}/**/index.ts` fixes
all of the following:

- **67 dead `bun run packages/luca-framework/src/state/bridge.ts <verb>`
  invocations across 20 skill bodies** (R3 §4.4): note, session-resume,
  phase-execute, repo-audit, milestone-new, progress, phase-discuss,
  phase-plan, phase-remove, workflow-save, todo-add, quick, phase-insert,
  session-pause, milestone-audit, project-new, lu, milestone-complete,
  phase-add, autopilot. Replace with `luca state read` / `luca state
  advance --to-step=<step>` / etc.

- **Dropped CLI subcommand references in 6 mode prompts** (R1 §4.2):
  `modes/execute.ts`, `modes/finalize.ts`, `modes/architect.ts`,
  `modes/review.ts`, `modes/triage.ts`, `modes/research.ts`. Replace
  `luca state complete-phase` / `start-phase` / `switch-mode` /
  `advance-wave` / `record-iteration` / `re-enter` / `archive-loose` /
  `reset-pipeline` / `lock release` / `set --field=` with the
  audit-prescribed `luca state advance --to-step <step>` form (R1 §4.2
  ships the full substitution table).

- **232 uppercase artifact filename refs across 25 skill bodies** (R3 §4.2):
  `STATE.md` (115) → read JSON via `jq` from `state.json`; `ROADMAP.md`
  (68) → `roadmap.md`; `PROJECT.md` (30), `REQUIREMENTS.md` (25),
  `MILESTONE-CONTEXT.md`, `MEMORY-SNAPSHOT.json` — no contract slot;
  re-evaluate workflow; `MILESTONE-AUDIT.md` (4) → `milestones/v<SEMVER>-audit.md`.

- **3 residual `.planning/` refs** (R3 §4.1): `skills/progress`,
  `skills/quick`, `skills/project-new` SKILLs — trivial 1-line edits.

- **2 residual `luca_gate_check` MCP-tool refs** (R3 §4.5): `skills/lu`
  + `skills/phase-plan` — replace with `luca gate check`.

- **`.luca/todos/pending/*.md` references in 5 skill bodies** (R4 §5):
  autopilot, todo-add, todo-check, progress, session-plan — rewrite to
  MuninnDB `muninn_remember --concept=todo:<id>` form. The `.luca/`
  contract has no `todos/` directory.

- **`lu-planner` subagent prompt references in 7 skill bodies** (R6 §5):
  phase-plan, quick, phase-execute, lu, autopilot, session-plan — either
  re-introduce the `lu-planner` subagent OR rewrite to invoke the
  `architect` mode via `Task()` (the architectural call already made when
  the subagent was dropped).

**Why pre-publish:** Without this pass, the first user to run `lu` on a
fresh install hits citty "unknown command" errors during the
execute→verify boundary (mode prompts), `Skill()` 404s during step setup
(lu skill), and the bridge script not-found errors throughout. The
framework is unusable until this lands.

**Effort:** ~200-line mechanical edit across ~25 artifact source files,
tsc-gated. Group into one logical commit per artifact family
(modes, skills/orchestration, skills/state, skills/todos).

**Fix-where:** all paths under `packages/luca-tools/src/artifacts/`.

#### P2. YAML block-scalar description compiler bug

**Source:** R3 §3.11 + R3 §4.7 + R3 §10.1

**What breaks:** 4 skills had their "Use when …" auto-trigger sentences
silently dropped during port: `luca-init`, `luca-telemetry-report`,
`luca-write-surface`, `memory-audit`. The compiler reads `description: >`
block-scalar form, collapses it to a single-line string, but stops at the
first blank line (paragraph break) — silently truncating the second
paragraph.

**Why pre-publish:** Claude Code's skill auto-trigger system reads the
description field to decide whether to surface a skill in response to
natural-language phrases like "audit memory", "init luca", "telemetry
report". With the second paragraph dropped, these phrases no longer
trigger the matching skills.

**Fix-where:** the artifact compiler (likely in
`packages/luca-tools/src/artifacts/` compile helpers — the YAML/string-joining
logic). One-place fix; verify with the 4 affected skills.

**Effort:** Single-file compiler patch; rebuild artifacts; re-verify 4
skill bodies.

#### P3. Five broken `Skill(skill: …)` cross-references in `lu` SKILL

**Source:** R3 §3.1 + R3 §5.1

**What breaks:** The `lu` SKILL body invokes 5 skills that were
intentionally not ported and don't exist in the bundle:
`jira-issue`, `git-feature`, `pr-address`, `debug`, `git-commit`.

**Why pre-publish:** The `lu` SKILL is the primary orchestrator surface.
A skill-not-found error during the first `lu` invocation breaks the
"works out of the box" promise of the alpha tag.

**Fix options (R3 §10.1, choose one):**
1. Remove those branches from `lu` SKILL so it matches `/lu` command's
   narrower pipeline-only orchestration (RECOMMENDED — `/lu` command
   already proves this works).
2. Port the missing skills (`jira-issue`, `git-feature`, `pr-address`,
   `debug`, `git-commit`).
3. Delete the legacy `lu` SKILL entirely and rely on the modernized
   `/lu` COMMAND as the canonical orchestrator.

R3 corroborates that the `/lu` COMMAND has none of these problems — uses
the new CLI verbs throughout, no bridge refs, no broken cross-refs. The
SKILL is the divergent legacy long-form duplicate.

**Effort:** Small if option 1 or 3; larger if option 2.

---

**Note:** P1–P3 are pure artifact-source-tree edits inside
`packages/luca-tools/src/artifacts/` + the compiler. They do not require
re-touching `luca-core` or `luca-cli`. The pre-publish work is bounded
and well-defined.

### ⚠️ ALPHA→BETA BLOCKERS (must land before promoting alpha→beta on npm)

These would not break first-install but undermine the framework's working
contract on the second or third run.

#### B1. F1 — `luca confidence log` writer/reader schema divergence

**Source:** R4 §4.1 (definitive) + R1 §3.7 + R6 §10 + Phase G parity report

**What breaks:** The luca-core canonical `ConfidenceEntrySchema` requires
`{phase, wave, task, confidence (high|medium|low), category, decision,
alternatives, reasoning, risk, files}`. The luca-cli writer
(`luca confidence log`) still emits the v13 narrow shape
`{timestamp, stage, score (0..1), rationale, metadata?}`. Every entry
written through the CLI today is **silently dropped** by the reader's
`safeParse` — it routes to `invalidLines` with a `console.warn` no caller
sees. The CLI source already acknowledges this in its own JSDoc.

**Why alpha→beta:** Confidence journal is an advisory signal for human
reviewers, not a correctness gate — first-install works fine. But every
session silently discards its confidence entries; the operator has no
visible signal that the journal is empty.

**Fix-where:** `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts`
and `packages/luca-cli/src/commands/write-surface/confidence.ts`. Rewrite
to accept the full canonical shape, likely via `--file <payload.json>`
matching other write-surface handlers.

**Effort:** Writer-side patch; tsc-gated.

#### B2. F3 — `luca state advance` ledger event emission

**Source:** R4 §8 item 5 + R1 §6 + Phase G parity report caveat 2

**What breaks:** The `lucaStateAdvanceTool` handler does not call
`appendLedger` for the side-effect events the postmortem analyzer scans
for: `mode-transition`, `phase-empty-justification`, `re-enter-pipeline`,
etc. The logic layer (`appendLedger`) is ready; the writer just doesn't
call it.

**Why alpha→beta:** The postmortem analyzer (`luca retro postmortem`)
detects 7 violation classes by scanning the ledger. Without these emission
events, the postmortem returns no violations for sessions that should have
flagged them. Quality-of-life regression for the learn loop.

**Fix-where:** Wire `appendLedger` calls into `luca state advance` side
effects in `luca-cli`.

#### B3. Hook handler distribution gap

**Source:** R5 §7 item 1 + R6 §10 caveat 3 + Phase G parity report

**What breaks:** `dist/claude/.claude/settings.json` references 6 new
Phase E hook handler files (pipeline-guard, read-only-enforcement ×3
sibling matchers, continuation-messages, context-refresher) but
`luca init writeProjectSkeleton` does NOT copy these handler files into
consumer projects. The hooks reference paths that don't exist in a fresh
`luca init`-ed repo — they're dead on arrival in consumer projects.

**Why alpha→beta:** The hooks are the defense-in-depth layer for
pipeline-guard, read-only enforcement, continuation messages, and context
refresh. Without them firing in consumer projects, the framework operates
without those safety rails. First install "works" (no errors), but the
guarantees are absent.

**Fix-where:** Extend `writeProjectSkeleton` / `init-skills` in
`packages/luca-cli/` to `cp <package>/dist/claude/.claude/hooks/*.ts
<project>/.claude/hooks/` and merge the bundled `settings.json`.

**Effort:** Moderate — focused on the skill installer.

#### B4. `vault-init` / `init` / `runtime-context` / `version-check` `.planning/` + `luca run` residue

**Source:** R6 §4 + R6 §5 + Phase G parity report caveat 4

**What breaks:** Four leaf files in `luca-cli` still reference legacy
behaviour:

- `packages/luca-cli/src/commands/vault-init.ts` — 8 live refs creating
  `.planning/` directory, writing `.planning/config.json`. Should be
  `.luca/config.json`.
- `packages/luca-cli/src/utils/vault-setup.ts` — 3 JSDoc refs to
  `.planning/`; the function body follows caller-supplied paths but the
  default flows from `vault-init.ts`.
- `packages/luca-cli/src/commands/init.ts` (line 268, 270) — stdout
  string telling users to "launch the harness: `luca run`". `luca run`
  doesn't exist in the new CLI.
- `packages/luca-cli/src/commands/vault-init.ts` (line 115) — same
  "Run `luca run`" stdout string.
- `packages/luca-cli/src/utils/runtime-context.ts` (line 85, 104) —
  walks the filesystem looking for `@alecsibilia/luca-framework` in
  `node_modules/`. Dead code path.
- `packages/luca-cli/src/utils/version-check.ts` (line 55) —
  `update-notifier` tells users to `bun add -g
  @alecsibilia/luca-framework@latest`. Wrong package name post-Phase-H.

**Why alpha→beta:** Users running `luca init` on a fresh repo get
`.planning/config.json` written (wrong location) and are told to run a
non-existent `luca run` command. First-install completes, but the
follow-on instructions are wrong.

**Fix-where:** Mechanical retargeting of 4 leaf files in `luca-cli`.

#### B5. Compiled hook handlers do not emit ledger events

**Source:** R5 §7 item 4

**What's missing:** The pure orchestration modules return telemetry
payloads (`pipeline-guard-rejection`, `pipeline-forced-transition`,
`continuation-emitted`, `continuation-skipped`, etc.) but the handlers in
`packages/luca-tools/src/hooks/<name>/handler.ts` do not call
`appendLedger` to write them. The mastracode originals wrote these events
for retrospective analysis.

**Why alpha→beta:** Quality-of-life regression for the learn loop; the
postmortem analyzer loses signal. Composes with B2 (F3) as a single
"ledger event emission gap" theme.

### 📋 CARRY-FORWARD TO v14

Substantive but not urgent. Track as v14 work; do not let them gate
publishing or promotion.

#### CF1. `plan-checkboxes.ts` advisory checkbox auto-tick lost (R1 §4.1)

The `tickPhaseTasks()` advisory PLAN.md auto-tick fires during mastracode's
`workflow-state.complete-phase`. The v13 surface (`luca state advance`)
does not call it. The behaviour was documented as advisory and never
blocked. **Decision:** either restore as a side effect of `luca state advance`
OR drop intentionally with a documented "checkboxes are advisory" note.

#### CF2. `pipeline-lock` not ported (R1 §3.7)

Concurrent-run protection. `.luca/lock.json` is in `LUCA_DIR_CONTRACT` and
`workflow reset` knows how to remove stale locks, but no code acquires
them. Single-user nice-to-have, not a correctness gate.

#### CF3. F4 / F5 design calls outstanding (R1 §3.7 + Phase C audit)

- F4: `luca branch` surface (1 of 7 ensure-feature-branch actions ported;
  others DROPPED per F4 design call).
- F5: `luca repo` surface (1 of 6 repo-cleanup actions ported; others
  DROPPED per F5 design call). Includes `parse-report`, `summary`,
  `archive-loose`.

#### CF4. `shadow-scan` config layer dropped without port-header note (R4 §3.6 + R4 §8)

`ShadowDebtConfigSchema`, `loadShadowDebtConfig`, `determineScanMode`,
`SCAN_MODE_CATEGORIES`, and the `.planning/`-vs-`.luca/` allowlist/denylist
defaults were not ported. Probably intentional ("scanner config lives in
the agent now"), but the drop is not documented in the port header. Either
add a port-header note or port the layer.

#### CF5. `luca retro` exit code regression (R4 §3.16 + R4 §6 + R4 §8)

Mastracode `retro.ts` exited `1` on any critical postmortem violation;
luca-cli `retroCommand` always exits 0. If any skill or finalize gate
piped `luca retro` to a `||` operator, the gate is now silently inert.
Two-line change in `packages/luca-cli/src/commands/retro.ts`.

#### CF6. Raw-capture safety net dropped from research + review modes (R2 §9 items 1+2)

Legacy `Capture Raw Findings` and `Capture Raw Research Outputs` steps
that persisted raw subagent output to `*-capture-*.md` BEFORE consolidation
are dropped. Belt-and-suspenders concern if a subagent OM-compresses its
own output. Suggested follow-ups: add a `raw-finding-captured` telemetry
event, OR resurrect the capture step.

#### CF7. shared-prefix dropped detailed `record-subagent` prose (R2 §9 item 2)

Mastracode prefix carried explicit invariants (`success: true for
completed*`, `durationMs MUST be Date.now() - ts`). The D-3 port relies on
the `telemetryHooks` factory flag to render the emission contract. The
rendered `## Telemetry` prelude lists each event but does not prescribe
the `success`/`durationMs` invariants at the bullet level. Extend
`render-body.ts` to render them explicitly.

#### CF8. `checkPipelineGuard` rejects same-step research → research (R5 §1 + R5 §3.1 + R5 §7 item 3)

`checkPipelineGuard` short-circuits on `currentStep === requestedStep` with
`same-step-no-op` BEFORE consulting `PIPELINE_TRANSITIONS` — but the table
allows `research: ['discuss', 'research']` as a deliberate re-research
self-loop. The guard contradicts the table. Either drop the same-step
short-circuit OR remove `research` from `research`'s legal successors. 5-line
change.

#### CF9. Context-refresher proxy: add real context signal if/when Claude Code exposes one (R5 §4 + R5 §7 item 2)

The tool-call-count proxy (30 calls per refresh) is sound for the design
intent but over-fires on short cheap-tool sessions and under-fires on
log-heavy single-Bash bursts. Add a second fire condition wired to an
actual `CLAUDE_CONTEXT_PERCENT` signal when available.

#### CF10. Cosmetic doc / JSDoc drift after deletion (R6 §3 + R6 §10)

- `packages/luca-core/README.md`:10 — 2 prose breadcrumbs to luca-framework /
  luca-mastracode.
- `packages/luca-studio/lib/types.ts` JSDoc `@see` refs to deleted
  `packages/luca-framework/src/...` paths.
- ~36 `* Ported from luca-mastracode <path>` JSDoc breadcrumbs survive in
  source. Intentional provenance; do not remove.
- ~30 `* Ported from fd0b169be:packages/luca-framework/.cursor/skills/<name>/SKILL.md`
  in skill files. Same status.
- `.cursor/luca/...` doc-path references in 12+ skill bodies (R6 §4):
  inline the referenced content OR drop the pointers.

#### CF11. Promote `parseAdvanceCommand` helper into luca-core (R5 §8 item 5)

Currently duplicated byte-identically across `pipeline-guard/handler.ts`
and `continuation-messages/handler.ts`. Promote then.

#### CF12. Stale `.changeset/` entries for dead packages

18 queued changesets target `@alecsibilia/luca-framework` and
`@alecsibilia/luca-mastracode`. R6 §9 lays out options A/B/C; A
(exit pre-mode, flush to legacy CHANGELOGs, then delete) is
recommended.

### 🔧 MINOR / FYI

#### M1. `artifacts/index.ts` JSDoc says "7 subagents" but ships 8 (R2 §9 item 3)

One-character documentation drift in
`packages/luca-tools/src/artifacts/index.ts`. Bump "7" → "8".

#### M2. `grill-me` description/body casing inconsistency (R3 §3.10 + R3 §9 item 8)

Description says `docs/CONTEXT.md` (uppercase); body uses `docs/context.md`.
Align to lowercase.

#### M3. Consider porting `bug-diagnose` SKILL.md (R3 §6.2 + R3 §9 item 9)

Currently command-only. Close the asymmetry.

#### M4. `detectRecurringPitfalls` runIds ordering nuance (R4 §3.13 + R4 §6 item 2)

Mastracode tagged "oldest first" via external bookkeeping; luca-core uses
raw Set insertion order from caller. Caller-determined now. Cosmetic; flag
for the v14 audit doc.

#### M5. `readLedger` per-line tolerance (R4 §6 item 4)

luca-core skips bad lines; mastracode discarded the entire file. Strictly
an improvement — note in release notes only.

#### M6. `writeVerificationResult` history removal (R4 §6 item 5)

`verification-history.jsonl` no longer written. If any consumer treated it
as an audit log of attempted verifications, they're now blind. Session
ledger is the canonical signal; confirmed in port header.

## Cross-reviewer corroboration map

Issues that surfaced from multiple lenses (high-confidence findings, not
artifacts of one reviewer's interpretation):

| Finding | Reviewer flags |
|---|---|
| **Mode prompts reference dropped CLI subcommands** | R1 §4.2 (formal accounting, 6 mode files, 30+ invocation sites) + R3 §3.6 (PLAN.md / STATE.md drift in phase-plan SKILL) |
| **Skill bodies use dead `bun run …bridge.ts`** | R3 §4.4 (67 instances, 20 files) + R6 §4 (general path drift) |
| **Uppercase artifact paths persist in skill bodies** | R2 §9 item 4 (cross-cut grep flag) + R3 §4.2 (formal 232-instance accounting) + R4 §5 caveat (artifact-side todos refs) |
| **`.luca/todos/` references in skill bodies** | R4 §5 (5 skills) + R6 §5 (subset overlap) |
| **`lu-planner` subagent referenced but not ported** | R6 §5 (7 skill bodies) + R3 §3.1 (5 broken `Skill()` refs in `lu` SKILL, with overlap) |
| **F1 confidence writer/reader divergence** | R4 §4.1 (definitive schema diff) + R1 §3.7 + R6 §10 caveat 1 + Phase G report |
| **F3 ledger event emission gap** | R4 §8 item 5 + R1 §6 + R6 §10 caveat 2 + R5 §7 item 4 |
| **Hook handler distribution gap** | R5 §6 + R5 §7 item 1 + R6 §10 caveat 3 |
| **`vault-init` `.planning/` + `luca run` residue** | R6 §4 + R6 §5 + Phase G caveat 4 |
| **`luca-framework` package-name string in user-facing output** | R6 §3 (`version-check.ts:55`, `runtime-context.ts`) |

Corroboration is strongest on the skill/artifact-body cleanup territory
(R1 + R2 + R3 + R4 + R6 all surface aspects of the same underlying
problem) and on F1/F3/hook-distribution (R1 + R4 + R5 + R6 all confirm).
No reviewer contradicted any other reviewer; corroboration is unanimous
where lenses overlap.

## Phase H execution checklist

Sequenced from R6 §11 (lowest-risk-first), with cross-reviewer corroboration:

1. **Edit root `package.json`.** Remove the 4 doomed scripts:
   - `"build": "cd packages/luca-framework && bun run build"`
   - `"mastracode": "bun run packages/luca-mastracode/src/index.ts"`
   - `"publish:framework": "cd packages/luca-framework && bun publish --access restricted"`
   - `"release:local": "bun run build && cd packages/luca-framework && bun link"`

   Optionally drop from the `catalog` block:
   - `"@mastra/core": "1.34.0"`
   - `"@mastra/libsql": "1.10.1"`
   - `"@mastra/memory": "1.18.1"`
   - `"mastracode": "0.19.0"`

   Commit alone. Easy to revert.

2. **Resolve `.changeset/` per R6 §9** (Option A recommended): exit
   pre-mode, flush the 18 queued changesets into legacy CHANGELOGs as a
   final 12.x.y entry, update `.changeset/pre.json` `initialVersions`
   and `.changeset/config.json` `fixed` rule. Commit.

3. **Add umbrella restructure changeset.** New `.changeset/<slug>.md`
   tagged `@alecsibilia/luca: minor` (or `major` if treating 13.0.0 as
   a hard reset) describing Phase H + legacy removal. Commit.

4. **Delete `packages/luca-mastracode/`** — 174 tracked files. R6 §7:
   `git rm -r packages/luca-mastracode/`. Commit.

5. **Delete `packages/luca-framework/`** — 248 tracked files. This sweeps
   the legacy `.cursor/`, `.pi/`, `.mastracode/`, `.planning/` support
   trees in one go (they live INSIDE this directory). R6 §7:
   `git rm -r packages/luca-framework/`. Commit.

6. **Smoke gate (R6 §11 step 6):** `bunx --bun tsc --noEmit` from each
   active package. Expected: all green per Phase G report.

7. **Build gate (R6 §11 step 7):** `cd packages/luca && bun run build`.
   Expected: 245.27 kB / 122 files tarball, dist/claude/ regenerated.

8. **Final docs sweep:** root `README.md`, `AGENTS.md`, `CLAUDE.md`.
   Replace `@alecsibilia/luca-framework` install instructions with
   `@alecsibilia/luca`. Optionally clean up
   `packages/luca-core/README.md:10` prose breadcrumb.

**Preserve (R6 §8 explicit allowlist):**
- `.luca/archive/00-legacy-planning/` (10 top-level dirs, slim-down specs)
- `packages/luca-{cli,core,tools}/` and `packages/luca/`
- `packages/luca-studio/` (orthogonal Next.js dashboard, no Phase H impact)
- `docs/repo-restructure-plan.md`, `docs/repo-restructure-parity-report.md`,
  `docs/v13-write-surface-migration.md`, `docs/parity-review/`
- Root config files

**Do NOT manually patch the 11 `.planning/` refs in `luca-cli` `vault-init.ts` +
`vault-setup.ts` during Phase H.** That's caveat B4 (alpha→beta blocker) and
belongs in its own focused commit AFTER the deletion lands.

**Cursor / Pi removal note:** No standalone `.cursor/`, `.pi/`, or `.mdc`
directories exist outside `packages/luca-framework/` and
`.luca/archive/00-legacy-planning/` (R6 §7B). Deleting `packages/luca-framework/`
removes them automatically.

## Post-Phase-H roadmap

1. **Land Phase H** per checklist above. Expected commit count: ~5–6 commits
   over ~30 minutes. Halt-check after each.

2. **Land pre-publish patches P1–P3** (skill-body cleanup, YAML compiler
   bug, `lu` SKILL cross-refs). One feature branch, multiple commits,
   gated on `bunx --bun tsc --noEmit` + a fresh `bun run --filter
   @alecsibilia/luca-tools compile:artifacts` smoke verify of affected
   artifacts.

3. **Publish `npm publish @alecsibilia/luca@13.0.0-alpha.0`.** Per
   `packages/luca/PUBLISHING.md`: `prepublishOnly` runs `bun run build`;
   tarball ships at 245.27 kB / 122 files; `publishConfig.access: public`.

4. **Run `npm deprecate "@alecsibilia/luca-framework@<=12.0.0-alpha.16"`**
   per PUBLISHING.md instructions.

5. **Smoke-test fresh install end-to-end.** Create a scratch project, run
   `bun add @alecsibilia/luca`, `luca init`, `lu "<trivial task>"`, walk
   through to `complete`. Verify pipeline-guard hook fires; verify
   continuation-message hook fires on step transitions; verify confidence
   journal writes (note: it will write but be dropped by reader until F1
   lands — confirm the warning shows up).

6. **Land alpha→beta patches B1–B5** (F1 confidence writer, F3 ledger
   emission, hook handler distribution, `vault-init` `.planning/` residue,
   hook handler ledger writes). One feature branch per concern;
   tsc-gated.

7. **Promote alpha → beta on npm.** `npm publish @alecsibilia/luca@13.0.0-beta.0`.

8. **Address carry-forward CF1–CF12 + M1–M6** on the v14 milestone arc.
   None of these gate beta promotion.

## Inputs (the 6 individual reports)

- **`docs/parity-review/01-inventory-completeness.md`** (R1, 481 lines).
  File-by-file disposition of every mastracode `src/` file. 51 PORTED, 53
  SUPERSEDED, 36 DROPPED, 1 functional orphan (`plan-checkboxes`), 1
  prose-only orphan cluster (6 mode prompts reference dropped CLI
  subcommands). Phase H verdict: **CLEAR**.

- **`docs/parity-review/02-subagent-mode-fidelity.md`** (R2, 585 lines).
  Body-level fidelity of 8 subagents + 10 modes + 3 glue files. All D1
  restoration gaps (#1–#7) closed. Renders D1 prelude blocks
  (`## Guidance`, `## Pipeline Invocations`, `## Telemetry`) below
  each artifact body via `render-body.ts`. Phase H verdict: **CLEAR**.

- **`docs/parity-review/03-skills-commands-fidelity.md`** (R3, 378 lines).
  Coverage of 40 skills + 17 commands. Body prose faithful. 232 uppercase
  artifact paths + 67 dead bridge invocations + 5 broken Skill() refs in
  `lu` SKILL + YAML block-scalar compiler bug. Phase H verdict: **CLEAR
  WITH CAVEATS**.

- **`docs/parity-review/04-logic-module-fidelity.md`** (R4, 703 lines).
  Function-by-function parity for every Phase B port + 4 Phase E
  orchestration modules. Schema round-trip exact for telemetry,
  verification-result, ledger, preferences. F1 confidence
  writer/reader divergence confirmed open. `state/todos.ts` filesystem
  layer clean. One subtle `luca retro` exit code drift. One undocumented
  drop in `shadow-scan` config layer. Phase H verdict: **CLEAR WITH ONE
  CAVEAT (F1)**.

- **`docs/parity-review/05-orchestration-hook-equivalence.md`** (R5, 683
  lines). Trigger/algorithm/failure-mode parity for E-1..E-4. Hooks
  substantively equivalent; Bash-mutation delegated to stage-gate hook
  (verified live in `wireClaudeHooks` + `STAGE_TOOL_MATRIX`).
  Context-refresher uses a tool-call-count proxy (sound, lossy on
  log-heavy runs). One subtle `same-step-no-op` divergence in
  pipeline-guard. Phase H verdict: **CLEAR**.

- **`docs/parity-review/06-phase-h-deletion-safety.md`** (R6, 530 lines).
  Reverse-direction audit. Zero TS-level imports from active packages
  into dying packages. Umbrella self-contained via unbuild
  `inlineDependencies`. Working `.luca/archive/00-legacy-planning/` preserved.
  Build chain independent. Phase H verdict: **CLEAR** with 4 v14
  caveats (F1, F3, hook distribution, `vault-init` residue) + 2 new
  surfaced (lu-planner refs in 7 skill bodies, `.cursor/luca/...`
  refs in 12+ skill bodies).

## Glossary / definitions

- **D1 restoration** — Decision #1 from `session:repo-restructure-handoff
  v15`. Mandate that the D-3 (subagent/mode) compiler restore the
  functional gaps (#1 telemetry hooks, #2 vertical-slice, #3 TDD, #4
  postmortem-generate, #5 rule-run, #6 recurrence-driven rule promotion,
  #7 claim-verify) flagged in plan §3. Verified end-to-end by R2.

- **Mastra strip** — The "drop everything that dies with mastracode"
  pass during Phase C. Removed harness-specific glue (Mastra refs, TUI
  patches, `createScopedTool`, `tool-manifest`, `model-routing.ts`,
  `branding.ts`, `install-bundled-assets`, `pipeline-tui`,
  `upstream-patches`) without touching the algorithmic core.

- **F1** — Audit finding F1 from Phase G. The `luca confidence log` CLI
  writes a 4-field shape (`{timestamp, stage, score, rationale}`) while
  the luca-core `ConfidenceEntrySchema` reader requires 11 fields. Every
  entry is silently dropped by the reader. Alpha→beta blocker.

- **F3** — Audit finding F3 from Phase G. The `luca state advance` handler
  does not call `appendLedger` for the side-effect events
  (`mode-transition`, `phase-empty-justification`, `re-enter-pipeline`,
  …) the postmortem analyzer scans for. Logic layer ready; writer hasn't
  wired it. Alpha→beta blocker.

- **F4, F5** — Phase C dropped-actions audit design calls on the scope of
  the `luca branch` (F4) and `luca repo` (F5) CLI surfaces. Multiple
  actions DROPPED per the design call; carry-forward to v14.

- **`LUCA_DIR_CONTRACT`** — Exported from `@alecsibilia/luca-core/luca-dir`.
  The canonical allowlist for `.luca/` paths. Includes `state.json`,
  `config.json`, `lock.json`, `roadmap.md`, `ledger.jsonl`, the `phases/`,
  `milestones/`, `telemetry/`, `archive/` subtrees, and the per-phase
  file allowlist. No `STATE.md`, `ROADMAP.md`, `PROJECT.md`, `REQUIREMENTS.md`,
  `todos/`, or `CONFIDENCE-JOURNAL.md` slots.

- **`MODES` enum** (legacy) → **`PipelineStep`** (new). Mastracode tracked
  state via a small `MODES` enum (`luca:1-triage`, …); v13 uses a broader
  pipelineStep vocabulary (`triage`, `research`, `discuss`, `architect`,
  `plan`, `plan-review`, `execute`, `checks`, `verify`, `review`,
  `learn`, `milestone`, `complete`) backed by `PIPELINE_TRANSITIONS`.

- **Stage-gate hook** — The `luca hook stage-gate` PreToolUse hook on
  `Edit|Write|NotebookEdit|Bash`. Reads `STAGE_TOOL_MATRIX` from luca-core
  to decide whether the current phase permits the tool class. Composes
  with the read-only-enforcement hook (which gates the 3 native write
  tools at the matcher layer).

- **`v13`** — The post-restructure release line, shipped as
  `@alecsibilia/luca@13.0.0-alpha.0`. Replaces the v12
  `@alecsibilia/luca-framework@12.x` lineage.

---

**End of synthesis.** The six reviewers have done the work. Phase H is
safe to execute. The pre-publish patch list is bounded and
well-defined. The alpha→beta promotion path is clear.
