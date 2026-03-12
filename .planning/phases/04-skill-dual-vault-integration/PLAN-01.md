---
phase: 04
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 04 Plan 1: Vault-Routing Rule and CLAUDE.md Instructions

## Objective

Create the foundational vault-routing rule that documents the dual-vault architecture, write routing heuristic, and recall strategy. This rule becomes the single source of truth that all subsequent agent/skill updates reference. Also update the global CLAUDE.md Memory Storage Preference section to reflect dual-vault conventions.

## Context

@.planning/phases/04-skill-dual-vault-integration/CONTEXT.md
@.planning/config.json (muninn.vault field)
@src/rules/general/module-boundary.rule.ts (rule file format reference)
@.claude/rules/lu-workflow.md (existing rule reference for MuninnDB)

## Tasks

### 1. Create vault-routing rule source file

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/rules/general/vault-routing.rule.ts` following the existing rule file pattern (`createRule` + `RuleConfig`). The rule content must document:

**Vault Resolution:**

- Primary: `.planning/config.json` `muninn.vault` field (the "repo vault")
- Fallback: `LUCA_MUNINN_VAULT` env var
- Final fallback: `"default"`
- The `"default"` vault is always used for cross-cutting memories (user identity, patterns, preferences)

**Dual-Vault Recall Strategy (type-based routing):**

| Memory Type                         | Vault Source                | Rationale                         |
| ----------------------------------- | --------------------------- | --------------------------------- |
| brain:project-identity              | Repo vault only             | Project-specific identity tree    |
| brain:user-identity                 | Default vault only          | Cross-project user preferences    |
| session:\*                          | Repo vault only             | Session context is project-scoped |
| pattern:_, pitfall:_, preference:\* | Both vaults, merge by score | Cross-cutting + project-specific  |
| procedure:\*                        | Both vaults, merge by score | Reusable across projects          |
| metric:\*                           | Repo vault only             | Project metrics are scoped        |

**Merge strategy:** Two sequential `muninn_recall` calls (repo vault first, then default), concatenate, sort by relevance, dedup by concept prefix (keep highest-scored).

**Write Routing Heuristic (concept-prefix-based):**

| Concept Prefix         | Write To      | Rationale                          |
| ---------------------- | ------------- | ---------------------------------- |
| session:\*             | Repo vault    | Session context is project-scoped  |
| version:_, milestone:_ | Repo vault    | Release history is project-scoped  |
| brain:project-\*       | Repo vault    | Project identity                   |
| brain:user-\*          | Default vault | User identity is cross-cutting     |
| pattern:\*             | Default vault | Generalizable patterns             |
| pitfall:\*             | Default vault | Generalizable warnings             |
| preference:\*          | Default vault | User preferences are cross-cutting |
| procedure:\*           | Default vault | Reusable workflows                 |
| metric:signal-rate-\*  | Repo vault    | Per-project process metrics        |
| process:\*             | Default vault | Process tuning is cross-cutting    |

**Ambiguity heuristic:** "Would this memory be useful in a completely different repo?" Yes -> default vault. No -> repo vault.

**Config snippet reference:**

```json
{
  "muninn": {
    "vault": "luca-framework"
  }
}
```

**Frontmatter:** `description: "Vault routing: dual-vault recall strategy and write heuristic for MuninnDB"`, `globs: ["src/agents/**/*.ts", "src/skills/**/*.ts"]`, `alwaysApply: true`.

**Files to create:**

- `src/rules/general/vault-routing.rule.ts`

**Verification:**

- File follows `createRule` pattern matching existing rules (e.g., `module-boundary.rule.ts`)
- Rule exports a valid `RuleConfig` with frontmatter and sections
- `bunx --bun tsc --noEmit` passes

### 2. Update global CLAUDE.md vault instructions

**Type:** auto
**TDD:** false
**Depends on:** 1

Update the user's global CLAUDE.md (`~/.claude/CLAUDE.md`) Memory Storage Preference section to reflect dual-vault awareness. The existing section says "Use vault 'default' unless the user specifies otherwise." This needs to be updated to reference the per-project vault from config.json and explain the dual-vault concept:

- Repo vault (from `config.json muninn.vault` or `LUCA_MUNINN_VAULT` env) for project-scoped memories
- Default vault for cross-cutting memories (user preferences, generalizable patterns)
- Reference the vault-routing rule for detailed type-based routing

Keep the existing Vault Configuration section (priority order: env var -> config.json -> "default") but clarify that "default" is the cross-cutting vault, not a project vault.

**Files to edit:**

- `/Users/alecsibilia/.claude/CLAUDE.md`

**Verification:**

- CLAUDE.md mentions dual-vault concept
- CLAUDE.md references config.json muninn.vault field
- CLAUDE.md explains repo vault vs default vault distinction

## Verification

1. `bunx --bun tsc --noEmit` passes with the new rule file
2. The vault-routing rule file follows the same pattern as other rules in `src/rules/general/`
3. CLAUDE.md updates are consistent with CONTEXT.md decisions
4. No hardcoded vault: "default" in the new rule file's examples (use "REPO_VAULT" or config reference instead)

## Success Criteria

- A `vault-routing.rule.ts` file exists in `src/rules/general/` documenting the complete dual-vault architecture
- The global CLAUDE.md reflects dual-vault awareness
- Downstream plans (Plan 2 and Plan 3) can reference the vault-routing rule as their authority

## Output Specification

- `src/rules/general/vault-routing.rule.ts` — new rule file
- `~/.claude/CLAUDE.md` — updated global instructions
