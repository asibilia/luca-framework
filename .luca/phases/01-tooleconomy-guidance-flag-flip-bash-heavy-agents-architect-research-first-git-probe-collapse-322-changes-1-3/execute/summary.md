# Execute Summary — #322 toolEconomy guidance flag (Changes 1–3)

Two waves, 6 tasks, all complete. No commits (deferred to finalize, mirroring #319).

## Wave 1 — schema foundation
- `packages/luca-tools/src/define/subagent.ts`: added `toolEconomy: z.boolean().default(false)` (with jsdoc) to `SubagentGuidanceSchema` at **L118**, after `selfVerify`, before the `antiSycophancy` jsdoc. `define/agent.ts:114` reuse propagates it to mode-agents (no second schema edit). tsc exit 0.

## Wave 2 — render branch + flag flips + architect body (5 parallel, distinct files)
- `compile/render-body.ts`: added `if (guidance.toolEconomy)` branch at **L124–136**, after `selfVerify`, before `antiSycophancy`. Bullet: prefer Grep/Glob/Read over grep/find/cat, reserve Bash for build/test/git/luca CLI, batch independent shell checks into ONE call, don't re-derive. Stale tdd prose UNTOUCHED (`grep -q 'Tests are intentionally absent'` still matches). tsc 0; `Tool economy` count 1.
- `subagents/executor.ts`: `toolEconomy: true` added → `{ verticalSlice, tdd, selfVerify, toolEconomy }`. tsc 0.
- `modes/execute.ts`: `toolEconomy: true` added → `{ verticalSlice, tdd, selfVerify, toolEconomy }`. tsc 0.
- `subagents/reviewer.ts`: `toolEconomy: true` added → `{ selfVerify, antiSycophancy, toolEconomy }`. tsc 0.
- `modes/architect.ts` (one task, 3 edits): (a) `toolEconomy: true` on guidance; (b) Step 2.5 reworded to "Consume research.md and context.md first — before probing the codebase" (exact literal `research.md and context.md first` present); (c) Step 1 git block collapsed to a single `luca branch guard`-led read. Greps: `toolEconomy: true` ✓, `research.md and context.md first` =1, `git rev-parse --abbrev-ref HEAD` =0, `git branch --show-current` =0, `luca branch guard` =3. tsc 0.

## Scope guards honored
- Change 4 (loop-guard hook): NOT implemented — no new hook file created.
- Stale tdd "tests are intentionally absent" prose: NOT modified (anti-03).
- architect.ts edited as a single task (no parallel same-file collision).

## Quality pass (review should-fixes, both reviewers APPROVE/0-must-fix)
Applied 5 convergent should-fixes (no scope change):
- `render-body.ts`: doc comment "all four flags" → "all five"; Tool-economy bullet reworded — Grep=search vs Read=read-a-file distinction, batching example `a && b && c` → `a; b; c` (independent checks shouldn't short-circuit), added carve-out "(this never overrides the Self-verification pre-edit re-read)" to resolve the latent toolEconomy↔selfVerify tension for edit-capable agents.
- `modes/architect.ts`: collapsed the double `luca branch guard` invocation (Steps 2 & 3 both called it) to a single call whose `ok`/`current` Step 3 now reuses — removing a re-derived fact that ironically contradicted the very Tool-economy bullet this change ships. `luca branch guard` still present (ac-10 holds); no raw git re-introduced (anti-02/05 hold).
Kept (defensible, locked in context.md): reviewer carries the flag though Bash-less (plan intent: diff/grep uniformity) — inert, not harmful. Deferred to follow-up: extend the flag to test-writer/verifier (NOTE, out of #322 scope).

## Materialization note
Instruction-body edits reach installed harnesses via `bun run build` + `luca init` re-run; source edits alone don't refresh deployed bodies. Not a pipeline gate; tsc + compile-smoke + real-render grep are the gates (run at checks/verify).
