# Parity review #2 — Subagent + mode prompt fidelity

> Reviewer 2 of 6, pre-Phase-H parity audit.
> Lens: SUBAGENT + MODE PROMPT FIDELITY.
> Read-only audit — no code modified.
> Date: 2026-05-23.

## 1. Executive verdict

**The D1 restoration mandate landed end-to-end.** Across all 8 ported
subagents and all 10 ported mode-agents, the body prose is **faithfully
preserved** (with a handful of intentional and documented compressions),
the factory flags (`verticalSlice`, `tdd`, `selfVerify`, `antiSycophancy`,
`telemetryHooks`, `pipelineInvocations`) are correctly applied per the
plan §3 functional gaps, and the D-2 compiler's `render-body.ts` actually
expands those flags into `## Guidance` / `## Pipeline Invocations` /
`## Telemetry` preludes BELOW each artifact's body. I spot-checked four
rendered outputs (`executor.md`, `finalize.md`, `architect.md`,
`research.md`, `build.md`) and the preludes are present and well-formed.

**Phase H verdict: CLEAR for subagent + mode fidelity.** A small number
of non-blocking carry-forward items are listed in §9.

Confidence in this verdict: **high**. Every legacy subagent + mode +
glue file was opened and diffed against its port; the rendered output
was inspected to confirm the compiler is doing what D1 specified.

## 2. Method

For each of the 8 ported subagents (researcher, discussion,
plan-reviewer, executor, verifier, reviewer, learner, shadow-scanner)
and 10 ported mode-agents (triage, research, architect, execute,
review, finalize, discuss, build, plan, fast):

1. Read the legacy source at
   `packages/luca-mastracode/src/{subagents,modes,instructions}/*` plus
   the three glue files
   (`{subagents/shared-prefix,agent-constraints,memory-tier-discipline}.ts`).
2. Read the ported `defineSubagent` / `defineAgent` definition at
   `packages/luca-tools/src/artifacts/{subagents,modes,shared}/*.ts`.
3. Diff the body prose section-by-section. Flag dropped paragraphs,
   semantic drift, lingering `.planning/` paths, lingering uppercase
   artifact names, lingering Mastra tool references, and missing D1
   factory flags.
4. Compile the artifact manifest to a scratch dir:
   `bun run --filter @alecsibilia/luca-tools compile:artifacts -- --out /tmp/r2-verify-$$`
   (compile succeeded; 18 mode/subagent files + commands + skills
   rendered).
5. Read 4 rendered outputs (`executor.md`, `finalize.md`,
   `architect.md`, `research.md`, `build.md`) and confirm the D1
   preludes appear below the author body.
6. `grep` every ported artifact for `.planning/`, uppercase artifact
   names (`PLAN.md` etc), and Mastra tool names (`workflowState`,
   `writePlanningFile`, etc).
7. Confirm planner + fix subagents are NOT present and not referenced.

## 3. Per-subagent findings

### 3.1 researcher (faithful)

- **Body fidelity:** Faithful. The 4 dimensions, the 4-section output
  format, and the 4 constraints all preserved verbatim.
- **D1 flags applied:** `selfVerify: true`, `pipelineInvocations:
  ['muninn-recall']`. No telemetry on the subagent itself
  (intentional — research mode-agent owns subagent-start/end boundary
  emissions). Rationale documented inline in the port header.
- **Lingering legacy refs:** None in runtime prose. Two `.planning/`
  refs in JSDoc comments only (acceptable).
- **Severity:** None.

### 3.2 discussion (faithful)

- **Body fidelity:** Faithful. Decisions/Constraints/Scope/Preferences/
  Open Questions output template preserved exactly. Behavioral rules,
  oversight handling, MuninnDB historical-context query all preserved.
- **Path retargeting:** `.planning/CONTEXT.md` → `.luca/phases/<slug>/
  context.md`. Vault resolution: `.planning/config.json` →
  `.luca/config.json`. Tool list expanded from implicit-default to
  explicit `[Read, Grep, Glob, Write, Edit]` (mastracode source had
  no `allowedWorkspaceTools` field at all). Documented in port header.
