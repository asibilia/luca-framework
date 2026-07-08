# DAD-P0 — Hygiene & Dangling-Reference Repair — Learnings

Phase `01-dad-p0-hygiene` · Trace DAD-P0 · Phase 1 of 7 (XState statechart migration).
No-behavior-change prose hygiene: excised ~354 net lines of dead `src/iteration/*` +
`context-monitor.ts` toolkit machinery from `phase-execute/index.ts`, repaired the
nonexistent `iterationPlan` field reference in `execute.ts`, and reconciled (not retired)
the `architect` double-definition. Outcome: 14/14 ac, 4/4 anti, tsc green, code-review +
dx both APPROVE, 0 must-fix. One accepted deviation (delete-block → slim-replace).

---

## pitfall:delete-block-severs-inbound-cross-refs

**Confidence: HIGH**

- **Conjectured:** context.md Decision 1 locked "delete-block" for the dead §6.6 Loop A /
  §7.5 Loop B machinery — the prose is non-executable so pure deletion loses zero behavior.
- **Refuted by:** the deleted `§6.6`/`§7.5` headers were *inbound-referenced anchors*.
  Live sections at `phase-execute/index.ts:548/718/831/875` say "→ Step 6.6" / "→ Step 7.5".
  A literal delete-block would have turned those live pointers into NEW dangling
  cross-references — trading one hygiene defect for another (verify.json notes; code-review
  evidence #2).
- **Learned:** when a dead block is *also a referenced section anchor*, delete-AND-replace
  with slim prose that preserves the header/anchor — not pure deletion. The executor kept
  ~45-line bounded-loop stubs at §6.6/§7.5 encoding the same convergence contract execute-mode
  already carries, so inbound pointers still resolve. Reviewers judged this MORE correct than
  the locked decision, not merely acceptable.
- **Criterion now:** before deleting a prose block, grep the whole file for references to its
  section number / anchor (`→ Step N`, "see §N"). If any inbound pointer exists, slim-replace
  preserving the anchor; only pure-delete truly orphan blocks with zero inbound refs.

---

## process:stage-gate-blocks-bash-mutate-in-coarse-phases

**Confidence: HIGH**

- **Conjectured:** verification probes written as shell (`grep`, `git diff`, `bun test`) can be
  executed as-authored during the REVIEWING/verify step.
- **Refuted by:** the Luca stage-gate hook classifies `git`/`grep`/`cat`/`bun test` as
  `bash-mutate` and BLOCKS them during PLANNING and REVIEWING coarse phases. verify.json ac-11 /
  ac-12 (`bun test …`) were `STAGE-GATE-SUBSTITUTED` — the command never ran.
- **Learned:** in PLANNING/REVIEWING, inspect files with the **Read tool**, not bash. For a
  blocked test that is a *pure token-presence check* (readFileSync + toContain), faithfully
  re-execute its exact assertions by Read-grepping every required token over the same target
  files — that hand-check IS the assertion, not a weaker substitute. Defer genuine
  git/grep/exec verification to EXECUTING (execute/checks), where bash is permitted.
- **Criterion now:** author acceptance probes so their EVIDENCE is reproducible via Read in the
  step that verifies them; for any `bun test`/`git` probe, confirm the test is a pure
  file-token check (structurally re-executable) or route it to an EXECUTING check.

---

## pitfall:gitignored-generated-dir-defeats-git-diff-guard

**Confidence: HIGH**

- **Conjectured:** a "MUST NOT edit generated `dist/**`" guard can be an anti-criterion that
  asserts `dist/**` is absent from `git diff --name-only`.
- **Refuted by:** `packages/luca/dist/**` is gitignored (`.gitignore:6`), so it NEVER appears in
  a diff regardless of whether it was hand-edited — the git-diff probe is a vacuous no-op that
  passes even under violation (plan.md anti-01 note).
- **Learned:** for gitignored generated output, the git-diff guard is worthless. The real check
  is an ON-DISK grep of the generated dir AFTER rebuild, confirming the source fix propagated
  and no dangling tokens survive (ac-13: `grep -rn … packages/luca/dist/claude` = 0, plus the
  fresh marker present proves a real rebuild happened).
- **Criterion now:** never guard a gitignored path with a diff-name probe. Verify generated
  output by (a) editing source, (b) rebuilding, (c) on-disk grep of the built dir for both the
  cleared token (=0) AND a freshly-introduced marker (present) to prove the rebuild ran.

---

## pattern:hygiene-phase-grep-symbol-plus-per-path-anti-probes

**Confidence: HIGH**

- **Conjectured:** for instruction-body edits inside `.ts` template literals, `tsc --noEmit`
  is the behavioral gate.
- **Refuted by:** these edits live inside `BODY = \`…\`` template strings, so tsc only proves
  "the string still parses" — it cannot detect a wrong/missing token, a severed cross-ref, or
  scope creep. The load-bearing guards were grep-symbol acceptance criteria (token present/absent)
  plus git-diff path-confinement anti-criteria.
- **Learned:** for no-behavior-change hygiene on prose/instruction bodies, encode intent as
  grep-symbol ac (`grep -c token` = expected count) and scope-confinement anti-criteria. Use a
  pinned literal marker string (ac-05: `dual-surface: standalone mode-agent vs. /lu architect
  step`) so a documentation edit is verifiable by fixed-token grep. CRUCIAL: a prefix-confinement
  anti-probe fails silently when the forbidden file lives INSIDE the allowed prefix (e.g.
  `triage.ts` sits inside the edited `modes/` dir) — so use EXPLICIT per-path probes
  (anti-03 names `triage.ts` literally), never a bare prefix allow/deny.
- **When to use:** any prose/template-literal hygiene phase where tsc is the only compiler gate.
- **When NOT:** logic changes with runtime behavior — grep-symbol is necessary but not sufficient.

---

## decision:architect-reconcile-not-retire (repo-scoped)

**Confidence: HIGH**

- **Conjectured:** the `architect` "double-definition" (465-line standalone `architectMode`
  planner vs. thin inline `/lu` `architect` synthesis step) is stale drift to retire.
- **Refuted by:** `architectMode` is LIVE — registered in `MODES` (`modes/index.ts`), the SOLE
  re-plan path invoked by `phase-execute`/`quick`/`session-plan`/`project-new`, and guarded by
  `record-recall.test.ts` (hard-codes `MODES = [triage, architect, execute, review, finalize]`).
  Retiring would break the manifest, the re-plan path, and the test (research.md Criterion 2).
- **Learned:** reconcile-not-retire — add a dual-surface disambiguation note (header comment +
  one `>` line in BODY with a pinned marker) distinguishing the standalone full-planning
  mode-agent from the thin no-write `/lu` step, and align the `/lu` step-table wording so the
  step row no longer implies it writes `plan.md`. A true retire/rename is GATED on the decomposed
  `discuss`/`plan`/`plan-review` steps being able to serve the re-plan cycle (later-phase work).
- **Criterion now:** before retiring any "duplicate" mode-agent, grep `MODES` registration + all
  skill call-sites + `*.test.ts` for the id; if any live consumer exists, reconcile and defer
  retire behind an explicit precondition. The parallel `triage` double-definition has the same
  shape and the same deferral.

---

## procedure:dangling-token-repair-in-generated-artifact-monorepo

**Confidence: HIGH**

- **Trigger:** a dangling reference token (nonexistent file/field/CLI verb) appears across a
  monorepo where source is `.ts` template literals and generated output ships to `dist/**`.
- **Steps:** 1) repo-wide grep the token, classify every hit as source / generated / historical.
  2) Edit ONLY source (`packages/*/src/**`). 3) Leave historical (CHANGELOG, `docs/archive/**`,
  `.luca/archive/**`) — that's a record, not live instruction. 4) Never hand-edit `dist/**`;
  rebuild so it regenerates. 5) Verify with on-disk grep of the built dir (token=0 + fresh marker
  present) — NOT a git-diff (dist is gitignored). 6) Gate `tsc --noEmit` + bounded token-check
  tests only.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Recurring failure themes:** none. No `failure-dump` and no low-confidence entries this run.
  typecheck + record-recall (10/0) + finalize (6/0) all green first try.
- **Satisfaction valence trends:** uniformly positive across every pipeline step —
  `satisfaction:outcome` positive at checks, verify (14/14 ac, 4/4 anti), and review
  (code-review + dx both APPROVE, 0 must-fix). No negative-valence step; no friction hotspot.
- **Confidence journal:** empty — plan authored directly by the orchestrator under full-auto,
  so no architect mode-agent confidence entries were logged. Not a gap in the work; an artifact
  of the full-auto authoring path (worth noting for later phases that DO route through
  mode-agents, where confidence entries should reappear).
- **Cross-cutting pattern:** the single accepted deviation (`deviation:accepted` — delete-block →
  slim-replace preserving anchors) is the phase's highest-value reusable win and is promoted to
  `pitfall:delete-block-severs-inbound-cross-refs` above. A clean first-pass run with one
  well-reasoned deviation and zero failures is the signal profile of a well-scoped hygiene phase.
