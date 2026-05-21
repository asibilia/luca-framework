---
phase: 04
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 04 Plan 2: lu-cognition Dual-Vault Recall and lu-learner Write Routing

## Objective

Update the two agents with the most complex vault changes: lu-cognition (dual-vault recall with merged scoring) and lu-learner (write routing heuristic). These are the core agents that define how memories are read from and written to the correct vaults. All 23 `vault: "default"` references in lu-cognition and all 14 in lu-learner must be replaced with vault-aware logic.

## Context

@.planning/phases/04-skill-dual-vault-integration/CONTEXT.md
@src/rules/general/vault-routing.rule.ts (created in Plan 1)
@src/agents/general/lu-cognition.agent.ts (23 vault: "default" references)
@src/agents/general/lu-learner.agent.ts (14 vault: "default" references)
@.planning/config.json (muninn.vault: "luca-framework")

## Tasks

### 1. Update lu-cognition: vault resolution preamble

**Type:** auto
**TDD:** false
**Depends on:** none

Add a vault resolution step at the start of lu-cognition's execution flow (before `load_brain`). This step instructs the agent to:

1. Read `.planning/config.json` and extract `muninn.vault` field as `REPO_VAULT`
2. Set `DEFAULT_VAULT = "default"` (always the cross-cutting vault)
3. Establish the fallback chain: config.json muninn.vault -> LUCA_MUNINN_VAULT env -> "default"
4. Store both vault names for use in all subsequent MuninnDB calls

This is a new `<step name="resolve_vaults">` inserted before `load_brain` in the execution flow.

**Files to edit:**

- `src/agents/general/lu-cognition.agent.ts`

**Verification:**

- The resolve_vaults step is the first step in execution_flow (before load_brain)
- Both REPO_VAULT and DEFAULT_VAULT are defined

### 2. Update lu-cognition: brain tree and session operations -> repo vault

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace all `vault: "default"` references for repo-scoped operations with `vault: REPO_VAULT`:

- `load_brain` step: `muninn_recall_tree(vault: REPO_VAULT, ...)` — brain:project-identity is repo-scoped
- `cleanup_stale_sessions` step: All `muninn_recall`, `muninn_remember`, `muninn_forget` calls for session:\* -> `vault: REPO_VAULT`
- `outcome_check` step: `muninn_recall` for metric:outcome-completion -> `vault: REPO_VAULT` (metrics are repo-scoped)
- `outcome_check` step: `muninn_remember` for outcome:\* -> `vault: REPO_VAULT` (outcomes are repo-scoped)
- `outcome_check` step: `muninn_evolve` for metric engrams -> `vault: REPO_VAULT`
- `initialize_working` step: `muninn_session` and `muninn_remember` for session:context -> `vault: REPO_VAULT`
- `generate_report` step: All `muninn_remember` for session:\* tracking instructions -> `vault: REPO_VAULT`

**Pattern:** Every `session:*`, `metric:*`, `brain:project-*`, and `outcome:*` operation uses REPO_VAULT.

**Files to edit:**

- `src/agents/general/lu-cognition.agent.ts`

**Verification:**

- No `vault: "default"` remains for session:_, metric:_, brain:project-_, outcome:_ operations
- All these operations now reference REPO_VAULT (the variable, not a hardcoded string)

### 3. Update lu-cognition: dual-vault recall in selective_recall

**Type:** auto
**TDD:** false
**Depends on:** 1

Update the `selective_recall` step to implement dual-vault recall with merged scoring:

**Single-vault types (repo only):**

- brain:project-identity -> REPO_VAULT only
- session:\* -> REPO_VAULT only
- metric:\* -> REPO_VAULT only

**Single-vault types (default only):**

- brain:user-identity -> DEFAULT_VAULT only

**Dual-vault types (both, merge by score):**

- pattern:_, pitfall:_, preference:\* -> Both vaults, merge results
- procedure:\* -> Both vaults, merge results

**Implementation for dual-vault recall:**

1. First call: `muninn_recall(vault: REPO_VAULT, context: "<keywords>", mode: "semantic")`
2. Second call: `muninn_recall(vault: DEFAULT_VAULT, context: "<keywords>", mode: "semantic")`
3. Concatenate results from both calls
4. Sort by relevance score descending
5. Deduplicate by concept prefix (keep highest-scored entry)
6. Apply existing composite scoring model on the merged set

Update the `load_global_memory` step: Replace the existing "global vault" recall (which was `vault: "default"`) with the dual-vault recall described above. The `load_global_memory` step effectively becomes the "default vault" half of the dual recall, already integrated into `selective_recall`.

**Files to edit:**