- **D1 flags applied:** `selfVerify: true`, `pipelineInvocations:
  ['muninn-recall']`.
- **Severity:** None.

### 3.3 plan-reviewer (faithful)

- **Body fidelity:** Faithful. Cold-isolation protocol, 3 review
  perspectives, 6-item review checklist, severity labels, gap-ID
  format (`G-ARCH-NNN` etc), convergence detection, output format all
  preserved verbatim. New explicit output-write step: "Write the
  structured plan-review output to `.luca/phases/<slug>/plan-review.md`
  via the `luca` CLI."
- **D1 flags applied:** `selfVerify: true`, `antiSycophancy: true`,
  `telemetryHooks: ['subagent-start', 'subagent-end']`,
  `pipelineInvocations: ['muninn-recall']`. Aligned with the
  intent in the mastracode "Self-Distrust Mandate" closing block.
- **Severity:** None. The mastracode "Self-Distrust Mandate" trailing
  paragraph is dropped from the port body but its content is covered
  by SUBAGENT_SHARED_PREFIX (which prepends a "Self-Verification
  Mandate" block to every subagent) + the `selfVerify: true` factory
  flag. Net coverage is **stronger**, not weaker.

### 3.4 executor (faithful — the largest D1 restoration target)

- **Body fidelity:** Faithful. Pre-commit branch guard, execution
  protocol (6 steps), commit format, deviation handling, constraints,
  full Confidence Logging schema, Self-Distrust Mandate, OVERFLOW
  protocol all preserved.
- **Path retargeting:** `.planning/PLAN.md` → `.luca/phases/<slug>/
  plan.md`. `.planning/config.json` → `.luca/config.json`.
- **Mastra tool retargeting:** `workflowState({action:"read"})` →
  `.luca/config.json` read (for `skipBranch`).
  `ensureFeatureBranch({action:"assert-not-default"})` →
  `luca branch-guard assert-not-default`. `confidenceJournal` tool →
  `luca confidence log` CLI. All tools correctly retargeted.
- **D1 flags applied:** Per plan §3 #2/#3 — `verticalSlice: true`,
  `tdd: true`, `selfVerify: true`. Per §3 #1 —
  `telemetryHooks: ['wave-start', 'wave-end']`. Per §3 #5/#7 —
  `pipelineInvocations: ['muninn-recall', 'rule-run',
  'confidence-log']`. **This is the most heavily-restored
  subagent**, and the restoration is complete.
- **Severity:** None.

### 3.5 verifier (faithful)

- **Body fidelity:** Faithful. Quick/Full mode split, Checks Fix Loop,
  Convergence Tracking (fingerprint/converging/stalled/resolved), the
  acceptance-criterion schema (criterionId/description/met/evidence/
  gap/blocking), the verificationResult schema (wave/mode/status/
  criteria/checks/convergence/errorFingerprints/recommendation) — all
  preserved verbatim. New explicit "write to
  `.luca/phases/<slug>/verify.json` via `luca verification write`."
- **D1 flags applied:** `selfVerify: true`, `antiSycophancy: true`,
  `telemetryHooks: ['verification-start', 'verification-end']`
  (per §3 #1), `pipelineInvocations: ['rule-run', 'claim-verify']`
  (per §3 #6 #7).
- **Mastra tool retargeting:** `runChecks` tool → `bunx --bun tsc`
  via `luca checks run`. `verificationResult({action:"write"})` →
  `luca verification write`.
- **Body adds the no-tests caveat:** "tests are intentionally absent
  in this repo today; see CLAUDE.md / no-tests rule" — correct per
  the actual repo state.
- **Severity:** None.

### 3.6 reviewer (faithful — and the 4-vs-5 enum is fixed)

- **Body fidelity:** Faithful. All 5 review perspectives — including
  the test-quality perspective the plan §5.1 audit flagged as
  out-of-enum drift — are present in the body's PERSPECTIVE label and
  the description string ("…architecture, DX, security,
  simplification, or test quality").
- **Path retargeting:** Findings now land at
  `.luca/phases/<slug>/audits/<reviewer>.md` (the LUCA_DIR_CONTRACT
  canonical name — one file per fixed reviewer slug:
  `code-architect`, `dx-advocate`, `security-auditor`,
  `code-simplifier`, `test-quality-reviewer`). The port surfaces the
  slug list inline in the body.
- **D1 flags applied:** `selfVerify: true`, `antiSycophancy: true`,
  `telemetryHooks: ['subagent-end']`, `pipelineInvocations:
  ['muninn-recall']`. The body's Anti-Sycophancy Gate (APPROVE
  requires ≥3 specific code locations) is preserved verbatim AND
  declared via the factory flag.
- **Dropped content:** The mastracode body ended with "Append the
  usage comment immediately after the closing ``` of the output
  block above — this IS the last line of your response." The port
  drops that one-line directive, but SUBAGENT_SHARED_PREFIX has a
  ## Luca Reminders block that includes the same usage-comment
  directive at every subagent's prefix. Net coverage preserved.
- **Severity:** None. The §5.1 "stale 4-vs-5 enum" flag is
  **closed**.

### 3.7 learner (faithful + extended)

- **Body fidelity:** Faithful. 4 learning categories
  (patterns/pitfalls/conventions/decisions), tagging strategy,
  "what NOT to store" list, summary output format — all preserved.
- **D1 flags applied:** `selfVerify: true`, `telemetryHooks:
  ['subagent-start', 'subagent-end']`, **`pipelineInvocations:
  ['muninn-recall', 'postmortem-generate']`** — the
  `postmortem-generate` declaration is the §3 #4 restoration: the
  learner is now the natural caller for `luca retro postmortem` at
  phase close.
- **New Step 3 — Phase Postmortem:** The port explicitly adds a
  Step 3 that triggers `luca retro postmortem` and writes
  `.luca/phases/<slug>/learn.md`. Mastracode's learner stored
  learnings but did NOT trigger the postmortem; that gap is closed.
- **Vault routing:** The port adds vault-routing-table awareness
  (`pattern:*`/`pitfall:*` → default vault; `convention:*`/
  `decision:*` → repo vault), aligned with
  `~/.claude/rules/vault-routing.md`.
- **Severity:** None. This port is **richer** than the legacy.

### 3.8 shadow-scanner (faithful — and the "BROKEN" flag is closed)

- **Body fidelity:** Substantial but **legitimate retargeting**.
  Categories 1-4 (orphaned-temp-scripts, misplaced-files,
  tool-artifacts, dead-exports) are preserved nearly verbatim.
  Category 5 (Stale Planning Artifacts) is rewired off MuninnDB
  todos (was filesystem `.planning/todos/pending/`). Category 6
  (Orphaned/Misplaced) is rewritten end-to-end against the
  `LUCA_DIR_CONTRACT` — the mastracode rules were `.planning/`-tree-
  specific and no longer apply. Category 7 (Repo-Root Markdown
  Debris) preserved verbatim. The Output Format JSON schema +
  Deduplication + Post-Scan Metric all preserved verbatim.
- **§5.1 BROKEN flag closed:** The mastracode shadow-scanner was
  flagged as "excluded from MCP tools yet instructions call
  `muninn_*`". The port's SUBAGENT_SHARED_PREFIX explicitly handles
  this: "If MuninnDB MCP tools are available, before your first
  substantive tool call run `muninn_recall`…If MuninnDB is
  unreachable or returns no matches, log briefly and proceed — NEVER
  block on recall failure." The subagent now degrades gracefully.
- **D1 flags applied:** `selfVerify: true`, `pipelineInvocations:
  ['muninn-recall']`. No telemetry hooks (read-only scanner; not on
  the pipeline boundary).
- **Severity:** None.

## 4. Per-mode findings

### 4.1 triage (faithful)

- **Body fidelity:** Faithful. Step 0 Crash Recovery, Step 1 Parse,
  Step 1.5 Similar Task Lookup, Step 1.6 Project Preferences
  Sentinel, Step 2 Classify, Step 3 Configure Workflow, Step 4
  Mandatory Save+Switch, Output Format, Pipeline Context all preserved
  step-by-step.
- **Mastra tool retargeting:** `pipelineLock(action:"recover")` →
  `luca state recover`. `pipelineLock(action:"acquire")` →
  `luca state lock acquire`. `classifyComplexity` tool →
  `luca classify`. `projectPreferences(action:"consult", fallback:
  false)` → `luca preferences consult --no-fallback`.
  `workflowState(action:"save-triage-results")` →
  `luca state save-triage`.
  `workflowState(action:"switch-mode")` → `luca state switch-mode`.
  All correctly retargeted.
- **Path retargeting:** `.planning/luca-state.json` → `.luca/state.json`.
  Uppercase artifact paths (PLAN.md, RESEARCH.md, etc.) → the
  LUCA_DIR_CONTRACT names. `targetMode: "luca:2-research"` etc →
  `--target "research"` (no `luca:N-` prefix).
- **Hardcoded model IDs:** Stripped. The mastracode `triageMode` had
  `defaultModelId: 'anthropic/claude-sonnet-4-6'`. The port's
  `defineAgent` has no model ID at all — the runtime picks per the
  complexity-routing table.
- **D1 flags applied:** `selfVerify: true`, `telemetryHooks:
  ['phase-start']`, `pipelineInvocations: ['muninn-recall',
  'confidence-log']`.
- **Severity:** None.

### 4.2 research (faithful — minor compression)

- **Body fidelity:** Faithful. All output-format sub-sections
  (Summary/Scope/Architecture/Patterns/Dependencies/Risks/
  Recommendations/Open Questions), Quality Review, Iteration
  Tracking, Knowledge Capture & Backlog Handoff, Pipeline
  Orchestration all preserved.
- **Dropped content:** The legacy `## Capture Raw Research Outputs`
  section — which had the agent writing
  `research-capture-{dim}-{wave}.md` files before consolidation as a
  context-overflow safety net — is dropped from the port. Same
  pattern as review §4.5 below. See §9 carry-forward.
- **D1 flags applied:** `selfVerify: true`, `telemetryHooks:
  ['subagent-start', 'subagent-end']`, `pipelineInvocations:
  ['muninn-recall']`.
- **Severity:** Low (non-blocking; see §9).

### 4.3 architect (faithful — vertical-slice prose intact)

- **Body fidelity:** Faithful. Step 1 Establish Feature Branch (with
  the consult/resolve/apply pattern), Step 1.5 Historical Context,
  Step 2 Discussion (NEVER SKIP), Step 2.5 Read Research, Step 3
  Roadmap Creation (with full WSJF scoring schema), Step 4 Plan
  Creation (with the full template), and crucially **Step 4.5
  Architectural Quality Check** (the depth/promotion/concrete-first/
  locality/interface-first quality bar) — all preserved verbatim.
  Step 5 Plan Review and Step 6 Submit for Approval likewise.
- **Vertical-slice section preserved:** "Wave Organization — Vertical
  Slices" in Step 4 is preserved verbatim (tracer-bullet first wave,
  vertical-over-horizontal as default, AFK-vs-HITL task tagging).
- **Mastra tool retargeting:** `workflowState`, `writePlanningFile`,
  `manageRoadmap`, `ensureFeatureBranch`, `ask_user`, `task_write` —
  all retargeted to `luca` CLI verbs (`luca state read/save/
  switch-mode`, `luca branch-guard consult|resolve|apply`,
  `luca roadmap write`, `luca confidence log`) and the Claude Code
  `Task` tool.
- **Path retargeting:** PLAN.md → `plan.md`, `.planning/` → `.luca/`.
- **Hardcoded model IDs:** Stripped.
- **D1 flags applied:** `verticalSlice: true` (per §3 #2),
  `selfVerify: true`, `telemetryHooks: ['subagent-start',
  'subagent-end']`, `pipelineInvocations: ['muninn-recall',
  'confidence-log']`.
- **Severity:** None.

### 4.4 execute (faithful — largest D1 restoration)

- **Body fidelity:** Substantial fidelity with deliberate compression.
  Objectives (6 items including rule gate), Context Loading,
  Checkpoint Interaction, Execution Loop (with all telemetry events
  inline), Phase Tracking via `luca` CLI, Confidence Journal (with
  full F1-aligned ConfidenceEntrySchema), Step 1 Execute (with the
  **Vertical Slice Execution** sub-section that mastracode had
  dropped), Step 2 Run Checks (with the convergence-based fix
  strategy table), **Step 2.5 Run Repo-Local Rule Pack** (the §3 #5
  restoration), Step 3 Verify (with claim-verify routing), Step 4
  Code Review (parallel spawn of 4 reviewers), Step 5 Learn (with the
  postmortem trigger), Step 6 Commit (with the consult-commit-
  preferences sub-step) — all preserved and **strengthened**.
- **The `fix` subagent reference is correctly removed:** The
  mastracode `execute.md` referenced a `fix` subagent that never
  existed. The port body's Convergence-Based Fix Strategy says
  "spawn fresh executor with the focused error set, continue" — no
  fix subagent.
- **D1 flags applied:** `verticalSlice: true`, `tdd: true`,
  `selfVerify: true`, `telemetryHooks: [phase-start, phase-end,
  wave-start, wave-end, subagent-start, subagent-end,
  verification-start, verification-end]`, `pipelineInvocations:
  [muninn-recall, rule-run, claim-verify, confidence-log,
  postmortem-generate]`. **This is the most heavily-restored mode**,
  and the restoration is complete.
- **Line-count delta:** 564 → 431 (-133). This is **legitimate
  compression** of the verbose mastracode telemetry comment blocks
  (e.g. `// → Before spawning: const ts = Date.now()` etc.) into
  concise paragraphs; the substance is preserved + the D1 flags
  enforce the same emission contract more rigorously than prose.
- **Severity:** None.

### 4.5 review (faithful — minor compression, one non-blocking drop)

- **Body fidelity:** Faithful. Step 1 Load Context (7 items),
  Step 2 Requirements Coverage, Step 3 Automated Checks, Step 4
  Parallel Code Review (5 reviewers), Step 5 Consolidate Findings,
  Step 5.5 Cross-Reference MuninnDB, Step 6 Audit Report, Step 7
  Route Decision (with user-checkpoint + full-auto branches and
  Route A/B logic) — all preserved.
- **Dropped content:** The legacy `### Step 4.5: Capture Raw
  Findings` step — which had the agent writing
  `review-capture-{perspective}-{wave}.md` files before consolidation
  as a context-overflow safety net — is dropped from the port.
  Rationale: per LUCA_DIR_CONTRACT, each reviewer subagent now writes
  directly to `audits/<reviewer>.md` (one file per fixed reviewer
  slug), so the separate raw-capture step is redundant. **But the
  *intent* — preserve raw output before any consolidation step that
  might OM-compress it — is no longer enforced.** See §9
  carry-forward.
- **D1 flags applied:** `selfVerify: true`, `antiSycophancy: true`,
  `telemetryHooks: ['subagent-start', 'subagent-end']`,
  `pipelineInvocations: ['muninn-recall', 'claim-verify']`.
- **Mastra tool retargeting:** `workflowState` → `luca state`,
  `verificationResult({action:"read"})` → `luca verification read`,
  `confidenceJournal({action:"read/summary"})` →
  `luca confidence read/summary`, `writePlanningFile` → direct
  per-reviewer audit-file writes via the executor's `Write` tool,
  `claimVerifier({action:"verify-text"})` →
  `luca claim-verify verify-text`. All correctly retargeted.
- **Severity:** Low (non-blocking; see §9).

### 4.6 finalize (faithful + extended)

- **Body fidelity:** Step 1 Milestone Boundary, Step 2 Shadow Debt
  Scan, Step 3 Gap Detection (with Gap Audit sub-section), Step 4
  Postmortem Gate, Step 4.5 Recurring-Pitfall Rule Suggestions
  (the §3 #5/#6 restoration — calls `luca rules suggest` to promote
  pitfalls seen ≥3× to draft `.luca/rules/*.ts`), Step 5 PR Creation,
  Step 6 Cross-Milestone Continuation, Step 7 Session Cleanup, the
  Session Complete summary — all preserved.
- **D1 flags applied:** `selfVerify: true`, `antiSycophancy: true`,
  `telemetryHooks: ['phase-end', 'verification-start',
  'verification-end', 'subagent-start', 'subagent-end']`,
  `pipelineInvocations: ['muninn-recall', 'rule-run',
  'claim-verify', 'postmortem-generate', 'confidence-log']`. The
  postmortem-generate restoration (§3 #4) and the rule-run gate
  (§3 #5/#6) are both declarative.
- **Severity:** None.

### 4.7 discuss (faithful)

- **Body fidelity:** Faithful. Read-only constraints, "What You
  Do" / "What You Don't Do" / Discussion Style sections all
  preserved.
- **Mastra tool retargeting:** `manageTodos(action:"list/read")` →
  `luca todo list`. `npm install` → `bun install`.
- **Hardcoded model IDs:** Stripped.
- **Severity:** None.

### 4.8 build (faithful + extended)

- **Body fidelity:** Faithful. Working Style, Implementation Loop,
  Verification is Required, Error Recovery, all preserved.
- **D1 flags applied:** `tdd: true`, `selfVerify: true` — appropriate
  for a stock build mode. `verticalSlice` correctly NOT applied
  (build is non-pipeline ad-hoc work).
- **Mastra tool retargeting:** `task_write` / `task_check` → "Track
  your steps via a short todo list in your output (no external tool
  needed)" — appropriate, no equivalent exists in Claude Code. `tsc
  --noEmit` → `bunx --bun tsc --noEmit`. Adds an explicit "Luca
  Tools" section pointing at the `luca` CLI write surface skill.
- **No-tests caveat:** Correctly carried.
- **Hardcoded model IDs:** Stripped.
- **Severity:** None.

### 4.9 plan (faithful)

- **Body fidelity:** Faithful. Read-only constraints, What You Do
  (4 steps), Exploration Strategy (5 items), Plan Output Format,
  Important — all preserved.
- **Mastra tool retargeting:** `submit_plan` tool → "emit the plan
  markdown directly" (no Claude-Code equivalent for `submit_plan`).
  `npm install` → `bun install`.
- **Hardcoded model IDs:** Stripped.
- **Severity:** None.

### 4.10 fast (faithful)

- **Body fidelity:** Faithful. Rules, Tool Priority, When to Use
  Tools vs. Just Answer, Error Handling, Scope all preserved.
- **Mastra tool retargeting:** `view` → `Read`. `type check or test`
  → `type check` (no-tests caveat).
- **Hardcoded model IDs:** Stripped.
- **Severity:** None.

## 5. Glue files

### 5.1 shared-prefix (faithful)

- The 7-section structure (Core Operating Rules / Self-Verification
  Mandate / Anti-Sycophancy Directive / MEMORY_TIER_DISCIPLINE /
  Pre-Invoke Memory Recall / Luca Reminders) is preserved verbatim.
- Path retargeting: `.planning/config.json` → `.luca/config.json`.
- **One dropped bullet:** The mastracode shared-prefix ended with a
  detailed `record-subagent` complete-event prose (`"success: true
  for any completed* outcome…durationMs MUST be Date.now() - ts"`).
  The port drops this paragraph. **Rationale (inferred):** the
  D-3 design moves subagent-boundary emission OUT of the prompt
  body and INTO the factory `telemetryHooks` declarations, which
  the compiler renders into a separate `## Telemetry` prelude
  below each artifact. The intent is preserved; the **emission
  contract** moves from prose to declarative flag. See §9.

### 5.2 agent-constraints (faithful — with explicit drop)

- CORE_OPERATING_RULES, HARD_CONSTRAINTS, RECENCY_REMINDERS, and the
  `getAgentConstraints()` assembly helper all preserved.
- **One intentional drop:** the mastracode `getAgentConstraints()`
  concatenated `alwaysApply` rules loaded from disk via
  `loadAlwaysApplyRules()`. The port intentionally drops this
  dynamic-rule injection — rules are now a first-class artifact
  kind (`defineRule`) loaded by `luca-core`'s rule-engine at
  runtime, not stitched into agent prompts. Mode-agents that want
  to surface rules to the model do so via the
  `pipelineInvocations: ['rule-run']` declaration. Documented
  inline in the port header. **This is the correct architectural
  move**, not a regression.
- Path retargeting: `switch-mode (pipeline) or stop (stock modes)`
  → `transition the pipeline via the \`luca\` CLI or stop (stock
  modes)`.

### 5.3 memory-tier-discipline (faithful — byte-identical content)

- The MEMORY_TIER_DISCIPLINE constant is preserved verbatim. Only
  the JSDoc preamble differs (port adds a "Ported from…" note and
  updates the count of consumers from "9 subagents and 10 mode-
  agents" to the actual 7+10 = 17 consumers after planner/fix drop).

## 6. D1 restoration verdict

Per-gap status from plan §3 functional gaps:

| §3 # | Gap | Restoration | Verdict |
|---|---|---|---|
| 1 | Telemetry writer (writer missing) | `telemetryHooks` flag on execute/finalize/triage/research/architect/review modes + executor/verifier/learner/plan-reviewer/reviewer subagents. Renders into a `## Telemetry` prelude listing each event with payload contract. | **Restored** |
| 2 | Vertical-slice planning guidance | `verticalSlice: true` on architect + execute modes + executor subagent. Renders into a `## Guidance` prelude. Body retains the "Wave Organization — Vertical Slices" prose verbatim. | **Restored** |
| 3 | TDD guidance (mostly dropped from executor) | `tdd: true` on execute + build modes + executor subagent. Renders into the `## Guidance` prelude with the no-tests caveat. | **Restored** |
| 4 | Postmortem analyzer (`luca retro` was hollow) | `pipelineInvocations: ['postmortem-generate']` on learner subagent + execute + finalize modes. Learner's Step 3 explicitly calls `luca retro postmortem`. | **Restored** |
| 5 | Repo-local rule engine | `pipelineInvocations: ['rule-run']` on executor + verifier subagents + execute + finalize modes. Execute mode's Step 2.5 explicitly gates on `luca rules run`. | **Restored** |
| 6 | Recurrence-driven rule promotion | Finalize Step 4.5 explicitly calls `luca rules suggest` to promote recurring pitfalls to draft rule packs. Pipeline-invocation declaration captures the boundary. | **Restored** |
| 7 | Claim verifier (pre-PR) | `pipelineInvocations: ['claim-verify']` on verifier subagent + execute + review + finalize modes. Verifier routes every claim through `luca claim-verify`; finalize Step 3c reconciles plan.md against the branch via the same gate. | **Restored** |
| 8 | Phase-diff empty-phase guard | Not in subagent/mode lens — this is a luca-core concern (Phase B). Out of scope for this reviewer. | (n/a) |

**Overall D1 restoration status: complete** for the 7 in-scope gaps
(#1-#7). #8 is out of scope for the subagent/mode lens.

## 7. Orphan drops confirmed

- **`planner` subagent**: confirmed NOT ported. No file at
  `packages/luca-tools/src/artifacts/subagents/planner.ts`. No
  `plannerSubagent` reference anywhere in `packages/luca-tools/src/`.
  The architect mode-agent now does the planning work directly, as
  the plan §5.1 disposition prescribed.
- **`fix` subagent**: confirmed NOT ported. No file. No reference
  anywhere. The mastracode `execute.md` body's reference to a `fix`
  subagent has been **correctly removed** from the ported
  `modes/execute.ts` body — the convergence-based fix strategy now
  spawns a fresh `executor` with a focused error set instead.
- **No stray references** in the ported artifact bodies. The only
  mentions of `planner` and `fix` in the codebase are in
  documentation files (`docs/repo-restructure-plan.md` discussing
  the §5.1 audit, the `subagents/index.ts` JSDoc explaining the
  drop, and the `executor.ts` / `modes/execute.ts` port JSDoc
  documenting the drop).

## 8. Phase H blockers (if any)

**None.** The subagent + mode port is in a clean, deletable state
relative to the mastracode source — every behavior worth preserving
is preserved (either verbatim or as a documented retargeting), every
D1 restoration target lands in the rendered output, and the
orphan drops are clean. The body-level fidelity is strong enough
that an external reviewer would have no incentive to recover the
mastracode source.

## 9. Carry-forward to v14

Non-blocking items. None of these justify holding up Phase H.

1. **Raw-capture safety net dropped from research + review modes.**
   The legacy modes had a "Capture Raw Findings" step that persisted
   raw subagent outputs to `*-capture-*.md` files BEFORE
   consolidation, as a safety net against OM-compressed context
   losing the raw output. The port assumes each subagent writes
   directly to its canonical contract path
   (`audits/<reviewer>.md`, `research.md`), making the capture step
   redundant. **Risk:** if a subagent OM-compresses its own output
   and the mode-agent re-reads from disk, the consolidation will see
   the compressed version. **Suggested follow-up:** add a
   `## Telemetry` event `raw-finding-captured` to give the
   aggregator visibility, OR resurrect the capture step as a
   `pre-consolidation` hook that copies the in-flight tool result.
   Severity: **low** (the canonical paths are durable; this is a
   belt-and-suspenders concern).

2. **shared-prefix dropped the detailed `record-subagent` prose.**
   The mastracode shared-prefix carried prose like "`record-subagent`
   complete: `success: true` for any `completed*` outcome…
   `durationMs` MUST be `Date.now() - ts`; omit if unmeasurable,
   never a guess." The D-3 port relies on the `telemetryHooks`
   factory flag to render the emission contract instead. **Risk:**
   the rendered `## Telemetry` prelude lists each event by name +
   carries a description, but does NOT prescribe the `success` /
   `durationMs` invariants at the bullet level. If a subagent
   skips the prefix and reads only the prelude, the invariants
   are lost. **Suggested follow-up:** extend `render-body.ts` so
   the `## Telemetry` bullet lists `success` (typed boolean), and
   `durationMs` (computed from `Date.now() - ts`) explicitly.
   Severity: **low**.

3. **`artifacts/index.ts` JSDoc says "7 subagents" but ships 8.**
   The top-level manifest JSDoc says "7 of them after dropping
   planner + fix" — the actual count is 8 (discussion, executor,
   learner, plan-reviewer, researcher, reviewer, shadow-scanner,
   verifier). One-character documentation drift. Severity: **trivial**.

4. **Skills under `artifacts/skills/` still carry uppercase
   ROADMAP.md / PROJECT.md / STATE.md references in their bodies.**
   This is out of my lens (the user-noted "subagents + modes" focus)
   but visible in the cross-cutting grep. Many of these skill bodies
   reference `cat .luca/ROADMAP.md`, `.luca/STATE.md`, etc., which
   conflict with the LUCA_DIR_CONTRACT lowercase-canonical names
   (`roadmap.md`, `state.json`). **Suggested follow-up:** another
   reviewer should audit `artifacts/skills/` body-level path
   fidelity end-to-end. Severity: **medium** if confirmed (this is
   user-facing prose that could mislead the agent).

5. **finalize body says "## Tool Coordination" is dropped vs
   legacy.** The legacy finalize.md had a `## Tool Coordination`
   section that listed the canonical luca CLI sequence. The port's
   finalize body has a "Tool Coordination" sub-section near the
   bottom — content preserved, structure compressed. Documented for
   completeness. Severity: **none**.

## 10. Recommendations

1. **Proceed with Phase H** for the subagent + mode surface. The
   parity is good enough to delete the mastracode subagents +
   modes + instructions without losing user-visible functionality.

2. **Add a v14 carry-forward issue** for items 1 + 2 in §9 (raw-
   capture safety net + explicit `success`/`durationMs` rendering in
   the `## Telemetry` prelude). These improve operational
   observability but don't gate the migration.

3. **Triage with reviewer 3/4** (skills/commands lens) whether item
   4 (uppercase ROADMAP.md refs in skill bodies) needs to land before
   Phase H or as a fast-follow.

4. **Trivial fix** for item 3 — bump "7 subagents" → "8 subagents"
   in `packages/luca-tools/src/artifacts/index.ts` JSDoc.
