---
phase: 09
plan: 02
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 09 Plan 02: Create /seed-memory Migration Skill

## Objective

Create the `/seed-memory` skill that reads existing `.planning/BRAIN.md`, `.planning/MEMORY.md`, `.planning/WORKING.md`, and `.planning/procedures/` files and seeds their content into MuninnDB as structured entities. This skill is idempotent (safe to run multiple times) and reusable across projects adopting MuninnDB.

This skill provides the migration path from file-based memory to MuninnDB. It should be run once per project to populate MuninnDB with existing knowledge.

## Context

@src/skills/**helpers/create-skill.ts
@src/skills/**schemas/skill.schemas.ts
@src/skills/\_\_helpers/build-skill-registry.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md (storage mapping decisions)
@src/skills/general/phase-execute.skill.ts (skill pattern reference)

## Tasks

### 1. Create the seed-memory skill source file

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/seed-memory.skill.ts` using the `createSkill` factory pattern. The skill should:

**Skill metadata:**

- name: `seed-memory`
- description: "Seed MuninnDB with project knowledge from existing BRAIN.md, MEMORY.md, WORKING.md, and procedure files"
- disable-model-invocation: false (needs LLM to parse and structure content)

**Skill prompt content (the steps the agent follows):**

1. **Detect existing files** -- Check for `.planning/BRAIN.md`, `.planning/MEMORY.md`, `.planning/WORKING.md`, `.planning/procedures/` in the project root. Report which files exist.

2. **Seed BRAIN.md** -- If BRAIN.md exists:
   - Read the file content
   - Use `mcp__muninn__muninn_remember_tree` to store as a hierarchical tree with root concept `brain:project-identity`
   - Child nodes for each major section (brain:stack, brain:conventions, brain:architecture, brain:preferences, etc.)
   - Vault: "default"

3. **Seed MEMORY.md** -- If MEMORY.md exists:
   - Read the file content
   - Parse each entry (sections like Patterns, Decisions, Pitfalls, Preferences)
   - Use `mcp__muninn__muninn_remember_batch` to store as individual engrams
   - Concept naming: `pattern:<name>`, `decision:<name>`, `pitfall:<name>`, `preference:<name>`
   - Vault: "default"

4. **Seed WORKING.md** -- If WORKING.md exists:
   - Read the file content
   - Use `mcp__muninn__muninn_remember` to store as session-scoped engrams
   - Concept naming: `session:<section-name>`
   - Vault: "default"

5. **Seed Procedures** -- If `.planning/procedures/` exists:
   - Read each procedure file
   - Use `mcp__muninn__muninn_remember_tree` for each procedure
   - Root concept: `procedure:<procedure-name>`
   - Steps as child nodes
   - Vault: "default"

6. **Verify seeding** -- Use `mcp__muninn__muninn_recall` to verify key entities were stored. Report summary of entities created.

7. **Idempotency** -- Before creating each entity, check if it already exists using `mcp__muninn__muninn_find_by_entity`. If it exists, use `mcp__muninn__muninn_evolve` to update rather than creating duplicates.

**Files to create/edit:**

- `src/skills/general/seed-memory.skill.ts` -- NEW

**Verification:**

- File exists and follows the createSkill pattern
- `bunx --bun tsc --noEmit` passes
- Skill is auto-discovered by the skill registry (follows naming convention)

### 2. Verify skill compiles and registers

**Type:** auto
**TDD:** false
**Depends on:** 1

Run typecheck to confirm the skill compiles. Verify it would be picked up by the skill registry by checking the naming convention matches `*.skill.ts` in `src/skills/general/`.

```bash
bunx --bun tsc --noEmit
```

**Verification:**

- TypeScript compilation succeeds
- File follows `{name}.skill.ts` naming convention in `src/skills/general/`
- Skill content includes all MuninnDB MCP tool references

## Verification

1. `src/skills/general/seed-memory.skill.ts` exists and compiles
2. Skill follows the `createSkill` factory pattern
3. Skill references correct MuninnDB MCP tools: `muninn_remember_tree`, `muninn_remember_batch`, `muninn_remember`, `muninn_find_by_entity`, `muninn_evolve`, `muninn_recall`
4. Skill is idempotent (checks for existing entities before creating)
5. Skill uses vault "default" and type-prefixed entity naming convention
6. `bunx --bun tsc --noEmit` passes

## Success Criteria

- The `/seed-memory` skill exists and can be invoked to migrate file-based memory to MuninnDB
- The skill handles all four data sources: BRAIN.md, MEMORY.md, WORKING.md, procedures/
- The skill is idempotent and reusable across projects
- Entity naming follows the convention defined in CONTEXT.md (brain:_, pattern:_, decision:_, pitfall:_, preference:_, session:_, procedure:\*)

## Output Specification

**Files created:**

- `src/skills/general/seed-memory.skill.ts`
