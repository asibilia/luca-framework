---
phase: 226
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 226 Plan 1: Security Hardening

## Objective

Harden enforcement hooks against false-positive skill matching, unvalidated context file parsing, and overly-permissive file permissions. Eliminate the last hand-rolled enforcement hook (pre-step-pr-address) by migrating it to the factory.

## Context

@src/hooks/**helpers/enforcement-hook-factory.ts
@src/hooks/**helpers/hook-io.ts
@src/skills/\_\_schemas/context-helpers.ts
@src/hooks/scripts/pre-step-pr-address.ts
@.planning/phases/226-security-hardening/01-CONTEXT.md

## Tasks

### 1. Exact Skill Matching and Bun.file Migration in Enforcement Hook Factory

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the substring-based skill matching (`skillArg.includes(name)`) in `enforcement-hook-factory.ts` with exact match logic. Extract the skill name as either the exact `tool_input.skill` value or the first whitespace-delimited token from `tool_input.args`, then use `subSkills.has(skillName)` for lookup.

Simultaneously, migrate the context file read from `readFileSync` + `JSON.parse` to `Bun.file().json()` with a Zod safeParse for `current_state`. Define a minimal schema (object with `current_state` as optional string) and use `safeParse` instead of raw `JSON.parse`. Remove the `import { readFileSync } from "fs"` import.

**Files to create/edit:**

- `src/hooks/__helpers/enforcement-hook-factory.ts` -- exact match logic, Bun.file migration, Zod safeParse

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `readFileSync` import from `"fs"` is removed from enforcement-hook-factory.ts
- Skill matching uses `subSkills.has(skillName)` instead of `skillArg.includes(name)`
- Context file reading uses `Bun.file(contextPath)` and Zod `safeParse`
- The `skillName` extraction uses `(toolInput?.skill as string) || ((toolInput?.args as string) || "").split(/\s+/)[0]`

### 2. File Permissions on Context Files and Dedup Guard Files

**Type:** auto
**TDD:** false
**Depends on:** none

Add `0o600` (owner read/write only) permissions to context files written by `createContextHelpers` in `context-helpers.ts`. After `Bun.write`, call `chmod` via `node:fs/promises` to set permissions. This restricts /tmp context files (containing workflow state) to the current user.

Also add `0o600` permissions to dedup guard files in `hook-io.ts`. Migrate `writeFileSync` calls in `guardDedup`, `guardPreStep`, and `recordThrottle` to use `Bun.write` followed by `chmodSync(path, 0o600)`. Remove the `writeFileSync` import from `"fs"` if all usages are migrated; keep `readFileSync` for the guard read paths (synchronous reads required for dedup timing).

**Files to create/edit:**

- `src/skills/__schemas/context-helpers.ts` -- add `chmod` after `Bun.write` in `write()` method
- `src/hooks/__helpers/hook-io.ts` -- add permissions to guard file writes, migrate write calls to Bun.write

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `context-helpers.ts` write function sets `0o600` permissions after writing
- `hook-io.ts` guard file writes set `0o600` permissions
- `writeFileSync` import is removed from hook-io.ts (replaced by `Bun.write` for writes)

### 3. Migrate pre-step-pr-address to Enforcement Hook Factory

**Type:** auto
**TDD:** false
**Depends on:** 1

Rewrite `pre-step-pr-address.ts` to use `createSubSkillEnforcementHook` from the factory instead of hand-rolled enforcement logic. This eliminates ~80 lines of duplicated control flow (stdin parsing, dedup guard, skill matching, context reading, state validation) that the factory already handles.

The hook should define its config (sub-skills set, valid states map, context path, initial skill) and delegate to the factory. The constants `PR_ADDRESS_SUB_SKILLS`, `VALID_STATES_FOR_SKILL`, and `CONTEXT_PATH` become config values passed to `createSubSkillEnforcementHook`.

**Files to create/edit:**

- `src/hooks/scripts/pre-step-pr-address.ts` -- rewrite to use factory

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `pre-step-pr-address.ts` imports and calls `createSubSkillEnforcementHook`
- No direct imports of `readFileSync`, `readStdinJson`, `exitSuccess`, `exitBlock`, or `guardPreStep` in the file
- The file is under 40 lines (config + factory call)
- Sub-skill set, valid states map, and initial skill match the original values

### 4. Build and Drift Check

**Type:** checkpoint:human-action
**TDD:** false
**Depends on:** 1, 2, 3

Run `bun run build:all` (must be run by developer outside Claude Code session to avoid crashes) and then `bun run check:drift` to verify generated output matches source.

**Verification:**

- Developer confirms `bun run build:all` completes without errors
- `bun run check:drift` reports no drift

## Verification

1. `bunx --bun tsc --noEmit` passes across the entire project
2. No `readFileSync` or `writeFileSync` imports remain in enforcement-hook-factory.ts
3. `writeFileSync` is removed from hook-io.ts (writes migrated to Bun.write)
4. All enforcement hooks (lu, phase-execute, verify, milestone-complete, pr-address) use the factory
5. File permissions are set to `0o600` on context files and dedup guard files

## Success Criteria

- Skill matching in enforcement hooks uses exact match (no substring false positives)
- Context file parsing uses Zod safeParse (no raw JSON.parse without validation)
- File I/O uses Bun.file/Bun.write (no node:fs for writes)
- Context files and guard files are restricted to owner-only permissions (0o600)
- pre-step-pr-address.ts is migrated to the factory pattern

## Output Specification

- Modified: `src/hooks/__helpers/enforcement-hook-factory.ts`
- Modified: `src/hooks/__helpers/hook-io.ts`
- Modified: `src/skills/__schemas/context-helpers.ts`
- Modified: `src/hooks/scripts/pre-step-pr-address.ts`
