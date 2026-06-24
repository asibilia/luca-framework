---
phase: 05
plan: 1
type: fix
autonomous: true
wave: 1
depends_on: []
---

# Phase 05 Plan 1: Audit Gap Closure — Missing Vault Preambles

## Objective

Close the 3 integration gaps identified by the v4.2.0 milestone audit. Add vault resolution preambles to 2 files that reference MuninnDB but lack vault routing, and add the `muninn` config section to the Pi extensions default config template.

## Context

@.planning/v4.2.0-MILESTONE-AUDIT.md (gaps section)
@src/rules/general/vault-routing.rule.ts (vault routing reference)
@.planning/config.json (muninn.vault: "luca-framework")

## Tasks

### 1. Add vault resolution preamble to lu-process-data.agent.ts

**Type:** auto
**TDD:** false
**Depends on:** none

`src/agents/luca/lu-process-data.agent.ts` references MuninnDB `muninn_remember` for storing process metrics (line 246, `storage_keys` object) but has no vault resolution. All operations are `metric:*` scoped (project-specific).

**Changes:**

1. Add a vault resolution step/preamble in the agent's prompt content (near the cognition or execution section). The preamble should instruct the agent to:
   - Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT
   - Set DEFAULT_VAULT = "default"
   - Use REPO_VAULT for all metric:\* writes (process metrics are repo-scoped)

2. Where the prompt references `muninn_remember` for storing metrics, add `vault: REPO_VAULT` to the instruction.

**Files to edit:**

- `src/agents/luca/lu-process-data.agent.ts`

**Verification:**

- The file contains a vault resolution instruction
- Metric storage instructions reference REPO_VAULT
- `bunx --bun tsc --noEmit` passes

### 2. Add vault resolution preamble to pr-address.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

`src/skills/general/pr-address.skill.ts` references MuninnDB `muninn_remember` and `muninn_link` for learning capture (lines 612-614, pitfall engrams) but has no vault resolution.

**Changes:**

1. Add a vault resolution preamble in the skill's prompt content (near the top of the main section or before the MuninnDB usage section). Pattern:

   ```
   **Vault Resolution:** Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT.
   Set DEFAULT_VAULT = "default". Use REPO_VAULT for session-scoped operations and
   DEFAULT_VAULT for cross-cutting learnings (pattern, pitfall, decision).
   ```

2. Where the prompt references `muninn_remember` for pitfall engrams, add `vault: DEFAULT_VAULT` (pitfalls are cross-cutting).
3. Where the prompt references `muninn_link`, add `vault: DEFAULT_VAULT` (linking to cross-cutting engrams).

**Files to edit:**

- `src/skills/general/pr-address.skill.ts`

**Verification:**

- The file contains a vault resolution instruction
- Pitfall/learning writes reference DEFAULT_VAULT
- Link operations reference DEFAULT_VAULT
- `bunx --bun tsc --noEmit` passes

### 3. Add muninn config section to Pi extensions session-init.ts

**Type:** auto
**TDD:** false
**Depends on:** none

`src/hooks/pi-extensions/__helpers/session-init.ts` creates a default `config.json` in the `detectAndWriteConfig` function (line 220) but does not include a `muninn` section. When a project initializes via Pi (not Claude Code), the vault resolution falls through to the "default" fallback, collapsing to single-vault mode.

**Changes:**

Add a `muninn` section to the default config object at line 220, after the `safety` section and before the `hooks` section (or wherever logical):

```typescript
muninn: {
  vault: "default",
},
```

Using `"default"` as the initial vault name is intentional — new projects start with the default vault. The user can later run `luca-bridge init-vault` to configure a project-specific vault.

**Files to edit:**

- `src/hooks/pi-extensions/__helpers/session-init.ts`

**Verification:**

- The default config template includes `muninn: { vault: "default" }`
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes after all changes
2. All 3 gap files now have vault resolution or muninn config
3. No new hardcoded `vault: "default"` in agent/skill prompt content (the Pi session-init is a config template, not a prompt)

## Success Criteria

- lu-process-data.agent.ts has vault resolution preamble with REPO_VAULT for metric writes
- pr-address.skill.ts has vault resolution preamble with DEFAULT_VAULT for pitfall/learning writes
- Pi session-init.ts creates config.json with muninn section
- TypeScript compilation passes

## Output Specification

- 3 modified source files
- No new files created
