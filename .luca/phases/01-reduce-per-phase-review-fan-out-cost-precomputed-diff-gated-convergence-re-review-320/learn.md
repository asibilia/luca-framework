# Learnings — Phase 01: diff-gated convergence re-review (#320)

Complexity COMPLEX. Verification PASSED 17/17 (two verify passes); review converged round 2 (3/3 APPROVE, 0 new findings). Plan-review converged iteration 1 after a gate-inverting BLOCKER.

## Patterns

### pattern:git-diff-form-must-match-commit-model (HIGH)
- **Conjectured**: `git diff <pre-fix-sha>..HEAD --name-only` would capture the fix diff on re-entry.
- **Refuted by**: Plan-review iteration 0 BLOCKER G-ARCH-001 — the stage-gate denies commits during EXECUTING (`modes/execute.ts:431`, `subagents/executor.ts:64`), so HEAD never moves; `<sha>..HEAD` compares identical commits and is ALWAYS empty, inverting the conservative gate into a blanket skip.
- **Learned**: any diff-based gate must be derived from the pipeline's actual commit model. On a stage-only path the canonical diff is working-tree-inclusive: `git diff <sha> --name-only` ∪ `git ls-files --others --exclude-standard` (untracked union) — correct on both the no-commit mode path and the commit-per-task skill path.
- **Criterion now**: ac-08 pins the working-tree form per gate body; a repo-wide grep asserts the `..HEAD` form is absent. Plan-review probes every mandated shell command against the runtime path's constraints before execution.

### pattern:token-uniform-mirrored-bodies-per-file-greps (HIGH)
- **Conjectured**: tree-wide grep count floors (`grep -rlF | wc -l ≥ N`) suffice to verify a convention renders in N instruction bodies.
- **Refuted by**: Plan-review G-CRIT-003 — a token leaking into a shared include lets a gate body omit it undetected; counts assert existence, not placement.
- **Learned**: when a convention must mirror across N instruction bodies, define exact literal tokens in the plan ("Standard literal tokens" section) and pin each token per-file with `grep -LF <token> <body1> <bodyN>` = EMPTY on the rendered outputs. Anti-criteria greps simultaneously pin the prose that must NOT change (fan-out, isolation, auditor literals).
- **Criterion now**: ac-01..05/08..10 per-file `-LF` probes + anti-01..07; harness passed 17/17 on both iterations, and the round-2 review confirmed zero drift between the authoritative gate and its mirrors.

### pattern:consensus-filter-separates-bugs-from-design-dissent (HIGH)
- **Conjectured**: any MUST-FIX-severity reviewer objection must be fixed before proceeding.
- **Refuted by**: round-1 consolidation — 3 MUST-FIXes confirmed by ≥2 perspectives (stash lifecycle 4/4, vacuous zero-overlap 3-4/4, execute.ts mislabel 3/4) were fixed and re-review APPROVED 3/3; the independence-auditor's 3 additional solo objections each contradicted an explicit plan-approved decision (zero-overlap skip = D3/ac-03; post-skip backlog = G-SCOPE-001/ac-10; HEAD capture = G-ARCH-001) and all failed in the safe direction (over-review, never under-review) — dispositioned as design disagreements → backlog, not verification gaps.
- **Learned**: the ≥2-perspective promotion cleanly separates consensus bugs from single-reviewer design dissent; solo dissent against a plan-approved decision is a plan-level dispute for consolidation/backlog, provided its failure direction is quality-safe.
- **Criterion now**: disposition transparency recorded in verify.json notes; dissent items backlogged with the plan-decision they contradict, so a later phase can re-open deliberately.

## Pitfalls

### pitfall:ephemeral-handoff-file-needs-lifecycle (HIGH)
- **Conjectured**: stashing `{"sha": "<HEAD>"}` to `.luca/tmp/review-prefix-sha.json` and gating on file existence is sufficient.
- **Refuted by**: round-1 MUST-FIX (4/4 perspectives) — the file was never consumed, deleted, or scoped; a stale stash from phase N (or an abandoned `--quality-fixes` route) fires phase N+1's existence-keyed gate on what is actually a FIRST pass, and with an empty audits/ dir the zero-overlap branch goes vacuous → entire first review skipped. A rebased/switched branch also leaves an unresolvable SHA that errors `git diff`.
- **Learned**: any ephemeral cross-session handoff file needs (a) a scoping key in the payload (`{"sha", "phase"}` — mismatch = ABSENT), (b) validity checks (unparsable payload or `git rev-parse --verify` failure = ABSENT → full review), (c) consume-once deletion at EVERY gate exit including the ABSENT branch, and (d) re-stash at each legitimate loop-back so genuine re-entries always find a fresh file.
- **Criterion now**: each gate's step 1 (validate) + step 5 (consume) render verbatim in all three gate bodies; round-2 verified no path where a live stash survives an exit.

### pitfall:overlap-cite-set-must-match-loop-trigger-set (HIGH)
- **Conjectured**: collecting only MUST-FIX `File:line` cites for the zero-overlap test was safe.
- **Refuted by**: round-1 MUST-FIX (≥3/4) — Route B loops back on "MUST-FIX or SHOULD-FIX" (`review.ts:257`), so a SHOULD-FIX-only round has an EMPTY cite set, making "zero overlap" vacuously true → every such fix diff skipped unreviewed, and the just-fixed items falsely backlogged as unresolved.
- **Learned**: the cite-collection severity set must exactly match the severity set that triggers the fix loop; and any set-emptiness edge in a "provably safe" predicate must be an explicit guard, not an implicit vacuous truth.
- **Criterion now**: gates collect MUST-FIX AND SHOULD-FIX cites, plus the verbatim guard "prior cite set is EMPTY and the diff is NON-EMPTY → full round-2 … never a vacuous skip on an empty cite set" in all three decide lists (verified per-body at re-verify).

