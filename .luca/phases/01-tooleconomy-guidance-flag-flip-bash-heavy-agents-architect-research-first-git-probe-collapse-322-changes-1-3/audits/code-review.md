PERSPECTIVE: architecture + correctness (cold-isolated / independence)
VERDICT: APPROVE
MUST_FIX_COUNT: 0

## Scope confirmations (task item 4)

- **Change 4 (loop-guard hook) is ABSENT.** Grep for `loop-guard|loopGuard` across `packages/luca-tools` returns zero hits. No new hook artifact was introduced. Scope respected.
- **Stale tdd prose is UNTOUCHED.** `render-body.ts:111-112` still reads "Tests are intentionally absent in this repo today (see CLAUDE.md / no-tests rule)". This out-of-scope block was correctly not modified by this change.
- Exactly 6 files carry `toolEconomy` (subagent.ts, render-body.ts, executor.ts, reviewer.ts, modes/execute.ts, modes/architect.ts) — matches the described change surface with no leakage.

## Correctness (verified)

1. **Schema field well-formed & backward-compatible.** `define/subagent.ts:118` — `toolEconomy: z.boolean().default(false)` sits inside `SubagentGuidanceSchema`, which itself carries `.prefault({})` (line 126). Default-false + prefault means every existing `.parse()` / author object that omits `toolEconomy` still materializes it as `false`. Opt-in, zero behavior change for non-opted agents. Correct.

2. **Render branch reads the flag and sits in the right ordering slot.** `render-body.ts:124-136` — `if (guidance.toolEconomy) { items.push('- **Tool economy.** …') }` is placed AFTER the `selfVerify` block (line 116) and BEFORE the `antiSycophancy` block (line 137). This matches the schema declaration order (verticalSlice → tdd → selfVerify → toolEconomy → antiSycophancy), so the emitted `## Guidance` bullet order is deterministic and consistent with the existing convention. The prose is accurate (Grep>grep/rg, Glob>find/ls, Read>cat/head/tail, reserve Bash for builds/tests/git/luca, batch independent calls).

3. **Flag flips preserve other flags** (verified each object literally):
   - `executor.ts:56-61` — `{ verticalSlice, tdd, selfVerify, toolEconomy }` (added, prior three kept).
   - `reviewer.ts:25-29` — `{ selfVerify, antiSycophancy, toolEconomy }` (added, prior two kept).
   - `modes/execute.ts:436-441` — `{ verticalSlice, tdd, selfVerify, toolEconomy }` (added, prior three kept).
   - `modes/architect.ts:497-501` — `{ verticalSlice, selfVerify, toolEconomy }` (added, prior two kept).

4. **Architect git-block collapse is semantically correct.** `architect.ts:82-86` — Step 1 now derives the current branch via `luca branch guard` (a pure read that the prose documents encapsulates origin/HEAD → main/master/trunk default-branch detection), and compares its reported `current` against `branching.guardedBranches[]` (fallback `['main']`) and `branching.defaultBranch`. The guard step (line 87-91) then blocks on `ok: false`. Branch CREATION still uses raw `git switch -c` (line 92), which is correct — guard is read-only and does not create branches. No downstream reference to the removed raw git commands survives: the executor subagent (`executor.ts:87`) already independently forbids `git branch --show-current`, so the two surfaces are now consistent rather than divergent.

## Architecture (verified)

5. **DRY guidance-flag approach is consistent with the existing pattern.** `toolEconomy` is modeled identically to `verticalSlice`/`tdd`/`selfVerify`/`antiSycophancy`: one boolean on `SubagentGuidanceSchema`, one `if`-guarded `items.push` in `renderGuidancePrelude`. No new coupling or leakage introduced; the compiler stays the single source of the prose ("change it ONCE here" invariant preserved).

6. **`defineAgent` schema reuse is relied on correctly.** `define/agent.ts:114` sets `guidance: SubagentGuidanceSchema` — the SAME schema object edited in `subagent.ts`. Adding the field therefore propagates to mode-agents (execute, architect) with no second schema edit. The flip in the two mode files compiles against the shared inferred type. Correct.

## Regressions (verified)

- **No golden breakage.** `compile/__fixtures__/compile-smoke.ts:274` fingerprints only the `## Guidance` header (`check('subagent D1 guidance', subagentText, '## Guidance')`); it does not assert on the `toolEconomy` bullet or an exhaustive flag list, and its inline fixture defs (lines 60-79) omit `toolEconomy` (→ default false). Adding an opt-in default-false flag cannot fail it.
- **No exhaustive key consumer.** `renderGuidancePrelude` reads guidance fields individually; there is no `Object.keys(guidance)`/`never`-exhaustiveness switch that a new key would break. No agent unintentionally gained/lost guidance — only the four Bash-heavy agents opted in; verifier/plan-reviewer/debater/review/finalize keep `toolEconomy: false` by default (intentional per the "heavy Bash exposure" doc on subagent.ts:111-117).

FINDINGS:

- [SHOULD-FIX] Stale doc comment introduced by this change. `render-body.ts:51` still reads "Guidance flags (all four are always present …)" but there are now FIVE flags (verticalSlice, tdd, selfVerify, toolEconomy, antiSycophancy). The count went stale as a direct result of adding `toolEconomy`.
  File: packages/luca-tools/src/compile/render-body.ts:51
  Suggestion: change "all four" → "all five" (or drop the count: "all guidance flags are always present …").
  Cross-phase: false

- [SHOULD-FIX] Redundant probe in the collapsed architect git block — mildly self-contradictory with the toolEconomy guidance being added in the same change. `architect.ts:82-91` calls `luca branch guard` twice in consecutive steps: item 2 to read `current`, item 3 to guard on `ok: false`. `branch guard` is a single pure read whose output already carries `current`, `default`, `ok`, and `message`, so one invocation satisfies both. Not a bug (guard is idempotent), but it re-derives a fact the prior call already established — exactly what the new Tool-economy bullet discourages.
  File: packages/luca-tools/src/artifacts/modes/architect.ts:82-91
  Suggestion: collapse items 2 and 3 into a single `luca branch guard` call — read `current`/`default` from its output and branch on `ok` from the same result.
  Cross-phase: false

- [NOTE] The out-of-scope stale tdd prose at render-body.ts:111-112 ("Tests are intentionally absent … / no-tests rule") is factually inaccurate against current repo reality (tests ARE maintained; there is no deployed no-tests rule) but was correctly LEFT UNTOUCHED per this change's scope. Flagged here only to confirm the scope boundary held — no action required for #322.

- [NOTE] Opt-in surface is intentionally narrow: only executor, reviewer, execute, architect received `toolEconomy: true`. verifier/plan-reviewer/debater/review/finalize keep the default `false`. Consistent with the schema doc's "only agents with heavy Bash exposure need it." If the intent was to cover every agent that shells out (e.g. plan-reviewer running `luca plan lint`), that is a deliberate follow-up decision, not a defect.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
