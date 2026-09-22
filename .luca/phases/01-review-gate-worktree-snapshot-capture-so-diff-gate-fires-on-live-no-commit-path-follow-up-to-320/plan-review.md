# Plan Review — Phase 01 review-gate worktree-snapshot capture (follow-up to #320), Iteration 0

```
STATUS: NEEDS_REVISION
CONVERGENCE: CONVERGING (baseline: B(0) = 3)
BLOCKING_COUNT: 3   (MAJOR — plan-level, must resolve before execution)
ADVISORY_COUNT: 2
RECOMMENDATION: revise
```

## 1. VERDICT

**NEEDS_REVISION** — the architecture, wave structure, git mechanics, and criteria scheme are sound and nearly everything the plan asserts about the codebase checks out against source. However, three MAJOR gaps: one vacuous verification probe (ac-15 invokes a module that never executes), and two design holes on paths the plan claims to cover (phase-execute cite-source mismatch; consume-once delete has no hook-legal mechanism in REVIEWING).

## 2. Findings

### MAJOR

**G-CRIT-001 [MAJOR] — ac-15 smoke probe is vacuous: `bun packages/luca-cli/src/cli.ts snapshot create` executes nothing.**
`packages/luca-cli/src/cli.ts:106` only *exports* `runMain` — no top-level or `import.meta.main`-guarded invocation. The sole executable entry is `packages/luca/bin/luca.js:2-3` (imports `runMain` from built `../dist/index.mjs`). Running the source path loads the module, runs no command, exits 0 — ac-15 passes vacuously on any state of the code, and ac-16 (depends on the payload written "by the ac-15 run") then fails with no diagnostic at the real cause. Fix options: (a) probe via the real entry after a build (`bun run build && bun packages/luca/bin/luca.js snapshot create`), (b) add an `import.meta.main` self-invoke guard to `cli.ts` in Task 1.3.1 and keep the source-mode probe, or (c) a `bun -e` import wrapper. ac-15 must be redefined so it can actually fail.

**G-ARCH-001 [MAJOR] — CLI cite-parse contract cannot see prior findings on the phase-execute path; the gate will never skip there.**
The CLI parses `File: {path:line}` cites from `audits/*.md` — matches the review-mode/lu-review path (reviewer subagents write that format, `subagents/reviewer.ts:93,101,124,128`). But on the phase-execute `--quality-fixes` path, reviewers return inline YAML (`severity: CRITICAL|HIGH|MEDIUM|LOW` / `file:` / `line:`, `skills/phase-execute/index.ts:967-975`) and do NOT persist parseable `audits/<reviewer>.md`. Result: on every phase-execute re-entry the CLI finds an empty cite set, diff non-empty → coded fail-safe returns `ambiguous` → full re-review, always. Fail-safe (HARD CONSTRAINT survives) but silently defeats the plan's own scope (Task 1.3.4, ac-04..ac-10, D3 treat PHEXEC as a full gate body). Pick one: (a) Step 8.1's exit also persists prior-round findings in the CLI-parseable audit format, (b) extend the CLI parse contract to phase-execute's severity scheme, or (c) explicitly document never-skip-on-phase-execute as accepted and adjust Task 1.3.4's framing. (c) is cheapest but must be a recorded decision.

**G-ARCH-002 [MAJOR] — the consume-once delete has no hook-legal mechanism in REVIEWING; plan carries it "verbatim" without fixing it.**
The preserved lifecycle prose instructs "delete `.luca/tmp/review-prefix-*.json` now" at every gate exit — but `rm` ∈ `MUTATE_COMMANDS` (`classify-bash-command.ts:150`), REVIEWING sets `bash-mutate: false`, and there is no `.luca/tmp` deletion carve-out (only the Write-tool path is tmp-exempt; Write cannot delete). Same latent-block class as the ls-files bug. A stranded payload with matching phase key and still-resolvable tree is a **stale-baseline false-skip** vector on a later same-phase re-review. Recommended fix: move consumption into the CLI (`luca snapshot diff` deletes the payload after reading, or a `--consume` flag / `snapshot consume` verb) — also shrinks prose per D2's own philosophy.

