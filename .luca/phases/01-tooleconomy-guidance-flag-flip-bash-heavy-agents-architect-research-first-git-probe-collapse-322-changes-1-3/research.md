# Research — #322 toolEconomy guidance flag (Changes 1–3)

Adopting the grounded plan on issue #322. Scope: **Changes 1–3** (declarative `toolEconomy` flag + flip on Bash-heavy agents + architect research-first/git-probe collapse). **Change 4** (loop-guard PreToolUse hook) DEFERRED — gated behind unverified Task-subagent `session_id` scoping + Antigravity non-blocking-output semantics + hot-path latency (per plan Open Questions/Risks).

## Anchor verification (all CONFIRMED against current tree)

| # | Anchor | Current location |
|---|--------|------------------|
| 1 | `packages/luca-tools/src/define/subagent.ts` `SubagentGuidanceSchema` | schema at **L87**; fields `verticalSlice` (L95, dflt false), `tdd` (L102, dflt false), `selfVerify` (**L110**, dflt **true**), `antiSycophancy` (**L116**, dflt false); `.prefault({})` L118. Insert new field **after L110, before L111** (antiSycophancy jsdoc). |
| 2 | `packages/luca-tools/src/define/agent.ts:114` | `guidance: SubagentGuidanceSchema` — reused by mode-agents. CONFIRMED. |
| 3 | `packages/luca-tools/src/compile/render-body.ts` `renderGuidancePrelude` | fn at **L97**; `verticalSlice` 99-106; `tdd` **107-115**; `selfVerify` **116-123**; `antiSycophancy` **124-132**. Insert new branch **after L123, before L124**. |
| 4 | `packages/luca-tools/src/artifacts/subagents/executor.ts` | `maxSteps:50` L53; `allowedTools` incl `Bash` L55; guidance **L56-60** `{ verticalSlice:true, tdd:true, selfVerify:true }`; git-branch warning L86. |
| 5 | `packages/luca-tools/src/artifacts/modes/architect.ts` | Step 1 git probe **L82-87** (both `git branch --show-current` L84 AND `git rev-parse --abbrev-ref HEAD` L85); Step 2.5 "Read Research" header **L147** (body 147-149); guidance **L498-501** `{ verticalSlice:true, selfVerify:true }`. |
| 6 | `packages/luca-tools/src/artifacts/modes/execute.ts` | guidance **L436-440** `{ verticalSlice:true, tdd:true, selfVerify:true }`. |
| 7 | `packages/luca-tools/src/artifacts/subagents/reviewer.ts` | guidance **L25-28** `{ selfVerify:true, antiSycophancy:true }` (drift vs plan's estimate — confirmed current). |
| 8 | `compile/__fixtures__/compile-smoke.ts` + `compile/bin/compile.ts` | both exist; compile CLI flags `--manifest` (required) + `--out` (default `packages/luca-tools/dist/claude`); accept `--flag value` and `--flag=value`. |
| 9 | luca-tools compile dir tests | NO `*.test.ts`. Gate = `bunx --bun tsc --noEmit` + compile-smoke fixture. |
| 10 | golden byte-stability under default-false flag | SAFE — see below. |

## Goldens are safe (Anchor 10)

Adding `toolEconomy: z.boolean().default(false)` changes NO rendered output until flipped: smoke fixtures enumerate only the four existing flags, so the new field defaults false → no new `## Guidance` branch renders. Guidance goldens are `.includes()` substring probes (`'## Guidance'` L274, `'**Test-driven development.**'` L276), not byte-exact block matches; the byte-exact `.join('\n')` goldens (L194-244) are all frontmatter, which guidance never touches. Flipping the flag ON for Bash-heavy agents adds a bullet but no golden asserts the full block → smoke stays green. `tsc` unaffected (inferred boolean).

## Stale-tdd finding (OUT OF SCOPE — flagged, not fixed)

`render-body.ts:109-114` tdd branch still asserts *"Tests are intentionally absent in this repo today (see CLAUDE.md / no-tests rule)"* — contradicts current reality (105 maintained `.test.ts`; `no-tests` rule never deployed) and executor.ts's own jsdoc. The #322 plan explicitly marks correcting it as scope-creep (a maintainer decision). We are editing `render-body.ts` for the toolEconomy branch and will sit adjacent to this stale prose — **do NOT fix it here**; leave a note for a separate change. (Editing only the "Tests are intentionally absent…" clause would keep the smoke green since its golden probes only the `**Test-driven development.**` lead-in, but that is not this phase's deliverable.)

## Implementation deltas from raw plan
- Change 2 agent set: executor (L56-60), architect (L498-501), execute (L436-440), reviewer (L25-28). researcher/research/discussion/learner = OUT (open question resolved toward Bash-capable-only; researcher is already Bash-less so the batching half is moot).
- Change 3: promote research/context consumption ahead of exploration in architect.ts (reword/precede Step 2.5) + collapse the two-command git block (L84-85) to a single branch read led by `luca branch guard`.

## Verification strategy (repo-standard)
1. `bunx --bun tsc --noEmit` — schema field + render branch + all guidance edits typecheck.
2. `bun packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts` — exit 0 (goldens unchanged).
3. Real-artifact render: `bun packages/luca-tools/src/compile/bin/compile.ts --manifest packages/luca-tools/src/artifacts/index.ts --out <scratch>`; grep rendered bodies — `Tool economy` present in executor + architect + execute + reviewer, ABSENT in a no-flag body (e.g. learner/discussion).
4. Architect prose: rendered architect body contains the "read research first" directive and no longer emits both git commands.
