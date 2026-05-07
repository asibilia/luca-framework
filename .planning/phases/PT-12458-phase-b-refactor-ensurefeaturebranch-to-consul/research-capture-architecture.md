# Research Capture — Architecture

**Subagent**: researcher (architecture)
**Timestamp**: 2026-05-07T15:05:00Z

## Findings

### Tool action contract

- Pattern: flat z.object + action z.enum, NEVER discriminatedUnion (Anthropic API rejects oneOf without "type"). workflow-state.ts:246-254.
- Per-action validation INSIDE execute() via runtime parse against per-action schemas.
- ensure-feature-branch.ts already follows pattern (lines 151-194).
- No outputSchema — output is structural TS inference.

**Invariant**: New actions append to ENSURE_FEATURE_BRANCH_ACTIONS, validate inside execute(), no discriminatedUnion.

### State pattern

- readLucaState() luca-store.ts:134, returns {} on missing.
- writeLucaState(updates) line 170: MERGE not replace, atomicWriteSync.
- No baseBranch field today. prBase confirmed absent.

### Mode permissions

createScopedTool narrows action enum at schema time. Phase B: resolve (read-only) → architect+execute+finalize. apply (mutates) → architect only.

### Architect Step 1 (architect.md:32-61)

1. Create GH issue (prose only)
2. ensureFeatureBranch({action:"create", type, issueNumber?, slug})
3. status response drives logic — 6 codes
4. Tool writes branchName + issueNumber to state
5. --skip-branch path writes {skipBranch:true}

**Phase B constraint**: resolve is pure (no writeLucaState, no git mutations). Returns deterministic recommendation.

### Pre-commit guard (executor.ts:12-31)

Protocol step 0 ONCE per session. ensureFeatureBranch({action:"status"}) → on-feature proceed; on-default STOP; detached/no-git STOP. executor.ts:30 prohibits raw shell.

execute.md has NO dedicated pre-commit section. Guard lives in executor.ts only.

### Resolver design constraints

1. Pure function: takes {currentBranch, defaultBranch, preferences?, state?} → {recommendation, proposedBranch?, guardedBranchDetected?, requiresConfirmation:bool}.
2. apply() separate: existing create IS the apply path.
3. ask_user belongs in architect.md prose only (tools cannot call ask_user).
4. guardedBranches policy check belongs in resolver, not create.
5. SAFE_FREEFORM gates any preference value passed to git.
