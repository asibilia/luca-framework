---
phase: 182
plan: 3
type: improvement
autonomous: true
wave: 3
depends_on: [1, 2]
---

# Phase 182 Plan 3: Post-Merge Verification -- Grep Audit and Final Typecheck

## Objective

Run comprehensive post-merge verification to ensure zero residual autopilot references remain anywhere in the source tree, rules, or planning files. Confirm the entire codebase compiles cleanly after the consolidation.

## Context

@src/skills/luca/lu.skill.ts -- Merged skill file from Wave 1
@.planning/phases/182-skill-consolidation/182-CONTEXT.md -- Phase context (reference map)

## Tasks

### 1. Grep audit: zero autopilot references in src/

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2 must be complete -- enforced by wave dependency)

Run a comprehensive grep across the source tree to find any remaining "autopilot" references:

```bash
grep -r 'autopilot' src/ --include='*.ts' -l
```

**Expected result:** Zero files returned.

**Exceptions (acceptable matches):**

- Config key references like `c.autopilot?.oversight` in lu.skill.ts are EXPECTED and correct (config key stays 'autopilot' per CONTEXT.md decision 1)
- The string "autopilot" appearing in config key access patterns (e.g., `c.autopilot?.`) is acceptable

**NOT acceptable:**

- Any `import` statement referencing autopilot
- Any `Skill(skill: "autopilot")` invocation
- Any docstring saying "spawned by the autopilot skill"
- Any display string saying "Luca AUTOPILOT"
- Any skill registry entry for autopilot
- Any CORE_SKILL_NAMES entry for autopilot

If unacceptable references are found, fix them following the patterns established in Wave 2 (replace "autopilot skill" with "lu skill", etc.).

**Verification:**

- `grep -r 'autopilot' src/ --include='*.ts' | grep -v 'c\.autopilot\?\.' | grep -v 'config\.autopilot' | grep -v "// Config key is 'autopilot'"` returns zero results
- All remaining "autopilot" strings are config key access patterns only

### 2. Grep audit: zero autopilot references in .claude/rules/

**Type:** auto
**TDD:** false
**Depends on:** none

Run grep across the rules directory:

```bash
grep -r 'autopilot' .claude/rules/ -l
```

**Expected result:** Zero files returned.

If any references are found, update them to reference "lu" instead.

**Verification:**

- `grep -r 'autopilot' .claude/rules/` returns zero results

### 3. Grep audit: check .planning/ for stale autopilot references

**Type:** auto
**TDD:** false
**Depends on:** none

Run grep across planning files for awareness (these are documentation, not code):

```bash
grep -r 'autopilot' .planning/ --include='*.md' -l
```

**Expected behavior:** CONTEXT.md and PLAN files for this phase will mention "autopilot" as they describe the merge. That is acceptable -- they are historical records. ROADMAP.md and STATE.md should NOT have active autopilot references (references to running autopilot as a command).

Check ROADMAP.md specifically:

```bash
grep 'autopilot' .planning/ROADMAP.md
```

If ROADMAP.md has references like "run /autopilot" or "invoke autopilot skill", update them to reference /lu.

**Verification:**

- ROADMAP.md has no active "run autopilot" or "/autopilot" command references
- Any autopilot mentions in phase-specific files (CONTEXT.md, PLANs) are acceptable as historical

### 4. Final typecheck

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Run the full TypeScript type check to confirm the entire codebase compiles cleanly:

```bash
bunx --bun tsc --noEmit
```

This verifies:

- lu.skill.ts compiles with all 13 sections
- No broken imports from deleted autopilot.skill.ts
- No type errors introduced by reference updates
- All agent files compile correctly

**Verification:**

- `bunx --bun tsc --noEmit` exits with code 0
- Zero type errors reported

### 5. Verify skill count in registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Verify the skill registry has the correct count after removing autopilot:

```bash
grep -c '^  ' src/skills/__helpers/build-skill-registry.ts
```

The registry should have one fewer entry than before (autopilot removed, lu remains). The current registry has entries for both autopilot and lu. After removal, only lu should remain as the unified entry point.

Also verify that lu is still in the registry:

```bash
grep 'lu:' src/skills/__helpers/build-skill-registry.ts
```

**Verification:**

- "autopilot" entry is absent from skillRegistry
- "lu" entry is present in skillRegistry
- Total entry count is one less than before the merge

## Verification

After all tasks complete:

1. Zero unacceptable "autopilot" references exist anywhere in `src/`
2. Zero "autopilot" references exist in `.claude/rules/`
3. No active "autopilot" command references in `.planning/ROADMAP.md`
4. `bunx --bun tsc --noEmit` passes with zero errors
5. The skill registry contains "lu" but not "autopilot"

## Success Criteria

- Complete confidence that the autopilot-to-lu consolidation is clean
- No dangling imports, broken references, or stale documentation
- The codebase compiles and is ready for the next build

## Output Specification

- No new files created
- Potentially modified files (only if grep audit finds issues):
  - Any file with residual autopilot references