- `src/agents/general/lu-cognition.agent.ts`

**Verification:**

- selective_recall step describes two sequential muninn_recall calls (repo then default)
- Merge strategy is documented (concatenate, sort, dedup)
- load_global_memory step references DEFAULT_VAULT (not hardcoded "default")
- Composite scoring applies to the merged result set

### 4. Update lu-learner: vault resolution preamble

**Type:** auto
**TDD:** false
**Depends on:** none

Add vault resolution to lu-learner's execution flow. Insert a preamble at the start of the `load_working` step (or as a new first step) that:

1. Reads `.planning/config.json` and extracts `muninn.vault` as REPO_VAULT
2. Sets DEFAULT_VAULT = "default"
3. Documents the write routing heuristic inline:
   - session:_, version:_, milestone:_, brain:project-_, metric:signal-rate-\* -> REPO_VAULT
   - brain:user-_, pattern:_, pitfall:_, preference:_, procedure:_, process:_ -> DEFAULT_VAULT
   - Ambiguity test: "Would this be useful in another repo?" Yes -> DEFAULT, No -> REPO

**Files to edit:**

- `src/agents/general/lu-learner.agent.ts`

**Verification:**

- Vault resolution is documented at start of execution
- Write routing table is present in the agent prompt

### 5. Update lu-learner: read operations -> appropriate vaults

**Type:** auto
**TDD:** false
**Depends on:** 4

Replace `vault: "default"` in all read operations:

- `load_working` step: `muninn_recall` for session context -> `vault: REPO_VAULT` (session is repo-scoped)
- `load_memory` step: `muninn_recall` for existing patterns/decisions -> dual-vault recall (REPO_VAULT then DEFAULT_VAULT, merge results) since patterns/decisions live in both vaults
- `extract_procedures` step: `muninn_recall` for existing procedures -> dual-vault recall
- `update_confidence` step: `muninn_recall` for feedback metrics -> `vault: REPO_VAULT` (metrics are repo-scoped)

**Files to edit:**

- `src/agents/general/lu-learner.agent.ts`

**Verification:**

- Session reads use REPO_VAULT
- Pattern/decision/procedure reads use dual-vault recall
- Metric reads use REPO_VAULT

### 6. Update lu-learner: write operations -> routed vaults

**Type:** auto
**TDD:** false
**Depends on:** 4

Replace `vault: "default"` in all write operations using the write routing heuristic:

- `write_memory` step: Route based on concept prefix:
  - `pattern:<name>` -> `vault: DEFAULT_VAULT`
  - `decision:<name>` -> `vault: DEFAULT_VAULT`
  - `pitfall:<name>` -> `vault: DEFAULT_VAULT`
  - `procedure:<name>` -> `vault: DEFAULT_VAULT`
- `link_memories` step: All `muninn_link` and `muninn_recall` calls -> route to the vault where the engram was written (same vault as the source engram)
- `update_confidence` step: `muninn_evolve` and `muninn_remember` for session:findings -> `vault: REPO_VAULT`
- `clear_working` step: `muninn_forget` for session:\* -> `vault: REPO_VAULT`
- `extract_procedures` step: `muninn_remember` for procedure:\* -> `vault: DEFAULT_VAULT`

**Files to edit:**

- `src/agents/general/lu-learner.agent.ts`

**Verification:**

- Pattern/decision/pitfall/procedure writes go to DEFAULT_VAULT
- Session writes/clears go to REPO_VAULT
- Metric writes go to REPO_VAULT
- Link operations match the vault of their source engram
- No remaining `vault: "default"` in the file

## Verification

1. `bunx --bun tsc --noEmit` passes after all changes
2. `grep -c 'vault: "default"' src/agents/general/lu-cognition.agent.ts` returns 0
3. `grep -c 'vault: "default"' src/agents/general/lu-learner.agent.ts` returns 0
4. Both agents reference REPO_VAULT and DEFAULT_VAULT consistently
5. lu-cognition's selective_recall describes dual-vault merge strategy
6. lu-learner's write_memory routes to correct vault by concept prefix

## Success Criteria

- Zero hardcoded `vault: "default"` references remain in lu-cognition.agent.ts
- Zero hardcoded `vault: "default"` references remain in lu-learner.agent.ts
- lu-cognition performs dual-vault recall for pattern/pitfall/preference/procedure types
- lu-learner routes writes to the correct vault based on concept prefix
- Both agents resolve vault names from config.json at the start of their execution

## Output Specification

- `src/agents/general/lu-cognition.agent.ts` — updated with dual-vault recall
- `src/agents/general/lu-learner.agent.ts` — updated with write routing heuristic