### pitfall:mirror-prose-mislabels-propagate (MEDIUM)
- **Conjectured**: a 2-line cross-reference mirror is low-risk prose.
- **Refuted by**: round-1 MUST-FIX-adjacent (3/4) — execute.ts's mirror said "Review's Step 3 re-verify is NOT gated", but review's Step 3 is automated checks; re-verify is the upstream `verify` pipeline step. A future editor following the mirror could gate the wrong step.
- **Learned**: mirrors must name pipeline steps by their authoritative identity (pipeline-step name, not the other body's internal step number) and stay algorithm-free, deferring to the named authoritative section ("review mode's Step 3.5").
- **Criterion now**: round-2 re-read confirmed the reworded mirror matches review.ts:91's phrasing and self-identifies as cross-reference only.

## Decisions

### decision:descope-re-verify-from-diff-gate (HIGH)
- **Conjectured**: the gate could skip both round-2 re-review and re-verify.
- **Refuted by**: plan-review G-ARCH-002 — pipeline order is execute → checks → verify → review (`pipeline-machine.ts:252-285`); the verifier has already re-run before review's gate executes, so "skip re-verify" had no owner; and verify criteria are not location-scoped, so zero-overlap is NOT provably safe for them.
- **Learned**: resolved as option (b) — re-verify DESCOPED; the gate covers the N-reviewer round-2 fan-out only (the dominant cost); the single verifier re-spawn is the accepted residual. Gating re-verify would need a second gate location plus a verify.json carry-forward protocol — wider, riskier, and quality-breaching.
- **Criterion now**: ac-05 scopes "skip round-2" to the re-review fan-out; execute.ts mirror states re-verify runs ungated.

### decision:luca-tmp-stash-over-state-schema (MEDIUM)
- **Conjectured**: cross-step handoff state might require a `LucaState` field.
- **Refuted by**: research + review confirmed `.luca/tmp/<kebab>.json` is contract-legal, writable in any pipelineStep (`luca-dir/configs.ts:140-149`), survives compaction, and needs no luca-core change (anti-04 held: porcelain empty throughout).
- **Learned**: prefer a contract-legal `.luca/tmp/` payload (with the lifecycle rules above) over widening the state schema for ephemeral pipeline handoffs.
- **Criterion now**: anti-04 (`git status --porcelain packages/luca-core/` empty) enforces the no-core-change boundary.

## Conventions

### convention:rendered-body-greps-run-at-checks (HIGH)
- **Conjectured**: rendered-body verification could run at REVIEWING/verify.
- **Refuted by**: compile is bash-mutate (writes files) and is stage-gate-blocked in REVIEWING — observed live this run (ac-07 re-compile blocked at verify) and in the sibling #322 run.
- **Learned**: rendered-body compile + grep probes run at the CHECKS step; at verify, use the dual-evidence fallback (post-fix CHECKS harness attestation + independent source-level probes).
- **Criterion now**: plan states "runs at CHECKS step, not REVIEWING" up front; verify.json records the dual-evidence rationale explicitly.

## Procedures

### procedure:mirror-convention-across-instruction-bodies
- **Trigger**: a behavioral convention must be added consistently to multiple luca-tools instruction bodies (modes + skills) with regression-sensitive surrounding prose.
- **Steps**: 1) Define exact literal tokens in the plan's "Standard literal tokens" section (including the shell-command forms). 2) Implement the authoritative body first as a tracer (full algorithm + owner of the convention). 3) Mirror into the remaining bodies in a parallel wave — one distinct file per task; mirrors defer to the authoritative section by name and stay algorithm-free. 4) Verify with per-file `grep -LF <token>` = EMPTY on the RENDERED bodies (compile at CHECKS, paths per emit-agent/emit-skill). 5) Guard untouched prose with anti-criteria greps pinning fan-out/isolation literals verbatim, plus negative tree-wide greps for forbidden scope creep. Caveat: surface-specific trigger conditions (state counter vs stash-file vs CLI flag) may legitimately diverge — anchor each to its surface's authoritative signal and validate the fragile ones (file-existence triggers need the lifecycle rules from the stash pitfall).

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>` only.

- **Recurring failure theme — gate soundness under the no-commit execution model**: the plan-review BLOCKER (`<sha>..HEAD` empty on the no-commit path) and two of the three round-1 review MUST-FIXes (stash lifecycle, vacuous zero-overlap) share one root cause: predicates built on assumptions the stage-gate execution model breaks. Spanned plan-review iteration 0 and review round 1; fully resolved by round 2 / re-verify.
- **Satisfaction valence by step**: checks positive ×2 and verify positive ×2 (17/17 both iterations, MF1-MF3 confirmed, no regressions); review negative round 1 (3 consensus MUST-FIXes) → positive round 2 (3/3 APPROVE, 0 new). Friction concentrated entirely in first-round review of a novel gate algorithm; the fix wave converged in one iteration.
- **Confidence gate**: all-auto with 2 high-confidence design-choice entries (G-ARCH-001 diff-union form, G-ARCH-002 descope) and 0 research/ask — the plan-review round had already burned down the uncertainty, leaving execution-time confidence high (fractional Step 3.5 numbering, lu-review stash-exists trigger) with one medium (phase-execute `--quality-fixes` keying) that round-1 review then hardened.
- **Cross-cutting**: review-dissent → backlog fired twice (worktree-snapshot capture; escalate-vs-backlog on skip-with-unresolved-MUST-FIX), both single-perspective objections to plan-approved decisions failing in the quality-safe direction — promoted above into the consensus-filter pattern.