### MINOR

**G-DX-001 [MINOR] — unborn-branch wording ambiguous in Task 1.1.1.** "Substituting the empty tree when `read-tree HEAD` fails" can be read as snapshot = empty tree (wrong: loses worktree capture) vs read-tree base = empty (correct: `add -A` + `write-tree` still capture worktree). Spell out the latter; unit test must assert worktree files present in the snapshot tree.

**G-DX-002 [MINOR] — ac-15/ac-16 leave a live payload in the working repo's `.luca/tmp/`.** Add a cleanup step after ac-16.

## 3. Summary — verified-clean checks

- **File anchors / packages verified:** classify-bash-command.ts ∈ luca-cli (GIT_READONLY_SUBCOMMANDS at :84, no ls-files — D3 bug real; LUCA_NOUN_VERBS at :242); stage-tool-matrix.ts ∈ luca-core (REVIEWING luca-write:true / bash-mutate:false at :68-78 — core legality claim holds); precedents luca-branch-guard.ts:21, branch.ts, cli.ts lazy-import (:83-85); reviewer.ts:124 audit-format anchor; execute.ts:412; phase-execute :884-894/:1255.
- **Context decisions honored:** D1–D4 all traced (no `sha` drift; anti-01 pins retired name absence; lifecycle carried — G-ARCH-002 flags the part that must NOT carry verbatim).
- **Waves/parallel safety:** 9 tasks disjoint files; dependencies correct; Wave-3 wiring collides with nothing.
- **Git mechanics:** temp-index pipeline side-effect-free; tree-to-tree avoids one-arg deleted-file artifact; rev-parse --verify works on tree shas; GC window ≫ loop window with ABSENT fail-safe.
- **Criteria quality:** counts accurate (3 waves, 9 tasks, 18 ac + 7 anti); one binary probe each; D-lines map to live IDs; rendered paths verified against compiler (emit-agent.ts:65-67, emit-skill.ts:17, ids confirmed); guard literals placement verified (fan-out/auditor only in PHEXEC :932/:1184; 5-reviewer only in review.ts:110); ac-06 non-vacuous (`ambiguous` zero pre-existing matches).
- **#320 pitfall checks:** review-mode cite set equals Route B trigger set ✓; lu-review trigger subset — safe ✓; phase-execute mismatch filed as G-ARCH-001; re-stash sites covered; scoping key retained.

