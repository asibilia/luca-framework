# Reintroduce Tests (Dedicated Effort)

## Context

All test files were removed on 2026-03-06 because:

1. The pre-commit gate (`pre-commit-gate.sh`) runs `bun test` on every commit attempt
2. When multiple agents spawn in parallel, each triggers the gate, creating hundreds of `bun test` processes
3. These processes orphan when sessions die, consuming ~15 GB+ RAM and freezing the machine
4. The test suite had grown to 225+ files / 207+ test modules — too large for the gate to run synchronously

## What was removed

- `__tests__/` directory (225 files — integration tests, unit tests, test utilities)
- `*.test.ts` files scattered in `src/` and `packages/` (pi-extensions helpers, luca-observer)
- Test step in `pre-commit-gate.sh` (disabled, not deleted)

## Plan for reintroduction

1. **Do NOT re-add tests ad-hoc** — do it in a single dedicated effort
2. Selectively reintroduce only high-value tests (contract tests, security tests, critical path integration)
3. Fix the pre-commit gate to run tests with a timeout and process group cleanup
4. Consider running tests only on explicit `bun test` invocation, not on every commit
5. Add test process limits (e.g., `--concurrency=1` or similar) to prevent runaway spawning
