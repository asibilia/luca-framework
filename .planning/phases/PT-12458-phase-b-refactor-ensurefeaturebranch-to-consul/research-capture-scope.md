# Research Capture — Scope

**Subagent**: researcher (scope)
**Timestamp**: 2026-05-07T15:05:00Z

## Findings

### Tool: ensure-feature-branch.ts (463 lines)

- Imports: child_process.execFileSync, mastra createTool, zod, lucaStore (no projectPreferences)
- Action enum: ENSURE_FEATURE_BRANCH_ACTIONS = ['status','create','rename'] line 151
- BRANCH_TYPES const lines 107-115. Not exported. Used in z.enum() at line 168.
- defaultBranch() lines 70-83: git symbolic-ref → fallback main/master/trunk. Never reads preferences.
- status() lines 211-238: returns detached|on-default|on-feature. PT-12458 root cause: any non-default = on-feature.
- create logic lines 241-362: validates type+slug, idempotent if current!=def && !force, buildBranchName, collision checks, git switch -c, writeLucaState({branchName, issueNumber}).
- rename logic lines 364-446.
- Exports: ENSURE_FEATURE_BRANCH_ACTIONS (151), ensureFeatureBranchTool (157), __testing (459).

### Callers (3 direct)

| Site | File | Line | Action | Mode |
|------|------|------|--------|------|
| Architect Step 1 | architect.md | 35,38 | "create" | architect |
| Executor pre-commit | subagents/executor.ts | 20,27 | "status" | execute |
| Finalize pre-push | finalize.md | 339 | "status" | finalize |

### Tool-manifest registration (lines 220-235)

ensure_feature_branch:
- record_key: ensureFeatureBranch
- modes: architect:'*', execute:['status'], finalize:['status'], build:'*', fast:'*'
- research/review/triage/discuss: zero access

### State

- LucaWorkflowState (luca-store.ts) only has branchName?: string. NO prBase, NO baseBranch.
- HarnessState (state.ts:103-110): branchName, issueNumber, skipBranch (Mastra-backed, in-memory).

### Phase A BranchingSection schema (project-preferences.ts:36-44)

Delivered: types[], template, defaultBranch, guardedBranches[]
MISSING for Phase B: branchTypes[] multi-rule, fallback rule, base resolution kind, confirmBaseBeforeCreate flag

### Out-of-band: gh-prepare skill

Does NOT call ensureFeatureBranch. Uses raw git. OUT OF SCOPE for Phase B (track as known gap).

### .changeset/config.json

baseBranch="main" (line 10). LEAVE ALONE.
