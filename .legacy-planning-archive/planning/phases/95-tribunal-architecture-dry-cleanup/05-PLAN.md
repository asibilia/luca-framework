---
id: 95-E
title: "Update module-boundary.md documented exceptions table"
phase: 95
wave: 3
complexity: TRIVIAL
todo: 95-E
depends_on: [95-A, 95-B, 95-C, 95-D]
---

# 95-E: Update module-boundary.md Documented Exceptions Table

## Objective

After completing plans 95-A through 95-D, review the module boundary state and update the documented exceptions table in `.claude/rules/module-boundary.md` to reflect the new architecture.

Specifically:

- The CRITICAL entity isolation violation (skills importing from agents) is resolved by 95-A
- Any new cross-tier imports introduced by the refactoring (e.g., `shared` importing from `complexity` in 95-C) should be documented if they are exceptions to the standard rules
- Remove any documented exceptions that no longer exist

This is a documentation-only plan with no code changes.

## Context

@.claude/rules/module-boundary.md -- the module boundary rules file containing the documented exceptions table (Rule 5)
@src/shared/**helpers/tribunal-detector.ts -- after 95-A + 95-C, imports from ~/complexity (T0-to-T0, within-tier, not an exception)
@src/agents/**helpers/verification-tribunal.ts -- after 95-B + 95-C, imports from ~/shared and ~/complexity (T2-to-T0, allowed)
@src/agents/**helpers/root-cause-tribunal.ts -- after 95-B + 95-C, imports from ~/shared and ~/complexity (T2-to-T0, allowed)
@src/iteration/**helpers/ -- after 95-D, imports from ~/shared (T1-to-T0, allowed)

## Tasks

### Task 1: Audit current cross-tier imports

**Goal:** Verify the state of all cross-domain imports after 95-A through 95-D are complete.

**Steps:**

1. Confirm that `src/skills/` no longer imports from `src/agents/`:
   - Search `src/skills/` for any `from "~/agents` imports
   - The only remaining agents imports should be in test files (which are outside src/)

2. Confirm all new imports follow tier rules:
   - `src/shared/` (T0) importing from `src/complexity/` (T0): **Within-tier, allowed**
   - `src/agents/` (T2) importing from `src/shared/` (T0): **Downward, allowed**
   - `src/agents/` (T2) importing from `src/complexity/` (T0): **Downward, allowed**
   - `src/iteration/` (T1) importing from `src/shared/` (T0): **Downward, allowed**

3. Verify existing documented exceptions still hold:
   - `shared/__helpers/validation-utils.ts` -> agents/skills/rules `__schemas/`: Check if this exception still exists
   - `harness/parsers/parser-registry.ts` -> `~/harness/__schemas/harness.schemas`: Check if this still exists

**Verification:**

- [ ] Zero entity isolation violations (no T2-to-T2 cross-imports)
- [ ] All new imports follow tier rules

### Task 2: Update the exceptions table

**Goal:** Update Rule 5 in `.claude/rules/module-boundary.md` to reflect the current state.

**Files:** `.claude/rules/module-boundary.md`

**Steps:**

1. Read the current Rule 5 documented exceptions table.

2. If the entity isolation violation (skills -> agents for tribunal code) was previously documented as an exception, **remove it** -- it is now resolved.

3. Verify the remaining exceptions are still accurate:
   - `shared/__helpers/validation-utils.ts` -> entity `__schemas/` files: Verify this still exists and is still needed.
   - `harness/parsers/parser-registry.ts` -> `~/harness/__schemas/harness.schemas`: Verify this still exists.

4. If 95-C introduced a `shared` -> `complexity` import in `tribunal-detector.ts`, note that this is a T0-to-T0 import (within-tier), NOT a tier violation, so it does NOT need to be in the exceptions table.

5. If any NEW exceptions were introduced by 95-A through 95-D that do not follow the standard rules, add them to the table with a clear reason.

6. Update the introductory text if needed to reflect that the previous entity isolation violation has been resolved.

**Verification:**

- [ ] Exceptions table is accurate and up to date
- [ ] No removed exceptions still listed
- [ ] No new exceptions unlisted
- [ ] All exceptions have clear reasons documented

### Task 3: Final documentation review

**Goal:** Verify the module-boundary.md is consistent with the actual codebase state.

**Steps:**

1. Run `bunx --bun tsc --noEmit` to confirm no type errors (documentation change should not affect compilation, but verify the codebase is clean).
2. Review the full module-boundary.md for any references to the old architecture that need updating (e.g., if it mentions tribunal code living in agents as the canonical location).
3. If the `domain-architecture.md` rule file references tribunal schemas in agents, note that a follow-up update may be needed (but this is documentation only, not blocking).

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] module-boundary.md reflects the current architecture accurately
- [ ] No stale references to the old tribunal location in module boundary rules

## Success Criteria

- [ ] `.claude/rules/module-boundary.md` exceptions table is updated
- [ ] Entity isolation violation is no longer listed as a known exception (it is resolved)
- [ ] Any remaining exceptions are accurate and documented with reasons
- [ ] No new tier violations exist in the codebase
- [ ] Documentation accurately reflects the current import graph
