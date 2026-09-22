# Context — #322 toolEconomy guidance flag (Changes 1–3)

Full-auto run. Decisions locked from the grounded plan on issue #322 (do NOT re-plan) + research anchor verification. No user gray areas remain open — all plan Open Questions are resolved below.

## Locked decisions

1. **Scope = Changes 1–3 only.** Change 4 (consecutive-tool loop-guard PreToolUse hook) is DEFERRED to a separate follow-up. Rationale: needs cross-invocation counter state + unverified Task-subagent `session_id` scoping + unverified Antigravity non-blocking-`additionalContext` semantics + adds I/O to every Bash PreToolUse (hot path). The plan itself ships 1–3 first as one changeset and gates 4. [decision]

2. **`toolEconomy` flag applied to Bash-capable agents only** (resolves plan Open Q1): executor, architect (mode), execute (mode), reviewer. Researcher/discussion/learner EXCLUDED — researcher is already Bash-less (`allowedTools: Read/Grep/Glob`) so the batching half is moot; uniformity not worth the render churn. [decision]

3. **Default `false`, opt-in.** `toolEconomy: z.boolean().default(false)` — backward-compatible; no rendered `## Guidance` block changes until a flag is flipped. Verified: compile-smoke goldens survive byte-identical (fixtures don't set the flag; guidance goldens are `.includes()` substring probes; byte-exact goldens are frontmatter-only). [decision]

4. **Render ordering fixed:** new `toolEconomy` branch in `renderGuidancePrelude` goes AFTER the `selfVerify` branch (ends L123) and BEFORE the `antiSycophancy` branch (L124) — stable, deterministic block order. Schema field inserts after `selfVerify` (L110), before `antiSycophancy` (L111). [decision]

5. **Architect Change 3 = two edits:** (a) promote research/context consumption ahead of codebase probing (reword/precede the optional late Step 2.5 into a "read research.md + context.md FIRST, probe only for gaps" directive); (b) collapse the redundant Step 1 git block (both `git branch --show-current` L84 AND `git rev-parse --abbrev-ref HEAD` L85) to a single branch read led by `luca branch guard` (mirrors executor.ts:86's own warning). [decision]

6. **Stale tdd prose = OUT OF SCOPE.** `render-body.ts:109-114` ("Tests are intentionally absent…") is stale but correcting it is a separate maintainer decision per the plan. We edit render-body.ts adjacent to it — leave it untouched, note it for follow-up. [decision — scope guard]

## Verification (locked)
`bunx --bun tsc --noEmit` + `bun …/compile-smoke.ts` (exit 0) + real-artifact render grep: `Tool economy` present in executor/architect/execute/reviewer, absent in a no-flag body; architect body shows "read research first" + single git call.

## Deferred (not this phase)
- Change 4 loop-guard hook (own changeset, gated on the open questions above).
- Stale "tests are intentionally absent" tdd guidance correction.
