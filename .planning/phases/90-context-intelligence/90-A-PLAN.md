---
id: 90-A
title: "Scope rules by directory/domain"
phase: 90
wave: 1
complexity: MODERATE
---

# 90-A: Scope Rules by Directory/Domain

## Objective

Reduce context saturation by scoping rules to relevant directories/domains instead of loading all 21 rules into every conversation. Currently every rule is `alwaysApply: true`, consuming ~15-20k tokens of context even when most rules are irrelevant to the task at hand.

## Context

@src/rules/**schemas/rule.schemas.ts -- RuleFrontmatterSchema already has `globs` and `alwaysApply` fields
@src/rules/**helpers/assemble-registry.ts -- generalRules map loads all 13 general rules unconditionally
@src/rules/profiles/typescript/index.ts -- 8 profile rules also always loaded
@src/compilers/**helpers/compile.ts -- compileRuleClaude() / compileRuleCursor() format output
@src/shared/**helpers/format.ts -- toClaudeFormat() strips frontmatter; toCursorFormat() preserves it
@scripts/build-shared.ts -- generateRuleOutputs() iterates all rules for all formats
@.claude/rules/ -- 21 compiled rule files, all loaded into every Claude Code conversation

**Current state:** The `RuleFrontmatterSchema` already supports `globs: z.array(z.string()).optional()` and `alwaysApply: z.boolean().optional()`, but:

- Claude Code's `.claude/rules/` format currently strips YAML frontmatter entirely (H1/H2 markdown only)
- Cursor's `.cursor/rules/*.mdc` format does include frontmatter with `alwaysApply`
- All general rules set `alwaysApply: true` regardless of actual scope

**Stripe precedent:** Stripe conditionally applies agent rules "based on subdirectories" -- rules about API conventions only load when editing API files, reducing noise for non-API work.

## Tasks

### Task 1: Audit and classify all rules by scope

**Goal:** Determine which of the 21 rules are truly global vs domain-specific. Produce a classification table.

**Files:** `.claude/rules/` (read all), `src/rules/general/` (read all), `src/rules/profiles/typescript/` (read all)

**Steps:**

1. Read every rule and classify into one of: GLOBAL (always needed), DOMAIN (only when working in specific directories), CONDITIONAL (only when specific task types occur)
2. For each non-GLOBAL rule, determine the appropriate glob pattern(s) and/or activation trigger
3. Document the classification in a table within this plan's commit message or in a new doc

**Proposed classification:**

| Rule                    | Current     | Proposed    | Glob / Condition                                                       |
| ----------------------- | ----------- | ----------- | ---------------------------------------------------------------------- |
| lu-workflow             | alwaysApply | GLOBAL      | -- (core workflow)                                                     |
| complexity-gating       | alwaysApply | GLOBAL      | -- (always needed for routing)                                         |
| domain-architecture     | alwaysApply | GLOBAL      | -- (structural invariant)                                              |
| module-boundary         | alwaysApply | GLOBAL      | -- (structural invariant)                                              |
| file-naming             | alwaysApply | GLOBAL      | -- (applies everywhere)                                                |
| harness-verification    | alwaysApply | GLOBAL      | -- (verification always runs)                                          |
| hook-skill-boundary     | alwaysApply | GLOBAL      | -- (core design decision)                                              |
| self-improve            | alwaysApply | GLOBAL      | -- (meta-rule for improvements)                                        |
| cursor-rules            | alwaysApply | GLOBAL      | -- (rule authoring standard)                                           |
| mandatory-documentation | alwaysApply | GLOBAL      | -- (applies to all code)                                               |
| state-machine-bridge    | alwaysApply | DOMAIN      | `src/state/**`, `.planning/**`, `packages/luca-framework/src/state/**` |
| atlassian-mcp           | alwaysApply | CONDITIONAL | Only when Jira/issue work is active                                    |
| posthog-integration     | alwaysApply | CONDITIONAL | Only when analytics code is being touched                              |
| api-snake-case          | alwaysApply | DOMAIN      | `src/**/*.schemas.ts`, API-related files                               |
| bun-preference          | alwaysApply | GLOBAL      | -- (project-wide convention)                                           |
| use-bun-instead-of-node | alwaysApply | GLOBAL      | -- (duplicate of bun-preference, consider merging)                     |
| no-classes              | alwaysApply | GLOBAL      | -- (architectural decision)                                            |
| import-standards        | alwaysApply | GLOBAL      | -- (applies everywhere)                                                |
| lodash-preference       | alwaysApply | DOMAIN      | `src/**/*.ts`, `packages/**/*.ts`                                      |
| schema-first-parsing    | alwaysApply | DOMAIN      | `src/**/*.schemas.ts`, `src/**/*.ts`                                   |
| functional-api-reuse    | alwaysApply | GLOBAL      | -- (architectural principle)                                           |

**Verification:**

- [ ] Every rule classified with rationale
- [ ] At least 3-5 rules identified as DOMAIN or CONDITIONAL

### Task 2: Add glob/scope metadata to rule source definitions

**Goal:** Update the `alwaysApply` and `globs` fields in each rule's `.rule.ts` source file to reflect the audit classification.

**Files:** `src/rules/general/*.rule.ts`, `src/rules/profiles/typescript/*.rule.ts`

**Steps:**

1. For rules classified as DOMAIN, set `alwaysApply: false` and add appropriate `globs` array
2. For rules classified as CONDITIONAL, set `alwaysApply: false` and add a descriptive `description` that Claude Code's auto-attach can match on
3. Keep GLOBAL rules as `alwaysApply: true`

**Example change for posthog-integration.rule.ts:**

```typescript
frontmatter: {
  description: "apply when interacting with PostHog/analytics tasks",
  alwaysApply: false,  // Changed from true
  globs: ["**/analytics/**", "**/posthog/**", "**/tracking/**"],
},
```

**Example change for atlassian-mcp.rule.ts:**

```typescript
frontmatter: {
  description: "Atlassian MCP integration patterns - read-only Jira policy and GitHub workflow",
  alwaysApply: false,  // Changed from true
  // No globs -- activated by description matching on Jira/issue tasks
},
```

**Verification:**

- [ ] All DOMAIN rules have `alwaysApply: false` and valid `globs`
- [ ] All CONDITIONAL rules have `alwaysApply: false` and descriptive `description`
- [ ] All GLOBAL rules retain `alwaysApply: true`
- [ ] `bunx --bun tsc --noEmit` passes (type check)

### Task 3: Update Claude format compiler to emit frontmatter

**Goal:** Make `compileRuleClaude()` emit YAML frontmatter with `description`, `globs`, and `alwaysApply` so Claude Code can use glob-based activation for `.claude/rules/` files.

**Files:** `src/shared/__helpers/format.ts`, `src/compilers/__helpers/compile.ts`

**Steps:**

1. Investigate Claude Code's `.claude/rules/` file format -- determine if YAML frontmatter is supported (like Cursor's `.mdc` format). Claude Code docs indicate `.claude/rules/*.md` files DO support YAML frontmatter with `---` delimiters for `description`, `globs`, and `alwaysApply`.
2. Update `toClaudeFormat()` (or `compileRuleClaude()`) to prepend YAML frontmatter when the rule has `globs` or `alwaysApply: false`
3. Ensure backward compatibility -- rules with `alwaysApply: true` and no `globs` can optionally include frontmatter or remain as-is

**Verification:**

- [ ] Compiled `.claude/rules/*.md` files include frontmatter for scoped rules
- [ ] `bun run build:all` succeeds
- [ ] `bun run check:drift` passes after rebuild
- [ ] Rules without globs still compile correctly

### Task 4: Consider merging duplicate Bun rules

**Goal:** Evaluate whether `bun-preference` and `use-bun-instead-of-node-vite-npm-pnpm` should be merged into a single rule to reduce token overhead.

**Files:** `src/rules/profiles/typescript/bun-preference.rule.ts`, `src/rules/profiles/typescript/use-bun-instead-of-node-vite-npm-pnpm.rule.ts`

**Steps:**

1. Compare the content of both rules for overlap
2. If significant overlap, merge into a single `bun-preference` rule
3. Remove the duplicate from the profile and registry
4. Update build outputs

**Verification:**

- [ ] No loss of guidance content from the merge
- [ ] `bun test` passes
- [ ] `bun run build:all` succeeds

## Success Criteria

- [ ] At least 3 rules converted from `alwaysApply: true` to scoped (globs or conditional)
- [ ] Claude format output includes YAML frontmatter for scoped rules
- [ ] Cursor format output continues to work with updated frontmatter
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun run build:all` succeeds
- [ ] `bun run check:drift` passes after rebuild
- [ ] Net reduction in always-loaded context tokens (measurable by counting rules with `alwaysApply: false`)
