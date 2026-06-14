PERSPECTIVE: architecture
VERDICT: APPROVE
FINDINGS:
- [MUST-FIX] (cycle 1 — RESOLVED in wave 4, see Cycle 2 below) `luca plan lint` is blocked by the stage-gate hook in exactly the pipeline step where the instructions mandate it. The new `plan` noun is registered in `cli.ts` (lazy import, packages/luca-cli/src/cli.ts:51-54) but NOT added to `LUCA_NOUN_VERBS` (packages/luca-cli/src/hook/helpers/classify-bash-command.ts:230-248), nor to `LUCA_TOPLEVEL_READ`/`LUCA_TOPLEVEL_WRITE` (:199, :206). `classifyLucaCommand` therefore returns `undefined` for `luca plan lint …` and the call falls through to "generic classification (conservative bash-mutate)" (:476-477). `STAGE_TOOL_MATRIX.PLANNING['bash-mutate'] = false` (packages/luca-core/src/state/configs/stage-tool-matrix.ts:52) and `plan`/`plan-review` map to PLANNING (coarse-phase-map.ts:15-16) — so the Bash invocation is denied. But architect.ts Step 5 "Pre-Review Lint" (modes/architect.ts:338-344) and the phase-plan skill Step 10 (skills/phase-plan/index.ts:357-363) both instruct running `luca plan lint` during plan/plan-review. The classifier's own comment (:228-229, "Mirrors the noun-group commands registered in src/cli.ts") and the documented prior failure mode (:195-198, "fell through to the unknown-command → bash-mutate path and got blocked at plan/REVIEWING") confirm this is a known trap that this delta walked into.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:230
  Suggestion: Add `plan: new Set(['lint'])` to `LUCA_NOUN_VERBS` and add `'lint'` to `LUCA_READ_VERBS` (:217-226) — the linter is a pure read and should classify `bash-readonly`.
  Cross-phase: true
- [SHOULD-FIX] (cycle 1 — DEFERRED, accepted; see Cycle 2 below) The criterion grammar is restated as free prose on ~7 instruction surfaces with no shared constant and no sync-comment network: modes/architect.ts:230-240 (self-declared canonical "exact literals" block), subagents/plan-reviewer.ts:71-73, subagents/verifier.ts:85-88, modes/review.ts:73-82, modes/execute.ts:255, commands/phase-plan.ts:34, skills/phase-plan/index.ts:307-310+399, skills/quick/index.ts:131. Only architect.ts marks itself canonical; nothing points the other six back at it (contrast architect.ts:389, which DOES carry a keep-in-sync mirror note for the confidence triggers). The repo already has the right seam — shared interpolated snippets in `artifacts/shared/` (`CORE_OPERATING_RULES`, `SUBAGENT_SHARED_PREFIX`, `INPHASE_TERSENESS_DIRECTIVE`, used at e.g. skills/phase-plan/index.ts:19). A `CRITERIA_GRAMMAR` (and optionally a `TOMBSTONE_RULE`) constant interpolated into each BODY would collapse the drift surface from 7 to 1; the lint regexes in luca-plan-lint.ts stay separate (executable encoding) but would then key to one prose source instead of seven.
  File: packages/luca-tools/src/artifacts/shared/index.ts:1
  Suggestion: Extract the canonical grammar block (architect.ts:230-240) into a shared exported constant in `artifacts/shared/` and interpolate it into the architect/plan-reviewer/verifier/review/execute/command/skill bodies, keeping per-surface text to the role-specific consumption rules.
  Cross-phase: false
- [SHOULD-FIX] (cycle 1 — RESOLVED in wave 4, see Cycle 2 below) `plan lint` is absent from `WRITE_COMMAND_PHASES` rather than mapped to `[]`. The table's docblock defines the phase-agnostic representation as an explicit `[]` entry (packages/luca-core/src/state/configs/step-artifacts.ts:67-69: "A verb mapped to `[]` is intentionally phase-agnostic"), and every other phase-agnostic verb is listed (:76-95). `runWriteHandler` treats `undefined` and `[]` identically (run-handler.ts:53-66), so this works at runtime, but plan.ts:4-5 codifies absence-as-design, which silently demotes the table from "complete registry of the v13 surface" to "partial registry" — any future consumer that iterates the table (docs generation, allowlist derivation like LUCA_NOUN_VERBS) will miss `plan lint`.
  File: packages/luca-core/src/state/configs/step-artifacts.ts:95
  Suggestion: Add `'plan lint': []` under the read-only group and update the plan.ts comment to cite the explicit empty entry.
  Cross-phase: true
