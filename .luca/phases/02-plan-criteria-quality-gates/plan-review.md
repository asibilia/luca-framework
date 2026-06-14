# Plan Review: 02-plan-criteria-quality-gates

**Status:** APPROVED · **Convergence:** CONVERGED (B(1)=2 → B(2)=0) · **Rounds:** 2
**Plan:** plan.md revision 2 (95 lines; 3 waves, 8 tasks, 17 criteria incl. splits ac-03.1/ac-07.1/ac-09.1/ac-10.1, 4 anti-criteria)

## Round 1 — NEEDS_REVISION (2 blocking, 5 advisory)

| ID | Sev | Finding | Resolution (verified round 2) |
|---|---|---|---|
| G-CRIT-001 | BLOCKING | ac-10 only asserted lint exit-0 on the phase's own plan — a no-op handler passes; zero detection-path coverage for the 4 regex checks | ac-10.1: fixture with compound ' and ' + zero anti lines → ≥2 warnings, exit 0 |
| G-DX-001 | BLOCKING | Lint task understated registration surface | Task 1.2.3 enumerates all 5 touch-points: handler, write-surface/index.ts export, NEW commands/write-surface/plan.ts noun-group with rejectUnknownFlags, cli.ts subCommands, barrel. Confirmed no existing `plan` group; no file collision with other tasks |
| G-CRIT-002 | advisory | ac-03/ac-07 bundled two independently-failable assertions each | Split → ac-03/ac-03.1, ac-07/ac-07.1 (no renumbering) |
| G-CRIT-003 | advisory | Criterion line grammar unpinned — authoring format and lint regexes would drift day one | Canonical grammar pinned in Task 1.1.1 (`- **ac-NN**: <probe>` / `- **anti-NN**: MUST NOT — <guard + probe>`); lint keyed to it; plan's own anti lines rewritten to match |
| G-SCOPE-001 | advisory | Missed sync surfaces (phase-execute:1638, quick:131) | Added to Task 1.2.1 with ac-09.1 (discrimination-probed: zero pre-existing `ac-` matches) |
| G-DX-002 | advisory | anti-03 (no commits) had no probe | `git log -1 --format=%H` unchanged before/after; bun-test marked behavioral-only |
| G-DX-003 | advisory | ac-13 listing order | Reordered (ID unchanged) |

## Round 2 — APPROVED (0 blocking, 2 advisory for executor)

All criteria discrimination-probed (no grep criterion trivially passes pre-edit). ID-stability respected in the revision itself. Remaining executor-absorbable advisories:
- G-DX-004: Task 1.1.1 stale phrase "`Anti:` entries" → use "anti-NN entries" (pinned grammar is authoritative).
- G-DX-005: ac-10.1 fixture must NOT land in .luca/ (tmp is .json-only) or repo root — use $(mktemp) or stdin.

## Cycle 2 (wave 4 fix addendum) — Rounds 1-2

**Round 1 — NEEDS_REVISION (1 blocking, 3 advisory)** on plan revision 3:
- G-SCOPE-002 [BLOCKING]: tombstone + lint-justification text referenced a `decisions/notes` destination absent from the plan template → 1.4.4 adds minimal `## Decisions` section + ac-26 (0-match pre-state verified).
- G-CRIT-004: [SPLIT lint-exemption element was dead code (as-built linter already passes pointer lines); ac-22 content-replaced ID-stable with round-trip fixture probe (now guards 1.4.3's lint edits against split-convention regression).
- G-DX-006: plan.ts:4-5 absence-as-design comment false after explicit [] entry → folded into 1.4.3.
- G-ARCH-002: review.ts liveness clause widened "non-tombstoned, non-split-parent" → 1.4.4 + ac-27 (0-match pre-state).
- Also verified round 1: ac-14 classifier probe discriminating (pre-fix trace: plan noun absent → bash-mutate → PLANNING denies; post-fix bash-readonly allowed); audit coverage map complete except the blocker.

**Round 2 — APPROVED, CONVERGED (B(1)=1 → B(2)=0)** on revision 4 (138 lines; 4 waves, 14 tasks, 31 criteria, 4 anti). Wave-4 file sets pairwise disjoint after rescope (1.4.4 dropped luca-plan-lint.ts); frontmatter reconciles; no new gaps. Clear to execute wave 4.

## Confidence Gate Resolutions

All 5 plan-time entries auto (Q1 ID convention high; Q2 placement, Q3 lint-as-CLI-warn-only, Q4 budget-exemption medium; tombstone-exclusion high). counts: research=0, ask=0. No researcher spawns, no user asks. (Cycle 2: no new plan-time entries; execution-time entries from waves 1-3 are high/medium → auto.)
