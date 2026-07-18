# Research — #320 reduce per-phase review fan-out cost

## The finding
Per-phase review spawns N cold reviewer subagents each independently loading the changed-file contents, plus a convergence re-review loop that runs a full second round (N reviewers + verifier) every phase even when the fix was a no-op. In one $128 turn, review fan-out was ~67% of spend (419 LLM calls).

## Grounded surfaces (exact anchors)

### Review fan-out defined in THREE overlapping bodies
- **`skills/phase-execute/index.ts:868-1093`** (Step 8, richest/legacy orchestrator): L896 "Always spawn ALL reviewers"; L914 "Spawn ALL applicable reviewers in a SINGLE message … PARALLEL." Perspectives via `Task(subagent_type="Code Reviewer")`: dx (933-963), simplification (965-994), architecture (996-1025), test-quality (1027-1056), security cond. (1058-1089); + independence auditor Step 8.6 (1168-1200); tribunal 8.5 (1097-1139), 7.25 (710-819).
- **`modes/execute.ts:272-282`** (Step 4, machine-driven): "Spawn 4 reviewer subagents in parallel … Architecture / DX / Security / Simplification."
- **`modes/review.ts:87-97`** (Step 4, machine-driven) + **`skills/lu-review/index.ts:29-39`**: 5 reviewers (Arch, DX, Security, Simplification, Test Quality), complexity-scaled (TRIVIAL/SIMPLE may run only architect+security; MODERATE+ full set).
- Reviewer subagent `subagents/reviewer.ts:16-40`: 7 perspectives defined; `allowedTools: [Read,Grep,Glob,Write]` — does its OWN file reads.

### Cold isolation + cross-perspective independence are LOAD-BEARING (keep)
- `phase-execute:51-57` isolation table: cold = "Only git diff + project identity".
- `phase-execute:916-922`: cold reviewers get NO workflow/session/learnings — "prevents reviewer bias from executor session context."
- `phase-execute:1166`: independence auditor sees NONE of other reviewers' findings — "prevents anchoring on prior reviewers' conclusions."
- `reviewer.ts:85-89`: "independence plus cold isolation APPROXIMATES a cross-vendor review by denying you the shared context that homogenizes the other reviewers."
- `packages/luca-core/src/review-analysis/convergence.ts:180-237`: auto-promotes severity to must-fix ONLY when ≥2 DISTINCT perspectives flag the same location (`convergentGroups = groups.filter(g => g.perspectives.length >= 2)`, L190). **Structurally depends on independent perspectives.**

### Convergence re-review loop
- Loop edges `packages/luca-core/src/state/machine/actions.ts:57-78` (`FIX_LOOP_EDGES`): `review->execute` increments `reviewIteration` (cap `maxReviewIterations`); `review->learn` resets.
- Routing `review.ts:234-241`: Route A (no MUST-FIX AND no SHOULD-FIX) → `learn`; Route B (any MUST-FIX OR SHOULD-FIX) → back to `execute` if within `maxReviewIterations`.
- Iteration matrix `packages/luca-core/src/state/configs/budget-matrix.ts:23-79`: `maxReviewIterations` TRIVIAL 1 / SIMPLE 1 / MODERATE 2 / COMPLEX 2 / CRITICAL 3.
- **Existing gates:** (a) findings-exist (Route A skips), (b) complexity (TRIVIAL/SIMPLE can't loop). **NOT gated on whether the fix touched the flagged locations** → the #320 gap: any SHOULD-FIX at MODERATE+ forces a full round-2 of all reviewers + re-verify, even on a no-op/unrelated fix.

### Diff provisioning — no shared artifact exists
- Orchestrator runs `git diff --name-only` once (`phase-execute:876-879`, `review.ts:62`), passes `{CHANGED_FILES}` inline; each cold reviewer independently `Read`s the files. No precomputed-diff input artifact; no cross-subagent shared context (separate contexts, no MCP).
- (Corrects #320 wording: bodies don't literally say `git show <hash>`; net cost is identical — N contexts each load changed-file contents.)

## Lever analysis

| Lever | Attacks | Token payoff | Quality risk |
|---|---|---|---|
| **1a** shared precomputed diff artifact | tool-call COUNT (not tokens) | Modest — collapses N redundant git/Read calls toward 1 prep + 1 bounded read each; bounds exploratory Greps. Zero ×N token cut (separate contexts each still load the diff). | **None** (independence preserved). Contract-legal: `.luca/tmp/<kebab>.json` per `luca-dir/configs.ts:140-145`, like `checks.json`. |
| **1b** consolidate to ONE multi-perspective reviewer | `N_reviewers` (5→1 per round) | **Largest** raw-token cut (diff loaded once). | **REAL REGRESSION** — kills cross-perspective independence → `convergence.ts:190` ≥2-perspective promotion dies; kills independence auditor; sequential in-context anchoring bias (the exact thing cold isolation prevents). Only defensible gated to TRIVIAL/SIMPLE. |
| **2** gate the convergence re-review + re-verify on a relevant-diff signal | `review_rounds` (2→1 when fix is no-op/irrelevant) | **High, safe** — removes a full wasted round (N reviewers + verifier) per affected phase. | **None** — re-reviewing an unchanged/irrelevant diff cannot surface anything new. |

### Lever-2 gating mechanism (feasible)
- Capture pre-fix HEAD SHA when routing `review->execute` (small state.json addition; counters already threaded via `PipelineContext`, `machine-verdict.ts:110-120`).
- On re-entry to review: `git diff <pre-fix-sha>..HEAD --name-only`. Empty ⇒ no-op ⇒ skip re-review + re-verify. Non-empty ⇒ intersect changed paths with the `File: {path:line}` locations cited in prior MUST-FIX `audits/<reviewer>.md` (`reviewer.ts:122-137`); no overlap ⇒ skip or scope re-review to affected audits only.
- Precedent: gh-pr-address already "computes touched paths from the SHA range via git diff" (`gh-pr-address/index.ts:205`); `verify.json` carries per-criterion pass/fail + fingerprints.

## Recommendation (minimal-risk)
**Lever-2 is the primary, safe, high-payoff change** (removes a provably wasted round, zero quality loss). **Lever-1a** is a cheap, safe complement (fewer tool calls, helps the 419-calls figure) but do NOT expect a token cut. **Lever-1b is a quality regression** — recommend NOT at MODERATE+; if wanted at all, gate to TRIVIAL/SIMPLE only.

## Open questions (for discuss)
1. Which lever(s) to ship — Lever-2 only, Lever-2 + 1a, or also 1b gated low?
2. Where to apply — the machine-driven path (execute mode Step 4 + review mode) is live; phase-execute skill is the richer legacy orchestrator. Apply the lever to the live path(s); confirm scope.
3. Pre-fix SHA on state.json (durable across suspend/resume, touches LucaState schema) vs recomputed from the review->execute telemetry/ledger boundary.
