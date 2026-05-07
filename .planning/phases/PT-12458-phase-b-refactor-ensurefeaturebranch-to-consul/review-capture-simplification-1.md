# Review Capture — Simplification [Wave 1]

**Subagent**: reviewer
**Perspective**: simplification
**Timestamp**: 2026-05-07T16:00:00Z

## Findings

**MUST-FIX**:

SIMP-1: `inferredType` ternary is dead logic — all three branches return `'feat'`.
  - File: ensure-feature-branch.ts:318-319
  - Expression: `role === 'feature' ? 'feat' : role === 'release' || role === 'rc' ? 'feat' : 'feat'` returns `'feat'` unconditionally.
  - Silent correctness hazard: a reader writing `role: 'release'` expecting `release/ENG-1428--release` gets `feat/ENG-1428--release` with no warning.
  - Fix: Either decide the contract — `const type = input.type ?? (role === 'release' ? 'release' : role === 'rc' ? 'rc' : 'feat')` — or simplify to `const type = input.type ?? 'feat'` (delete ternary).

**SHOULD-FIX**:

SIMP-2: `consult` action inlines manual defaults instead of using `DEFAULT_PREFERENCES.branching`.
  - File: ensure-feature-branch.ts:599-613
  - Drift hazard: when defaults change in schema, this copy won't follow.
  - Fix: `const merged = prefs?.branching ?? { ...DEFAULT_PREFERENCES.branching, defaultBranch: def }`

SIMP-3: `kindUsed` on `ResolvedBaseRule` is a 4-value discriminant used only as a boolean check `=== 'ask'`.
  - File: ensure-feature-branch.ts:169-171, 350
  - Fix: Replace with `isAsk: boolean` to remove phantom type surface.

**NOTE**:

- `notes[]` populated but never consumed by callers (debug trace as first-class return)
- Two slugify implementations coexist (acceptable — track until create/rename cutover)
- Two-test-file split is structurally necessary (mock.module semantics)
- LUCA_FRAMEWORK_PREFERENCES fixture: minimal and correct
- BRANCH_TYPES + buildBranchName not dead — actively called by create/rename actions

## Verdict

REQUEST_CHANGES — 1 MUST-FIX (dead inferredType ternary), 2 SHOULD-FIX
