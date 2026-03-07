---
name: test-run
description: Run the project test suite with optional filter pattern and coverage reporting.
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