- [NOTE] Noun-group asymmetry: plan.md is written via `luca phase write-plan` (phase noun) but linted via `luca plan lint` (new plan noun). Defensible — `plan` groups advisory tooling, `phase` groups artifact lifecycle — but worth a one-line rationale in plan.ts's header so the next verb lands in the right group.
- [NOTE] Handler placement in `write-surface/handlers/` is acceptable by precedent: the read-only pr-review analyzers (`lucaPrReviewDetectConvergenceTool`, `lucaPrReviewFilterStaleTool`, `lucaPrReviewRegressionCheckTool`, barrel index.ts:56-58) already live there, and the ToolDescriptor/runWriteHandler plumbing is the shared seam. The directory name "write-surface" is a growing misnomer for read-only tools, but renaming is out of scope here.
- [NOTE] (cycle 1 — partially addressed by wave 4 backtick masking; see Cycle 2) Known warn-only false positives: `COMPOUND_CONNECTIVE` fires on legitimately atomic prose criteria such as "exits 0 with no output" (` with `). Acceptable for an advisory linter — the handler docs correctly scope judgment to the plan-reviewer — but expect some noise on real plans.

Verified-sound (evidence for the non-findings, cycle 1):
- Tombstone-exclusion contract is coherent end-to-end: verifier excludes tombstones from the verify.json criteria array with documented rationale (subagents/verifier.ts:87); review mode excludes them from coverage and documents the `CRITERION_NOT_FOUND` rejection as correct behavior (modes/review.ts:80-82); execute mode scopes them out at wave verification (modes/execute.ts:255); and `validateVerificationRef` does exact-match on `criterionId` against that array returning `CRITERION_NOT_FOUND` (packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts:78-88) — the error-code name in the instruction prose matches the code literal exactly.
- The lint section parser correctly keeps the `### Anti-criteria` subsection inside the `## Verification Criteria` range: the terminator regex `/^##\s/` does not match `### ` (third char is `#`, not whitespace), so anti-NN lines stay in scope for checks (a)-(c) while check (d) is deliberately whole-file.
- The 4 regexes match the pinned grammar literals in architect.ts exactly (`- **ac-NN**:` / `- **anti-NN**:` with optional `.M`), and per-task `- Verification: ac-03` reference lines cannot false-positive check (a) since they lack the `- **` prefix (luca-plan-lint.ts:21).
- Barrel + CLI wiring is complete on the command path: handler exported (write-surface/index.ts:55), noun command exported (commands/write-surface/index.ts:11), lazy-registered in cli.ts:51-54, with `rejectUnknownFlags` + `runWriteHandler` used per the leaf-command convention.

---

## Cycle 2 — Re-review of wave 4 fixes (staged)

VERDICT: APPROVE

### Fix verification

1. **MUST-FIX (classifier) — RESOLVED.** `plan: new Set(['lint'])` is present in `LUCA_NOUN_VERBS` with a noun-level comment (packages/luca-cli/src/hook/helpers/classify-bash-command.ts:249-250) and `'lint'` is in `LUCA_READ_VERBS` (:226). Trace: `luca plan lint --file …` → noun `plan` resolves a verb set (:276), verb `lint` is a member (:287), `LUCA_READ_VERBS.has('lint')` → `bash-readonly` (:296), which every `STAGE_TOOL_MATRIX` row allows including PLANNING (stage-tool-matrix.ts:51). The architect Step 5 / phase-plan skill Step 10 invocations now pass the gate.

2. **Over-grant check — NO over-grant.** `LUCA_READ_VERBS` is consulted ONLY after noun-set membership passes: the verb must first be in `LUCA_NOUN_VERBS[noun]` (:287) before the read/write split at :296. A hypothetical `luca state lint` hits the unknown-verb branch (:287-294) and classifies `luca-write` (conservative, self-enforced), NOT `bash-readonly` — `'lint'` in the global read set has no effect on any noun whose verb set lacks `lint`, and today only `plan` carries it. Redirect safety also preserved: `luca plan lint > file` still classifies `bash-mutate` via the redirect override (classify-bash-command.ts:468-473). Latent (pre-existing, not new): the read-verb set is global by NAME, so a future noun adding a *mutating* verb spelled `lint`/`read`/`list` would silently classify read-only — a property the table already had before this change; noted, not a finding.

