# Phase 06 — Governance Audits — Learnings

**Phase:** 06-governance-audits (6/7, MODERATE) · milestone v13.0.0-pai-learnings (#295)
**Outcome:** verify PASS (cycle 1 + cycle 2) · review APPROVE (cycle 2) · D1–D6 shipped.

---

## 1. Pitfall — Presence/count probes cannot verify CLOSURE (existential-negative property)

**Type:** pitfall
**Concept:** pitfall:presence-probe-cannot-verify-enumeration-closure
**Confidence:** HIGH

**Content:** This phase is the canonical self-referential example: a governance AUDIT
whose entire deliverable (REQ-08) was a CLOSED enumeration of relaxation paths SHIPPED
WITH ITS OWN ENUMERATION GAP. Cycle-1 verify PASSED — every *cited* path was real
(ac-02 "doc-cites-gate-files ≥8" green) — but the code REVIEW (arch lens) caught that
the enumeration MISSED 4 real pipeline-reachable relaxations: `--skip-review` /
`workflow.code_review:false` and `--skip-uat` / `workflow.uat_required:false`, honored
by the phase-execute skill that /lu invokes (lu/index.ts:105 → Skill(phase-execute) →
index.ts:1234/1270/1609/1611).

**Root cause:** the verifier's probes were PRESENCE checks ("is every cited thing real?",
"are ≥N entries present?"). They cannot detect ABSENCE — a real relaxation path that
SHOULD be listed but isn't. Completeness/closure is an EXISTENTIAL-NEGATIVE property
("no unenumerated relaxation path exists"), which presence-greps structurally cannot
verify. Only an independent EXHAUSTIVE SOURCE SWEEP (grep every `--skip*`/`*_required`/
`*_enabled` token across all pipeline-reachable skills, then classify each as
enumerated-or-justified) can establish closure.

**Fix:** added the 4 paths + a completeness-sweep table classifying EVERY relaxation token
(including non-floors: loop controls, tribunal toggles — with rationale).

**Prevention:** for any "closed / complete / exhaustive enumeration" deliverable, the
acceptance criterion must be an EXHAUSTIVE SOURCE SWEEP (enumerate-the-universe-then-
classify-each), NOT a presence/count probe. The verifier must RUN that sweep
independently — never trust the audit's own "CLOSED" claim. Sibling to
pitfall:token-grep-criteria-miss-cli-runnability and
pitfall:meta-doc-asserting-system-mechanic-drifts (all three are "the probe verifies the
wrong property").

---

## 2. Pitfall — Strict-absence probes match NEGATIONS too

**Type:** pitfall
**Concept:** pitfall:absence-probe-matches-negation-mentions
**Confidence:** HIGH

**Content:** A token-absence acceptance criterion (`grep -cE "<token>" == 0`) matches
EVERY occurrence of the token — including a gotcha/warning that mentions it only to
FORBID it. Here the phantom-verb class recurred (6th milestone occurrence): a phase-05
gotcha literally saying "there is no `move-batch` verb" still tripped the strict
`grep -cE "move-batch" == 0` criterion. To satisfy a token-absence criterion the token
must VANISH ENTIRELY from the file — including from the very negation that documents its
non-existence. Reword the negation to avoid the literal (e.g. "no batch-move verb
exists") rather than spelling out the forbidden token.

**Prevention:** when writing strict-absence criteria, decide whether you mean "the token
is never USED" or "the token never APPEARS"; a raw `grep -c == 0` enforces the latter.
For "never used as a real command," anchor the pattern (e.g. require a command-position
context) instead of a bare substring.

---

## 3. Pattern — Human audit doc + static machine-checkable const as verifiable spine

**Type:** pattern
**Concept:** pattern:audit-doc-plus-static-const-spine
**Confidence:** HIGH

**Content:** For a one-time governance/enumeration audit, pair a human-readable audit doc
(narrative, rationale) with a static TS const (here RELAXATION_PATHS in
packages/luca-core/src/state/configs/relaxation-paths.ts) classifying each item — a plain
`as const`, NO Zod schema, NO new CLI verb. The const makes "closed enumeration" partly
machine-verifiable (count, type, source-resolution via grep-verified file:line) at the
right weight for a one-time artifact, without the ceremony of a runtime-validated config
or a dedicated command.

**When to use:** governance audits, capability matrices, any "enumerate-and-classify"
deliverable that benefits from a machine-checkable backbone but doesn't justify a CLI
surface.

**When NOT / guard:** the const must NOT be a strict SUBSET of the doc — that drift is
itself an enumeration gap. The review caught the doc listing `--force-complex`/`--gaps`
that the const omitted. Acceptance must cross-check doc↔const parity (every doc entry has
a const entry and vice versa), not just validate each in isolation.

---

## 4. Pitfall — Cross-phase staged-diff pollution causes false "scope expansion" flags

**Type:** pitfall
**Concept:** pitfall:cross-phase-staged-diff-review-pollution
**Confidence:** HIGH

**Content:** In a multi-phase run where commits are deferred (phases 5+6 staged-but-
uncommitted; user committed only through phase 4), the current phase's `git diff --cached`
includes PRIOR phases' staged work. The verifier twice flagged phase-05's gotchas
mechanism as "unplanned phase-06 scope expansion" — a FALSE POSITIVE from cross-phase
staged accumulation. A reviewer/verifier reviewing `git diff --cached` mid-run cannot
cleanly isolate the current phase's changes.

**Prevention:** scope reviewers/verifiers explicitly to the CURRENT phase's file list
(from the plan), and tell them prior-phase staged work is out of scope. Don't hand a raw
`git diff --cached` to a phase-scoped reviewer during a deferred-commit multi-phase run.

---

## 5. Decision — REQ-08/REQ-09 deliverable shape (repo-scoped)

**Type:** decision
**Concept:** decision:governance-floors-audit-deliverable-shape
**Confidence:** HIGH

**Content:**
- **REQ-08:** governance-floors audit shipped as docs/decisions/governance-floors-audit.md
  (narrative) + RELAXATION_PATHS static const — NO Zod, NO new CLI verb. Classifies every
  pipeline gate HARD vs SOFT with its relaxation path + grep-verified file:line. Scope
  boundary explicitly EXCLUDES init/`vault:init` gate setup (setup, not pipeline). Non-
  floor relaxations (loop controls, tribunal toggles) are classified-with-rationale rather
  than treated as floors.
- **REQ-09:** trimmed over-prescriptive "bitter-pilled" text from 7 bodies (review/
  architect/triage/execute/finalize modes + verifier/reviewer subagents) — removed
  ALL-CAPS banner stacking, redundant CRITICAL blocks, preachy rationale. PRESERVED all
  load-bearing constraints (anti-04 survival: review.ts criteria-grammar/deferred/
  verificationRef tokens unchanged). agent-constraints.ts untouched.
- **Phantom-verb fix (completes the phase-05 todo):** execute.ts/finalize.ts phantom
  `luca todo move`/`move-batch`/`retro postmortem gate` → real
  `luca todo update --status done --verification-criterion` / `luca retro` (exit code =
  gate). Resolved a finalize body-vs-gotcha self-contradiction.

**Context:** Luca repo (luca-framework). Combined-reviewer split verdict recurred a 3rd
time (arch+sec REQUEST_CHANGES on completeness; simp+dx APPROVE on trim quality) — the
completeness gap was an architecture/correctness catch the trim-focused dx lens didn't
make.
