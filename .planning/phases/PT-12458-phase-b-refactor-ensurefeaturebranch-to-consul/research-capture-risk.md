# Research Capture — Risk

**Subagent**: researcher (risk)
**Timestamp**: 2026-05-07T15:05:00Z

## Ranked findings

### P0 — Silent correctness failures

#### RISK-1: PT-12458 regression latent
- NOT currently present (architect.md:38 calls create unconditionally)
- LATENT: architect.md:50 misleading comment `(only seen via action="status")` — landmine
- Mitigation: never insert status→skip-create. Remove/rewrite comment.

#### RISK-2: guardedBranches[] empty array → no-op
- project-preferences.ts:43 has NO min(1)
- Mitigation: BOTH (a) `.min(1)` schema, AND (b) tool fallback to ['main']

#### RISK-3: Full-auto bypasses confirmBaseBeforeCreate
- execute.md:71, discussion.ts:98, modes/*:43 suppress ask_user when full-auto
- Mitigation: confirmBaseBeforeCreate is HARD STOP independent of oversight. Either return status:"base-needs-confirmation" blocking pipeline, OR always confirm regardless. Document G-DX-003 carve-out.

### P1 — Likely incorrect behavior

#### RISK-4: State write ordering
- Current correct: git first (337), writeLucaState second (349)
- Phase B apply must preserve. New baseBranch/prBase need typing in LucaWorkflowState.

#### RISK-5: Multi-rule first-match hazard
- Catch-all `^.*$` at index 0 hijacks all tickets
- Mitigation: schema JSDoc documents ordering, optional warn at seed

#### RISK-6: Pre-commit guard scope
- executor.ts:20 ✅, finalize.md:339 ✅
- execute.md Step 6 NO independent guard (relies on executor)
- gh-prepare NO ensureFeatureBranch call
- OVERFLOW fresh executors: "ONCE per session" check may misread state
- Mitigation: instruct OVERFLOW executors to always run guard on first commit. gh-prepare gap accepted.

### P2 — Quality

#### RISK-7: status blast radius — fan-in 3, additive Phase B = no breaking change
#### RISK-8: Test gaps — 8+ new categories needed

## Phase B planning impact

1. Schema fix (guardedBranches min(1)) Wave 1 — assert-not-default depends on it
2. Oversight carve-out is architectural invariant, not just prose
3. gh-prepare known gap accepted
4. architect.md:50 cleanup
5. LucaWorkflowState extension required for baseBranch + prBase
