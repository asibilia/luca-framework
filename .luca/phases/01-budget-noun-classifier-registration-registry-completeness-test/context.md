# Context: budget noun classifier registration + registry-completeness test

## Phase goal (fixed by roadmap)

Fix the `budget` noun's bash-mutate misclassification (hook-blocked in PLANNING/REVIEWING where the /lu loop invokes it) and add a registry-completeness test binding cli.ts subCommands to the classifier noun sets so this drift class cannot recur silently.

## User decision

### D1 — Scope: CLOSE ALL GAPS [user-input]

Register all 6 unregistered nouns and fix the confidence verb drift in this phase; the completeness test ships with only `hook` in the documented-exclusion set:

- `budget: new Set(['check'])` → `LUCA_NOUN_VERBS`; `check` NOT added to `LUCA_READ_VERBS` (budget check lazily stamps `runStartedAt` into state — a genuine write; mirrors the `snapshot` luca-write precedent). Add a comment noting the stamp write.
- `graph` → `LUCA_TOPLEVEL_READ` (pure read/report, graph.ts:20-21).
- `status` → `LUCA_TOPLEVEL_READ`; `statusline`, `start`, `stop` → `LUCA_TOPLEVEL_WRITE` (runner POC + harness-invoked; registering avoids future hook blocks; no instruction-body call sites today).
- `confidence` verb set → all 5 leaves: `log, read, summary, render, gate` (confidence.ts:315-321). Fixes live read-intent misclassification at architect.ts:444 and review.ts:63-64.

Set aside: budget-only + DELIBERATELY_UNCLASSIFIED TODOs (would codify the gaps and leave the confidence misclassification live).

## Technical calls locked by research (AI-owned)

- `LUCA_READ_VERBS` additions: `summary` and `gate` (stdout-only reporters — confidence.ts:6-10, gate leaf :281-288); `render` also read-only → include for consistency (all three are reporters; a future colliding noun verb would be caught by the completeness test's verb-equality check). `check` stays OUT (see D1).
- Completeness test design: export the subCommands map from cli.ts (import is side-effect-free — lazy thunks; only manifest resolveVersion runs at import) and the three registry sets from classify-bash-command.ts. New colocated `packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts`.
- Test invariants: (1) every cli.ts noun ∈ keys(LUCA_NOUN_VERBS) ∪ LUCA_TOPLEVEL_READ ∪ LUCA_TOPLEVEL_WRITE ∪ explicit commented `DELIBERATELY_UNCLASSIFIED` (= {hook}); (2) for every LUCA_NOUN_VERBS noun, registered verb set EQUALS Object.keys(resolved def.subCommands) (equality catches both drift directions); (3) converse — every registered LUCA_NOUN_VERBS noun exists in cli.ts (catches dead entries).
- Behavioral test cases in the existing classify-bash-command.test.ts: `luca budget check` → `luca-write`; `luca confidence read` → `bash-readonly`; `luca graph` → `bash-readonly`.
- Do NOT touch: `hook` (documented deliberate exclusion), `telemetry`'s TOPLEVEL_READ placement (deliberate per classifier comment :213-215 — the test asserts membership, not read/write correctness, for top-level commands).

## Constraints

- Package boundary: all changes in packages/luca-cli (classify-bash-command.ts, cli.ts export, tests). NO luca-core edits; NO luca-tools edits (no instruction-body changes needed — call sites already use the commands).
- Gate: `bunx --bun tsc --noEmit`; bounded bun test on the two classifier test files.
- Known non-conflict noted by research: `luca status` (noun) vs Windows `start` in READONLY_COMMANDS (:78) — unrelated code path; do not conflate.

## Explicitly NOT shipping

- `git -C <path>` flag-before-verb classifier parsing (the finalize agent's separate find) — its own backlog item if recurrent.
- Any stage-tool-matrix change; any read/write reclassification of existing correctly-registered nouns.
