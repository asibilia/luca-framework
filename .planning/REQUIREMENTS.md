# Requirements — v2.5.1 Code Health & Test Reliability

## Overview

Address repo audit findings: eliminate `any` types in state domain, extract logic from impure barrels, fix the test isolation bug, and add missing context domain test coverage.

## Source

- Todos: `.planning/todos/pending/27-30` (4 todos from repo audits)
- Autopilot session: 2026-03-02

## Requirements

### R1: State Domain Type Safety

**Priority:** HIGH | **Source:** Todo #27

- R1.1: All guard functions in `src/state/guards.ts` use proper `MachineContext` and `MachineEvent` types instead of `any`
- R1.2: `src/state/bridge.ts` `any` casts replaced with typed alternatives
- R1.3: `src/state/persistence.ts` `any` usages replaced with proper types
- R1.4: `src/state/machine.ts` `any` usage replaced with proper types
- R1.5: TypeScript compiles cleanly with `bunx --bun tsc --noEmit`

### R2: Barrel File Purity

**Priority:** HIGH | **Source:** Todo #28

- R2.1: `src/rules/index.ts` — registry logic extracted to `src/rules/__helpers/assemble-registry.ts`
- R2.2: `src/agents/index.ts` — agent registry extracted to `src/agents/__helpers/build-agent-registry.ts`
- R2.3: `src/skills/index.ts` — skill registry extracted to `src/skills/__helpers/build-skill-registry.ts`
- R2.4: `src/harness/parsers/index.ts` — parser registry extracted to `parsers/parser-registry.ts`
- R2.5: `src/adapters/index.ts` — adapter factory extracted to `packages/luca-framework/src/adapters/adapter-factory.ts`
- R2.6: `src/utils/doctor/index.ts` — doctor logic extracted to `packages/luca-framework/src/utils/doctor/run-doctor.ts`
- R2.7: `src/index.ts` — CLI entry point extracted to `cli.ts` or `main.ts`
- R2.8: All 7 barrel files contain only re-export statements after refactor
- R2.9: All existing imports continue to resolve (no breaking changes)

### R3: Test Suite Isolation Fix

**Priority:** HIGH | **Source:** Todo #29

- R3.1: Root cause of `validateBranding` module resolution failure identified
- R3.2: Fix applied so all tests pass in a single `bun test` run
- R3.3: No regressions — previously passing tests still pass
- R3.4: Test count maintained or increased

### R4: Context Domain Test Coverage

**Priority:** MEDIUM | **Source:** Todo #30

- R4.1: Tests for `src/context/__schemas/context.schemas.ts` Zod schema validation
- R4.2: Tests for `src/context/__helpers/context-assembler.ts`
- R4.3: Tests for `src/context/__helpers/defaults.ts`
- R4.4: Tests for `src/context/__helpers/resolve-context-tier.ts`
- R4.5: Tests for `src/context/__helpers/result-aggregator.ts`
- R4.6: Tests for `src/context/__helpers/result-envelope.ts`
- R4.7: All new tests pass in isolation and in full suite

---

_Requirements created: 2026-03-02_
