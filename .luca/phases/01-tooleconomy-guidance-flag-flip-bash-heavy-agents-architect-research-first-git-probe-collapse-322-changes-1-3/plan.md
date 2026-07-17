---
id: 01-tooleconomy-guidance-flag-322-changes-1-3
title: toolEconomy guidance flag + flip on Bash-heavy agents + architect research-first/git-probe collapse
wave: 2
tasks: 6
---

# Plan: toolEconomy guidance flag (#322 Changes 1–3)

## Objective
Add a declarative `toolEconomy` guidance flag to the subagent schema, render a "Tool economy" bullet when set, flip it ON for the four shell-probing agents (executor, architect-mode, execute-mode; reviewer included for its diff/grep exploration), and tighten the architect body: consume research.md/context.md before probing the codebase, and collapse the redundant Step 1 two-command git block to a single `luca branch guard`-led branch read.

## Context
Adopting the grounded plan on issue #322. Scope = **Changes 1–3 ONLY**; Change 4 (loop-guard PreToolUse hook) is DEFERRED and MUST NOT appear here. Stale `render-body.ts` "Tests are intentionally absent" tdd prose is OUT OF SCOPE — leave untouched. All anchors verified in `research.md` (current line numbers). Default `false` → no rendered `## Guidance` change until a flag flips, so compile-smoke goldens survive byte-identical (guidance goldens are `.includes()` substring probes; byte-exact goldens are frontmatter-only). Because `define/agent.ts:114` reuses `SubagentGuidanceSchema`, the flag auto-reaches mode-agents — no second schema edit.

Foundation = Change 1 (schema field). Every downstream edit (render branch, flag flips) typechecks only once the schema field exists, so the schema task is its own wave. All Wave 2 tasks touch distinct files → parallel-safe. `modes/architect.ts` is edited by BOTH the Change 2 flag flip (guidance object ~L498-501) AND the Change 3 body rewords — SAME file, so ONE task (never split).

## Phases

### Phase 1: toolEconomy flag

#### Wave 1: Schema foundation
- [ ] **Task 1.1.1**: Add `toolEconomy: z.boolean().default(false)` (with jsdoc) to `SubagentGuidanceSchema`, inserted AFTER the `selfVerify` field (~L110) and BEFORE the `antiSycophancy` jsdoc (~L111). No other edit — `define/agent.ts:114` reuse propagates it to mode-agents.
  - Files: `packages/luca-tools/src/define/subagent.ts`
  - Verification: ac-01, ac-03

#### Wave 2: Render branch + flag flips + architect body
All tasks depend on Task 1.1.1 (schema field must exist to typecheck). Distinct files — run in parallel.

- [ ] **Task 1.2.1**: In `renderGuidancePrelude`, add `if (guidance.toolEconomy) { items.push('- **Tool economy.** …') }` AFTER the `selfVerify` branch (~L123) and BEFORE the `antiSycophancy` branch (~L124). Bullet MUST instruct: prefer native Grep (not grep/rg in Bash), Glob (not find/ls), Read (not cat/head/tail); reserve Bash for commands with no tool equivalent (builds, tests, git, the luca CLI); batch independent shell checks into ONE Bash call; don't re-derive facts a prior Read/Grep already established. Do NOT touch the adjacent stale tdd branch.
  - Files: `packages/luca-tools/src/compile/render-body.ts`
  - Verification: ac-01, ac-04
  - Dependencies: Task 1.1.1

- [ ] **Task 1.2.2**: Flip `toolEconomy: true` on executor guidance object (~L56-60), leaving `verticalSlice`/`tdd`/`selfVerify` intact.
  - Files: `packages/luca-tools/src/artifacts/subagents/executor.ts`
  - Verification: ac-01, ac-05
  - Dependencies: Task 1.1.1

- [ ] **Task 1.2.3**: Flip `toolEconomy: true` on execute-mode guidance object (~L436-440), leaving `verticalSlice`/`tdd`/`selfVerify` intact.
  - Files: `packages/luca-tools/src/artifacts/modes/execute.ts`
  - Verification: ac-01, ac-07
  - Dependencies: Task 1.1.1

- [ ] **Task 1.2.4**: Flip `toolEconomy: true` on reviewer guidance object (~L25-28), leaving `selfVerify`/`antiSycophancy` intact.
  - Files: `packages/luca-tools/src/artifacts/subagents/reviewer.ts`
  - Verification: ac-01, ac-08
  - Dependencies: Task 1.1.1

