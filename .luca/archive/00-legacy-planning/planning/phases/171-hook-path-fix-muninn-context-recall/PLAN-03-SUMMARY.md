# PLAN-03 Summary: Add generated-file-guard Rule

## Result: COMPLETE

**Phase:** 171 | **Plan:** 3 | **Wave:** 2

## Tasks Completed

| #   | Task                                       | Commit     | Status |
| --- | ------------------------------------------ | ---------- | ------ |
| 1   | Create generated-file-guard.rule.ts        | `dae1c02e` | Done   |
| 2   | Register in rules assembly                 | `10ccd5e4` | Done   |
| 3   | Add to UNIVERSAL_RULES in deploy-global.ts | `5b0ee91a` | Done   |

## What Was Done

1. **Created `src/rules/general/generated-file-guard.rule.ts`** -- New rule following the `createRule` pattern (matching `no-tests.rule.ts`). The rule has `alwaysApply: true` and explains:
   - `.claude/hooks/*.sh` and `.claude/statusline.sh` are generated output
   - Source of truth is `src/hooks/scripts/`
   - Direct edits are silently overwritten by `bun run build:all`
   - How to modify hook behavior (edit TS source, then build)
   - How to modify wrapper generation (`generate-shell-wrappers.ts`)

2. **Registered in `src/rules/__helpers/assemble-registry.ts`** -- Added import and entry in the `generalRules` record, alphabetically placed between `file-naming` and `harness-verification`.

3. **Added `"generated-file-guard.md"` to `UNIVERSAL_RULES`** in `scripts/deploy-global.ts` -- Alphabetically placed between `functional-api-reuse.md` and `import-standards.md` (which is not in the set, so after `functional-api-reuse.md`).

## Verification

- TypeScript compiles without errors (pre-existing errors in `luca-observer` are unrelated)
- Rule file exists at expected path
- Rule is registered in assembly registry
- Rule is in UNIVERSAL_RULES set for global deployment

## Deviations

None.

## Files Changed

- **NEW:** `src/rules/general/generated-file-guard.rule.ts`
- **MODIFIED:** `src/rules/__helpers/assemble-registry.ts` (import + registry entry)
- **MODIFIED:** `scripts/deploy-global.ts` (UNIVERSAL_RULES addition)
