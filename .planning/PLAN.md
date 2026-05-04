# Plan: Fix bundled assets install ordering race condition

## Objective
Move `installSlashCommands()`, `installSkills()`, `installRules()` to before
`createMastraCode()` in `main()` so harness workspace scanners see bundled
assets on the very first `luca run` in a fresh cwd. Closes #212.

## Context
`createMastraCode()` scans `skillPaths` (including `<cwd>/.mastracode/skills/`)
during construction. Install calls currently at lines 673–675 run after that
scan completes. In a fresh cwd the dirs don't exist yet → bundled assets
invisible until second run. Install fns are pure `node:fs`/`node:path`, sync,
zero external deps — safe to run before harness construction.

## Phase 1: Fix install ordering race condition

### Wave 1: Reorder + test (parallel)
- [ ] **Task 1.1**: Move install calls before `createMastraCode()` in `launch.ts`
  - Files: `packages/luca-mastracode/src/launch.ts`
  - Delete the comment + 3 call lines (672–675); insert before line 211 with
    comment: `// Must run before createMastraCode so harness scanners see bundled assets on first run (fixes #212)`
  - Verification: `grep -n "installSkills\|createMastraCode" src/launch.ts`
    shows install line < createMastraCode line

- [ ] **Task 1.2**: Add smoke test for install ordering
  - Files: `packages/luca-mastracode/src/__tests__/install-bundled-assets.test.ts`
  - Use `mkdtempSync` + `process.chdir(tmp)` in `beforeEach`; restore cwd +
    `rmSync(tmpRoot)` in `afterEach`; call three install fns; assert
    `.mastracode/{skills,commands,rules}` all exist and are non-empty
  - Verification: `bun test src/__tests__/install-bundled-assets.test.ts` passes;
    then full `bun test` suite still 65+ passing

## Verification Criteria
- `tsc --noEmit` clean
- `bun test` passes (65+ tests, new test included)
- Install call line numbers in `launch.ts` are lower than `createMastraCode` line

## Risks & Mitigations
- **Install before branding?** No — install fns have zero external deps; safe anywhere
- **`installRules()` rmSync before harness loads rules?** Safe — harness not yet constructed
