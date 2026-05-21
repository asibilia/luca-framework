# Phase 4 Context: Testing

## Decisions

### Test Scope & Priorities

- **I/O layer first**: Adapters (GitHub, Jira, Placeholder), CLI commands (init, update, doctor), template rendering, and file operations are the priority. This is where real bugs live.
- **Pure logic second**: Zod schemas, base classes, compilers, branding utils, manifest hashing — low-risk but easy wins after I/O coverage is solid.
- **Agent/Skill/Rule files (104 files in src/)**: Schema validation only. Test that each config parses against its Zod schema. Do NOT test string content or section ordering — these are configuration, not logic.
- **Build scripts (9 files in scripts/)**: Smoke tests only. Verify each script runs without error. Don't test transformation logic in detail.
- **Primary test value**: Edge cases in user flows. What happens when init wizard gets bad input, update hits conflicts, doctor finds missing dependencies, adapters get API errors.

### Mocking Strategy

- **Module-level mocking**: Use `bun:test`'s `mock.module()` to intercept imports. No dependency injection refactoring needed.
- **Adapter contract tests**: Shared contract test suite parameterized for each adapter implementation. One suite validates WorkTrackerContract compliance uniformly across GitHub, Jira, and Placeholder adapters.
- **Wizard testing**: Mock `@clack/prompts` with pre-configured responses. Test the decision logic through the wizard, not the UI rendering.
- **External deps to mock**: `execa` (gh CLI, git commands), `fetch` (Jira API), `fs-extra` / `node:fs` (filesystem), `@clack/prompts` (interactive UI), `process.env` (configuration).

### Test Architecture

- **File layout**: Centralized `__tests__/` directory mirroring the source tree structure. NOT co-located.
  - `__tests__/packages/luca-framework/src/adapters/github-adapter.test.ts`
  - `__tests__/packages/luca-framework/src/commands/init.test.ts`
  - `__tests__/src/skills/types/skill.schemas.test.ts`
  - etc.
- **Shared test utilities**: Create a `__tests__/utils/` module with mock factories for execa, fetch, fs, @clack/prompts. Reused across all test files.
- **Filesystem tests**: Real temp directories created per test, cleaned up in `afterEach`. Use `Bun`'s temp dir support. No mocked filesystem for template/manifest tests.
- **Fixture data**: Test fixtures for config.json, manifest.json, etc. can live in `__tests__/fixtures/`.

### Coverage Expectations

- **Target**: 80% line coverage for `packages/luca-framework/src/`.
- **Enforcement**: Report only. Generate coverage reports for visibility. Don't block on thresholds yet — this is the first test pass.
- **Schema tests in src/**: Lower bar — verify parsing works, don't aim for line coverage metrics on config/content files.

## Deferred Ideas

(None captured during discussion)

## Technical Context

### Testability Assessment

**No existing test infrastructure**: Zero test files, no bunfig.toml, no test scripts in package.json. Clean slate.

**No dependency injection**: All modules import deps directly. Module-level mocking is the only viable approach without refactoring.

**Side effects to watch**: `version-check.ts` spawns background process on import, `logger.ts` creates global consola instance, `files.ts` registers SIGINT handler.

**Pure modules (trivially testable)**: Zod schemas, TypeScript type definitions, branding config creation, manifest hash computation, base class constructors.

**I/O-heavy modules (need mocking)**: All 3 CLI commands, all 3 adapters, template rendering, wizard prompts, doctor checks, file operations.

---

*Context gathered: 2026-02-09*
