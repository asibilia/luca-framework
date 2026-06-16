PERSPECTIVE: simplification
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] Near-verbatim lint-brief paragraph duplicated across two orchestrator-side surfaces, and the copies have ALREADY drifted: architect says "Criteria Quality Rules grammar" + adds "do not treat a clean lint as a substitute for review"; the skill copy says "criteria grammar" and omits that sentence. Both are template literals in the same package — extract one shared `LINT_BRIEF` const (luca-tools) interpolated into both bodies, or trim the skill copy to the command invocation + one pointer sentence.
  File: packages/luca-tools/src/artifacts/modes/architect.ts:344 vs packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:363
  Suggestion: Single exported constant interpolated into both BODY strings; drift becomes a type-level impossibility.
  Cross-phase: false
- [SHOULD-FIX] Within luca-cli alone, the "warn-only / always exits 0 / four regex checks / judgment stays instruction-side" prose is restated 4 times: handler JSDoc (luca-plan-lint.ts:166-182), tool `description` (luca-plan-lint.ts:186), the plan.ts file-header comment (plan.ts:1-16), and the lint command meta description (plan.ts:28-32). The plan.ts file header re-enumerates the full four-check list and the judgment-check carve-out already documented on the handler it imports — pure intra-package duplication that will drift when a fifth check lands.
  File: packages/luca-cli/src/commands/write-surface/plan.ts:1-16
  Suggestion: Cut the file header to 3 lines ("CLI group `luca plan`; `plan lint` is phase-agnostic; semantics documented on lucaPlanLintTool") and keep the check enumeration in exactly one place (the handler JSDoc, which the tool description and command meta can stay terse summaries of).
  Cross-phase: false
- [SHOULD-FIX] The phase-plan command's condensed rule mirror has drifted by omission: BODY restates the grammar, Splitting Test, and/with split, all/every/complete enumeration, and ≥1 anti-criterion, but drops Rule 3 entirely (ID-stability: ac-NN.M splits, never renumber, tombstones). Since this command path does inline planning by the orchestrator (per its own §"Produce the plan"), a plan revision through this flow has no ID-stability instruction in context. This is the cost of a hand-condensed mirror.
  File: packages/luca-tools/src/artifacts/commands/phase-plan.ts:34
  Suggestion: Either add a one-line ID-stability clause ("never renumber across revisions; splits become ac-NN.M, drops are tombstoned") or interpolate a shared condensed-rules constant rather than hand-paraphrasing.
  Cross-phase: false
- [SHOULD-FIX] The `.M`-sibling heuristic is more machinery than the question needs: it pre-collects ALL section IDs into `sectionIds`, then `hasSubCriteria` linearly scans the whole Set per quantifier hit (O(n) per check, plus a closure). The question is only "which base IDs have a dotted child" — one pass can build that set directly.
  File: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:93-103
  Suggestion: Replace with `const basesWithSubs = new Set<string>()` populated in the same pre-pass via `if (id.includes('.')) basesWithSubs.add(id.slice(0, id.indexOf('.')))`; the exemption check becomes `basesWithSubs.has(id)` — deletes the `hasSubCriteria` closure and the inner loop.
  Cross-phase: false
- [NOTE] The phase-plan skill's `downstream_consumer` brief (index.ts:307-309) restates the grammar to a Task targeting `subagent_type="luca: Architect"`, whose own mode body already carries the full canonical Criteria Quality Rules (architect.ts:227-240). Content-redundant, but at 3 lines it is a cheap prompt-side anchor; keep, watch for drift (it already adds its own paraphrase "never renumber across revisions (splits become ac-NN.M)").
- [NOTE] `void ctx` at luca-plan-lint.ts:205 is the only occurrence of this pattern in the handlers directory (verified via grep), and it sits oddly after the try/catch rather than at function top. Use `_ctx` in the signature or place the void first for consistency.

DUPLICATION JUDGMENT (the core question asked):
Most of the 10 surfaces are load-bearing mirrors, NOT reducible to "see architect" references, because of consumption topology: plan-reviewer.ts:71-73,85 and verifier.ts:85-88 are cold-isolated subagent bodies — a cross-reference to the architect body would dangle (subagents receive only their own body). review.ts:73, execute.ts:255, phase-execute/index.ts:1638, and quick/index.ts:131 are each a single consumption-side sentence stating only what that consumer needs (consume verbatim / never mint / tombstones out of scope) — minimal, correctly scoped, not worth abstracting. The reducible duplication is confined to the three SHOULD-FIX items above: same-package template-literal copies (architect↔phase-plan-skill lint brief; luca-cli 4× lint semantics) and one hand-condensed mirror that has already lost a rule (phase-plan command). The canonical statement correctly lives once, in architect.ts:227-240, and pins the lint regexes explicitly ("do not vary it").

WHAT WAS CHECKED FOR APPROVE (verified locations):
1. architect.ts:227-240 — canonical Criteria Quality Rules; grammar literals match the lint regexes in luca-plan-lint.ts:21-33 exactly (`- **ac-NN**:`, `- **anti-NN**: MUST NOT —`, `## Verification Criteria` heading).
2. luca-plan-lint.ts:86-164 — lint logic is appropriately minimal: 5 small regexes, section-scoped checks (a)-(c), file-scoped (d); judgment checks correctly excluded (JSDoc 177-181) and delegated to plan-reviewer.ts:71. No over-engineering beyond the .M-sibling note above.
3. plan.ts:25-59 + cli.ts:51-54 + write-surface/index.ts:55 — no dead weight in the new group: `lucaPlanLintTool` is exported once, imported once, registered once; the single-subcommand `plan` group matches the existing noun-group pattern (state/phase/roadmap/todo siblings in cli.ts:43-68).
4. verifier.ts:85-88 / plan-reviewer.ts:71-73 — inline duplication confirmed load-bearing (isolated subagent context), and the two bodies state complementary halves (consumption vs authoring review), not copies.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 4
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
