PERSPECTIVE: dx
VERDICT: APPROVE

## Summary

Cold-isolated DX + instruction-clarity review of #322 Changes 1–3: the declarative
`toolEconomy` guidance flag, the reworded architect Step 2.5, the collapsed architect
Step 1 git block, and the four guidance-object flips (executor, execute, architect,
reviewer). These bodies compile to `.claude/agents/*.md`, so the rendered prose steers
real agent behavior — clarity is a correctness property here.

No MUST-FIX instruction defects. The Tool economy bullet correctly carves out the
legitimate Bash uses and will NOT cause an agent to avoid Bash where required. Four
SHOULD-FIX clarity/coherence issues and two NOTEs follow.

## What's genuinely good (verified)

- **Bash carve-out is well-chosen and backfire-proof.** `render-body.ts:129-131` —
  "Reserve `Bash` for commands with no tool equivalent (builds, tests, git, the `luca`
  CLI)." An agent reading this sees Bash is REQUIRED for these classes, not banned. This
  directly defuses the "never use Bash" failure mode. Strong.
- **Concrete, actionable tool mappings.** `render-body.ts:126-129` maps grep→`Grep`,
  find/ls→`Glob`, cat/head/tail→`Read` explicitly. No ambiguity about which native tool
  replaces which shell command.
- **Self-documenting flag intent.** `define/subagent.ts:111-118` — the schema doc states
  the flag is opt-in "only agents with heavy Bash exposure need it" and grounds it in
  Claude Code tool-use best practice. Good provenance for maintainers.
- **Architect Step 2.5 rewording is coherent and complements the new bullet.**
  `architect.ts:146-148` — "Consume research.md and context.md first — before probing the
  codebase... probe the codebase fresh only to fill gaps those documents leave open." This
  is a clean, non-contradicting instantiation of toolEconomy's "don't re-derive facts" at
  the planning level. Ordering is correct: Step 2 (discussion) produces `context.md`, Step
  2.5 consumes it.
- **Cross-body git consistency is now aligned.** `architect.ts:86` ("do NOT shell out to
  raw git to discover the current branch") coheres with the executor's own warning
  (`executor.ts:87`: "Do NOT shell out to `git branch --show-current` ... the CLI
  encapsulates default-branch detection"). Both bodies now steer to `luca branch guard`.

FINDINGS:

- [SHOULD-FIX] Tool economy batching example models `&&` for "independent" checks, which
  short-circuits and hides later checks' output on first failure.
  File: packages/luca-tools/src/compile/render-body.ts:131-133
  Detail: The sentence says "When you DO need several INDEPENDENT shell checks, batch them
  into ONE Bash call (`a && b && c` or a single script)". `&&` is a conjunction — if `a`
  exits non-zero (e.g. `test -f foo` fails), `b` and `c` never run, so their diagnostic
  output is lost and the agent must re-probe. For genuinely independent diagnostic checks
  the agent wants ALL outputs regardless of individual pass/fail.
  Suggestion: Use a non-short-circuiting separator for the independent case, e.g.
  "(`a; b; c`, newline-separated, or a single script)" and reserve `&&` for the case where
  a later step legitimately depends on an earlier one succeeding.
  Cross-phase: false

- [SHOULD-FIX] toolEconomy's "don't re-derive" clause is in latent tension with selfVerify
  for edit-capable agents (executor, architect both carry both flags).
  File: packages/luca-tools/src/compile/render-body.ts:133-134 (vs 116-122)
  Detail: toolEconomy ends "Do not re-derive facts a prior Read/Grep already established."
  selfVerify says "Re-read files before editing ... Do not infer file state from memory or
  prior context," and the executor's Self-Distrust Mandate (`executor.ts:158-159`) is
  emphatic: "Before editing any file, re-read it first ... After each edit, re-read the
  file to verify." An executor over-weighting toolEconomy could read "don't re-derive facts
  I already Read" as license to skip the MANDATORY pre-edit re-read — the exact stale-edit
  failure selfVerify exists to prevent. The two are reconcilable (facts-already-established
  vs. file-state-before-mutation), but the bullets do not disambiguate.
  Suggestion: Add a one-clause carve-out to the toolEconomy bullet, e.g. "...already
  established — EXCEPT re-read a file you are about to edit or just edited (per
  Self-verification): mutation invalidates prior reads." This makes the combination
  unambiguously coherent for agents holding both flags.
  Cross-phase: false

- [SHOULD-FIX] `toolEconomy` applied to the reviewer subagent, which has NO Bash access —
  the Bash-reserve / Bash-batch sentences render inert-to-confusing.
  File: packages/luca-tools/src/artifacts/subagents/reviewer.ts:24-29
  Detail: reviewer `allowedTools: ['Read', 'Grep', 'Glob', 'Write']` — no Bash. Yet its
  rendered Guidance block will say "Reserve `Bash` for ... git, the `luca` CLI" and "batch
  them into ONE Bash call" for a tool it cannot invoke. The flag's own schema doc
  (`define/subagent.ts:116`) says it's opt-in for "agents with heavy Bash exposure"; the
  reviewer has zero. Only the trailing "don't re-derive facts a prior Read/Grep
  established" clause is relevant to it.
  Suggestion: Drop `toolEconomy` from the reviewer (its Grep/Read discipline is already
  covered by selfVerify), OR split the flag so the Grep/Read/"don't re-derive" half can be
  applied without the Bash half. Not harmful today, but it's noise in a body whose prose is
  supposed to be load-bearing.
  Cross-phase: false

- [SHOULD-FIX] Collapsed architect Step 1 invokes `luca branch guard` twice, which the
  same agent's new toolEconomy bullet discourages ("don't re-derive facts").
  File: packages/luca-tools/src/artifacts/modes/architect.ts:82-91
  Detail: Step 1.2 runs `luca branch guard` to "Read the current branch" and Step 1.3 runs
  `luca branch guard` AGAIN to "Guard against committing on a protected branch." The prose
  itself states this one call returns both `current` and `ok` ("Use its reported `current`
  ... On `ok: false`, stop and report"). Running it a second time re-derives a fact the
  first call already established — precisely what the architect's own toolEconomy guidance
  now tells it not to do. Harmless at runtime (pure read) but the numbered steps read as
  "run the same command twice," undercutting the guidance.
  Suggestion: Merge 1.2 and 1.3 into a single "Run `luca branch guard` once; use `current`
  for the branch, and on `ok: false` stop and report" step.
  Cross-phase: false

- [NOTE] Flag set looks slightly inverted vs. the "heavy Bash exposure" rule. Two
  Bash-heavy subagents with the SAME tool surface as the executor are excluded while the
  no-Bash reviewer is included: `test-writer` (`allowedTools` includes Bash, runs
  `bun test` — test-writer.ts:23) and `verifier` (Bash, runs the checks-fix loop —
  verifier.ts:26) both lack `toolEconomy`, whereas reviewer (no Bash) has it. May be
  intentional incremental scoping for "Changes 1–3"; worth tracking so the set converges on
  the Bash-heavy agents the flag doc targets.

- [NOTE] Minor wording overlap in the bullet: `Grep` is described "for file contents" and
  `Read` is also "for file contents" (render-body.ts:127-129). Grep is content *search*;
  Read is a whole-file *read*. Tighten to e.g. "`Grep` ... for content search" / "`Read`
  ... for whole-file reads" to avoid the apparent duplication.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 4
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