3. **SHOULD-FIX (registry) — RESOLVED.** `'plan lint': []` is an explicit entry in `WRITE_COMMAND_PHASES` under the read-only group, with a comment codifying that absence is NOT the same as `[]` (packages/luca-core/src/state/configs/step-artifacts.ts:84-87). `runWriteHandler` skips the phase check for empty entries (run-handler.ts:56, `allowedPhases.length > 0` guard) — allowed in any pipelineStep, matching the docblock convention (:67-69). The plan.ts header comment is re-attributed to the explicit entry (commands/write-surface/plan.ts:4-6). Table is a complete registry again.

4. **SHOULD-FIX (grammar-constant extraction) — DEFERRAL ACCEPTED.** Recorded in the plan's `## Non-Goals (deferred — follow-up todo to be filed)` (.luca/phases/02-plan-criteria-quality-gates/plan.md:130-131: "shared CRITERIA_GRAMMAR constant extraction (artifacts/shared/)"). Acceptable: the duplication is a drift *risk*, not a present defect — this cycle's split-parent addition was propagated consistently (see 5), demonstrating the manual sync is currently holding. The deferral is legitimate provided the follow-up todo is actually filed at phase close.

### Broader wave-4 changes verified

5. **Split-parent fate — consistent across all three contract surfaces.** Authoring: architect.ts:246 defines `- **ac-NN**: [SPLIT → ac-NN.1, ac-NN.2]` pointer lines "excluded from verify.json exactly like tombstones", with the template showing the pattern (architect.ts:217-219). Consumption: verifier.ts:87 excludes split-parent pointers from the criteria array, "only the live ac-NN.M children get entries". Coverage/refs: review.ts:82 extends the live-id rule to "non-tombstoned, non-split-parent", documents the `CRITERION_NOT_FOUND` rejection for split-parent ids as correct-by-design, and tells the agent to re-point at an `ac-NN.M` child. `validateVerificationRef` needs no change — exclusion from the array makes exact-match rejection automatic (validate-verification-ref.ts:78-88). Sound. Lint interplay also clean: a `[SPLIT → …]` line has a well-formed ID (no check-a hit), no connectives in the marker text (no check-b hit), and is exempt from check-c via the `hasSubCriteria` sibling test since its `.M` children exist (luca-plan-lint.ts:136-141, :180).

6. **`## Decisions` template section** added to the architect plan template (architect.ts:227-230) — gives `[DROPPED — see decisions <date>]` tombstone references and lint-warning justifications a canonical landing spot inside plan.md, closing the previously dangling "see decisions" pointer.

7. **Lint robustness** — `maskInlineCodeSpans` (luca-plan-lint.ts:44-49) blanks backtick-span interiors length-preserving and is applied to prose checks (b)/(c) only (:161) while check (a) still sees the raw line (correct — the ID prefix is outside any code span); `COMPOUND_CONNECTIVE` is now `/i` (:30); `sanitizeControlChars` (:61-66) escapes C0/DEL in the echoed file path and error message on every output path (:233, :242, :254, :257), preventing newline/ANSI injection into the warning stream. This resolves the backticked-command half of cycle-1 NOTE 3; the prose ` with ` false positive remains by design (warn-only).

### Residual (NOTE, non-blocking)

- [NOTE] execute.ts:255 was updated for tombstones ("entries tombstoned `[DROPPED — …]` are out of scope") but does not mention split-parent `[SPLIT → …]` pointer lines, unlike architect/verifier/review. Low risk — the verifier subagent (the actual verify.json producer that execute spawns) carries the full exclusion rule — but it is exactly the per-surface drift the deferred `CRITERIA_GRAMMAR` extraction would eliminate; fold the one-line fix into that follow-up.
  File: packages/luca-tools/src/artifacts/modes/execute.ts:255
  Suggestion: Append "and split-parent pointers `[SPLIT → ac-NN.M, …]`" to the out-of-scope clause when the shared-constant follow-up lands.
  Cross-phase: false

### Cycle 2 evidence locations (APPROVE basis)

1. packages/luca-cli/src/hook/helpers/classify-bash-command.ts:226, :249-250, :287-296 — fix present; classification trace and over-grant analysis.
2. packages/luca-core/src/state/configs/step-artifacts.ts:84-87 + packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts:56 — explicit registry entry with correct empty-set semantics.
3. packages/luca-tools/src/artifacts/modes/architect.ts:217-219, :227-230, :246 / subagents/verifier.ts:87 / modes/review.ts:82 — split-parent contract consistent across authoring, verification, and coverage surfaces.
4. packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:30, :44-49, :61-66, :161, :233-257 — masking, case-insensitivity, and output sanitization verified in code.
5. .luca/phases/02-plan-criteria-quality-gates/plan.md:130-131 — grammar-extraction deferral recorded in Non-Goals.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 0
