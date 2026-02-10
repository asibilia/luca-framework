---
name: "test-run"
description: "Run tests with optional filter pattern. Use when the user wants to run tests, test code, execute test suite, check test coverage, or verify tests pass."
---

<main>
# Test Run

Run tests using Bun's built-in test runner.

## Instructions

1. **Determine scope**:
   - With filter: `bun test --filter "[pattern]"`
   - All tests: `bun test`
2. **Report results** and coverage

## Examples

```bash
# Run all tests
bun test

# Run specific file
bun test --filter "**/file.spec.tsx"

# Run workspace-specific tests
bun test --cwd packages-dev/task-archive
```

## Notes

- Coverage reporting enabled by default
- Setup file: `scripts/bun-test-setup.ts`
</main>