Three MAJOR findings → revise. All three have small, localized fixes (redefine ac-15's probe; decide the phase-execute cite-source question explicitly; move payload consumption into the CLI). No structural rework of waves or deliverables needed.

---

# Plan Review — Iteration 1

```
STATUS: APPROVED
CONVERGENCE: CONVERGED (B(1) = 0 < B(0) = 3)
BLOCKING_COUNT: 0
ADVISORY_COUNT: 2
RECOMMENDATION: approve
```

## 1. VERDICT

**APPROVED** — all three iteration-0 MAJOR findings resolved with mechanisms re-verified against the codebase, both MINOR items addressed, ac-IDs stable, front-matter counts accurate. Two new ADVISORY notes; neither blocks execution.

## 2. Resolution verification

**G-CRIT-001 → RESOLVED (with advisory G-DX-003).** Task 1.3.1 adds an `import.meta.main` self-invoke guard to cli.ts; ac-15 redefined non-vacuous. Verified: cli.ts:106 today export-only; guard is inert for the two importers (run.ts:7, index.ts:8) and the built path (packages/luca/bin/luca.js → dist) imports rather than direct-executes — no double-invoke. With the guard, the probe genuinely executes citty runMain; unregistered noun exits non-zero, so ac-15 can fail and ac-16 has a real producer.

**G-ARCH-001 → RESOLVED (option c, consistently threaded).** Task 1.3.4 documents the accepted limitation with the correct evidence anchor (inline YAML at skills/phase-execute/index.ts:967-975, re-verified); Decisions records the acceptance; D3 makes no working-skip claim for PHEXEC; ac-04..ac-10 remain valid literal-presence probes. `ambiguous`-always on PHEXEC honors the HARD CONSTRAINT (fail-safe).

**G-ARCH-002 → RESOLVED.** Consumption moved into `luca snapshot diff` on EVERY path incl. mismatch/parse-fail, tests assert deletion (Task 1.2.1); Task 1.2.2 forbids any rm/delete instruction in bodies and reframes `consume-once` as CLI behavior — ac-09 coherent; Risks marks the stale-baseline false-skip vector eliminated. Matches the verified rm-block premise (classify-bash-command.ts:150, stage-tool-matrix.ts:75).

**G-DX-001 → RESOLVED.** Empty tree = read-tree BASE only; add -A + write-tree still capture worktree on unborn branch; unit test asserts worktree files present.

**G-DX-002 → RESOLVED.** Post-ac-16 cleanup at CHECKS (bash-mutate legal there).

## 3. New findings (ADVISORY only)

**G-DX-003 [ADVISORY] — a source-mode self-invoking entry already exists.** `packages/luca-cli/src/run.ts:1-9` imports runMain from cli.ts and invokes it ("no build step; used by acceptance/integration tests"). ac-15 via `bun packages/luca-cli/src/run.ts snapshot create` achieves the non-vacuous probe with ZERO code change (functional-api-reuse). Recommendation: use run.ts for ac-15 and drop the import.meta.main guard from Task 1.3.1. Not blocking — the guard approach is also correct and harmless.

**G-DX-004 [ADVISORY] — "lifecycle prose verbatim" in Task 1.2.2 can be over-read.** Now that the CLI validates AND consumes, the body-side ABSENT-check should collapse to file-existence only; a verbatim carry of the body-side mismatch short-circuit would skip the CLI call and strand the payload (deletion hook-blocked in the body). Worst case benign (ABSENT/fail-safe on later passes). Clarify in the executor prompt: ABSENT = file missing; all validation delegated to the CLI, which consumes.

## 4. Summary

ac-01..ac-18 / anti-01..anti-07 carry identical IDs and probes except the two sanctioned redefinitions; front-matter 3 waves / 9 tasks accurate; D1–D6 map to live IDs; wave parallel-safety unchanged (disjoint files); anti-07 (no luca-core diff) enforceable; `ambiguous` still zero pre-existing occurrences in the gate bodies (ac-06 non-vacuous). Convergence B(0)=3 → B(1)=0. **CONVERGED — approved.** Advisories adoptable by the executor without a further review round.

## Confidence Gate Resolutions

- **[gate-research]** ac-15 e2e smoke probe entry (low/design-choice): RESOLVED — point ac-15 at the pre-existing source entry `bun packages/luca-cli/src/run.ts snapshot create …` and DROP the planned `import.meta.main` guard change to cli.ts entirely. Evidence: run.ts:9 self-invokes unconditionally (`void runMain()`), citty runMain consumes process.argv (args pass through), no build-time deps; direct precedent at runner-acceptance.test.ts:44 spawns real luca via run.ts. Supersedes the plan's option-(b) guard (G-CRIT-001) and adopts advisory G-DX-003 — the probe stays non-vacuous with ZERO production code change. Caveat: probe goes green only once `snapshot` is registered in cli.ts subCommands (exactly the wiring mistake the smoke exists to catch).
- **[auto]** EXEC mirror carries capture tokens only (medium/requirement-ambiguous) — proceed as planned.
- **[auto]** Tree builder exported from luca-snapshot-create.ts, no premature __helpers (medium/design-choice) — proceed as planned.
- **[auto]** G-CRIT-001 via self-invoke guard (high/design-choice) — SUPERSEDED by the gate-research resolution above (run.ts probe, no guard).
- **[auto]** G-ARCH-001 option (c): never-skip on phase-execute is an accepted documented limitation (medium/design-choice) — proceed as planned.