- [ ] **Task 1.2.5**: Edit `modes/architect.ts` (single task, both Change 2 + Change 3): (a) flip `toolEconomy: true` on the guidance object (~L498-501), leaving `verticalSlice`/`selfVerify` intact; (b) reword/precede the late optional "Step 2.5: Read Research" (~L147-149) into a directive to consume research before probing — the directive MUST contain the exact literal phrase `research.md and context.md first` (verbatim, lowercase, ` and ` and ` first` as written) so ac-09 has a deterministic anchor; treat them as the primary source of repo facts and probe the codebase fresh only for gaps; (c) collapse the Step 1 git block (~L82-87) — remove BOTH raw git commands `git branch --show-current` (L84) AND `git rev-parse --abbrev-ref HEAD` (L85) — to a SINGLE branch read led by `luca branch guard`, mirroring executor.ts:86's warning. Neither raw git command may remain in the architect body.
  - Files: `packages/luca-tools/src/artifacts/modes/architect.ts`
  - Verification: ac-01, ac-06, ac-09, ac-10, anti-02, anti-05
  - Dependencies: Task 1.1.1

## Risks & Mitigations
- Golden drift: default-false keeps goldens byte-identical; ac-02 (compile-smoke exit 0) guards it.
- Adjacent stale tdd prose in render-body.ts: anti-03 guards against accidental edit.
- Scope creep into Change 4: anti-04 guards against any loop-guard hook file.

## Decisions
- 2026-07-17 — Schema field isolated to Wave 1: render branch and all flag flips typecheck only after the field exists, so they cannot share Wave 1 without a per-task tsc failure risk.
- 2026-07-17 — Learner chosen as the no-flag absence probe (anti-01): Bash-less, never gets the flag, stable negative.
- 2026-07-17 — architect.ts Change 2 + Change 3 kept as ONE task: same file, parallel split would collide.

## Deliverables
- **D1**: Add `toolEconomy` flag to `SubagentGuidanceSchema` (Change 1 schema) → ac-03
- **D2**: `renderGuidancePrelude` emits a "Tool economy" bullet when the flag is set (Change 1 render) → ac-04
- **D3**: Flip flag ON for executor (Change 2) → ac-05
- **D4**: Flip flag ON for architect-mode (Change 2) → ac-06
- **D5**: Flip flag ON for execute-mode (Change 2) → ac-07
- **D6**: Flip flag ON for reviewer (Change 2) → ac-08
- **D7**: Architect consumes research.md/context.md before probing the codebase (Change 3a) → ac-09
- **D8**: Architect Step 1 git block collapsed to a single `luca branch guard`-led read (Change 3b) → ac-10, anti-02, anti-05
- **D9**: Backward-compatible — no rendered-body change for no-flag agents → ac-02, anti-01

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `bun packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts` exits 0.
- **ac-03**: `grep -q 'toolEconomy' packages/luca-tools/src/define/subagent.ts` matches.
- **ac-04**: `grep -q 'Tool economy' packages/luca-tools/src/compile/render-body.ts` matches.
- **ac-05**: After `bun packages/luca-tools/src/compile/bin/compile.ts --manifest packages/luca-tools/src/artifacts/index.ts --out <scratch>`, the rendered executor body contains `Tool economy`.
- **ac-06**: In the same rendered output, the architect-mode body contains `Tool economy`.
- **ac-07**: In the same rendered output, the execute-mode body contains `Tool economy`.
- **ac-08**: In the same rendered output, the reviewer body contains `Tool economy`.
- **ac-09**: The rendered architect-mode body contains the exact literal `research.md and context.md first`.
- **ac-10**: The rendered architect-mode body contains `luca branch guard`.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — a no-flag rendered body contains a "Tool economy" bullet; probe: rendered learner body has no match for `Tool economy`.
- **anti-02**: MUST NOT — the rendered architect-mode body still emits `git rev-parse --abbrev-ref HEAD`; probe: no match for `git rev-parse --abbrev-ref HEAD` in the architect body.
- **anti-05**: MUST NOT — the rendered architect-mode body still emits the raw `git branch --show-current` probe; probe: no match for `git branch --show-current` in the architect body.
- **anti-03**: MUST NOT — the stale tdd prose is modified; probe: `grep -q 'Tests are intentionally absent' packages/luca-tools/src/compile/render-body.ts` still matches.
- **anti-04**: MUST NOT — a Change 4 loop-guard hook file is created; probe: `git status --porcelain` lists no new file matching `*loop-guard*` or `*tool-*-guard*`.
