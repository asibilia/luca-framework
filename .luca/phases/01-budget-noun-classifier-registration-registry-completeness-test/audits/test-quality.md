PERSPECTIVE: test-quality
VERDICT: APPROVE

## Verdict

APPROVE. The invariants are genuinely binding and would have caught both motivating regressions. Verified against the implementations (not just the diff):

1. **Invariant 1 is not tautological** — `registered` is computed from real set membership, and the `expect({ noun, registered }).toEqual({ noun, registered: true })` shape puts the failing noun's name in the diff (`classify-bash-command-registry.test.ts:64-70`). Re-running it mentally against the pre-fix state: `budget` was in `CLI_SUBCOMMANDS` (`cli.ts:87-88`) but in no classifier set — invariant 1 fails by name. **The original budget gap is caught.**
2. **Invariant 2 is equality, both directions** — sorted-array `toEqual` (`classify-bash-command-registry.test.ts:85-92`) fails on an unregistered new verb AND on a stale registered verb. Verified `LUCA_NOUN_VERBS.confidence` = {log, read, summary, render, gate} (`classify-bash-command.ts:282`) matches `confidence.ts:315` subCommands and `budget` = {check} matches `budget.ts:222-224`. **Confidence-style verb drift is caught.**
3. **Exclusion set is pinned adequately** — `DELIBERATELY_UNCLASSIFIED = {'hook'}` with a companion test asserting `hook` appears in NO classifier set (`classify-bash-command-registry.test.ts:106-117`), so the exclusion cannot be used to hide an already-registered noun. Growth to greenwash a NEW noun remains possible but is comment-forbidden (see Notes).
4. **Thunk resolution handles both shapes** — `resolveCommandDef` (`:39-49`) covers direct named-export thunks and `m.default` (doctor, `cli.ts:36`); a future module-shaped thunk without `default` would resolve to a def with no `subCommands`, producing `[]` vs registered verbs — a loud failure, not a silent pass.
5. **Behavioral additions are anchored** — `luca budget check → luca-write` (`classify-bash-command.test.ts:319-325`) exactly pins the write classification (consistent with the lazy `runStartedAt` stamp rationale at `classify-bash-command.ts:292-297`); confidence read verbs, `graph`, `statusline` each pin an exact category.

All current sets are pairwise disjoint (verified by inspection of `classify-bash-command.ts:216-240,266-298` vs `cli.ts:23-97`), so the missing disjointness invariant below is future-drift hardening, not a present correctness bug — hence no MUST-FIX.

## MUST-FIX

None.

## SHOULD-FIX

- [SHOULD-FIX] No disjointness invariant between `LUCA_NOUN_VERBS` keys, `LUCA_TOPLEVEL_READ`, and `LUCA_TOPLEVEL_WRITE` — double registration is NOT caught. `classifyLucaCommand` checks `LUCA_NOUN_VERBS` first (`classify-bash-command.ts:323-328`), so if e.g. `status` or `telemetry` (currently `LUCA_TOPLEVEL_READ`) ever gains a noun-group entry in `LUCA_NOUN_VERBS` without being removed from the top-level set, bare `luca status` silently flips from `bash-readonly` to `luca-write` while all three invariants stay green (invariant 1 = union membership passes, invariant 2 = verbs match, invariant 3 = noun exists). The suite only asserts non-membership for `hook`.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts:60-73
  Suggestion: Add an invariant asserting pairwise disjointness of the three classifier sets (plus `DELIBERATELY_UNCLASSIFIED`), e.g. for each noun, count memberships across the four sets and assert exactly ≤1, with the noun named in the failure diff.
  Cross-phase: false
- [SHOULD-FIX] `-v` regression test uses a negative-only anchor: `.not.toBe('bash-readonly')` would also pass if `luca doctor --fix -v` classified as `denied` or `bash-mutate` (losing the `luca-write` phase-matrix treatment that makes `luca repair`/`doctor` legal in non-IDLE phases). The regression being guarded has an exact expected value.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts:309-314
  Suggestion: Pin `expect(...).toBe('luca-write')` for both invocations.
  Cross-phase: false
- [SHOULD-FIX] Top-level nouns with subcommand surfaces are outside invariant 2's verb-equality entirely, and their most surprising classification is unpinned: `telemetry` has verbs {emit, new-run, pr-outcome, kpi} (`telemetry.ts:298-303`) where `emit`/`new-run` genuinely write JSONL, yet `LUCA_TOPLEVEL_READ` membership classifies `luca telemetry emit ...` as `bash-readonly` for ALL verbs. Same for `rules` {list, run, gate, suggest} (`rules.ts:142-147`). This is documented design intent (`classify-bash-command.ts:213-215` — telemetry must be allowed in any phase), but no test pins it, so an accidental move of `telemetry` between sets (breaking subagent telemetry emission in read-only steps) would be invisible to this suite.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts:318-347
  Suggestion: Add pinned behavioral cases `luca telemetry emit --kind=x → bash-readonly` and `luca rules gate → bash-readonly` with comments citing the design rationale, so the intentional read-classification of mutating top-level leaves is load-bearing in the suite.
  Cross-phase: true

## Notes

- [NOTE] Invariant 2's early `return` when a registered noun is missing from `CLI_SUBCOMMANDS` (`classify-bash-command-registry.test.ts:81-83`) is a vacuous pass *within that test*, but invariant 3 (`:97-104`) fails by name for the same condition, so the drift is never silent overall. The in-test comment documents the handoff — acceptable.
- [NOTE] `DELIBERATELY_UNCLASSIFIED` can still be grown to greenwash a brand-new unregistered noun; only the comment (`:22-27`) forbids it. Because it is a test-local const, a self-assertion of its contents would be tautological. If this drift class matters, derive exclusions from a marker on the `cli.ts` side instead.
- [NOTE] The `m.default` branch of `resolveCommandDef` is currently dead in invariant 2 (`doctor`, the only default-export thunk, is `LUCA_TOPLEVEL_WRITE`, never verb-checked) — harmless defensive coverage for future default-export noun groups.
- [NOTE] The `LUCA_READ_VERBS` cross-noun leak (G-ARCH-001, `classify-bash-command.ts:244-248`) has no invariant: a future mutating verb named e.g. `summary` on any noun would classify read-only. Not mechanically testable without a per-(noun,verb) read/write intent manifest; tracking as tech debt.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 1
