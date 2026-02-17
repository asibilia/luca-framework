---
title: Fix 97 TypeScript errors across 26 files
area: build
created: 2026-02-17T00:27:35Z
source: conversation
---

## Context

Running `bun run tsc` on branch `16--v1.6.0-package-and-publish` produces 97 errors across 26 files. These are blocking clean type-checking and need to be resolved before packaging/publishing.

## Task

Fix all 97 TypeScript compiler errors. The errors fall into these categories:

### Source code errors (must fix — affects runtime correctness)

| File                                                                | Errors | Category                                         |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------ | --------------------------- |
| `index.ts:36`                                                       | 1      | Missing export `BaseRuleImpl`                    |
| `packages/luca-framework/src/adapters/github-adapter.ts:264`        | 1      | `url` possibly undefined                         |
| `packages/luca-framework/src/adapters/jira-adapter.ts:224-234`      | 3      | `.error.issues[0]` possibly undefined            |
| `packages/luca-framework/src/commands/init.ts:104`                  | 1      | `instanceof` on non-object type                  |
| `packages/luca-framework/src/commands/update.ts:427-429`            | 2      | Assigning to readonly properties                 |
| `packages/luca-framework/src/utils/doctor/checks/node-version.ts:8` | 1      | Possibly undefined string                        |
| `packages/luca-framework/src/utils/wizard.ts:47-77`                 | 4      | `string                                          | undefined`passed as`string` |
| `src/agents/base/base-agent.ts:4`                                   | 2      | `verbatimModuleSyntax` requires type-only import |
| `src/agents/general/lu-executor.agent.ts:5`                         | 1      | `verbatimModuleSyntax` requires type-only import |
| `src/agents/general/lu-planner.agent.ts:5`                          | 1      | `verbatimModuleSyntax` requires type-only import |
| `src/hooks/index.ts:177-184`                                        | 2      | Possibly undefined array access                  |

### Script errors (tooling — should fix)

| File                                     | Errors | Category                                       |
| ---------------------------------------- | ------ | ---------------------------------------------- |
| `scripts/generate-agents-from-cursor.ts` | 5      | Frontmatter possibly undefined, type narrowing |
| `scripts/generate-rules-from-cursor.ts`  | 5      | Same pattern as above                          |
| `scripts/generate-skills-from-cursor.ts` | 5      | Same pattern as above                          |

### Test file errors (test-only — should fix)

| File                                          | Errors | Category                               |
| --------------------------------------------- | ------ | -------------------------------------- | --------------------- |
| `__tests__/.../jira-adapter.test.ts`          | 2      | String not assignable to union type    |
| `__tests__/.../lu-discuss-researcher.test.ts` | 2      | Possibly undefined factory             |
| `__tests__/.../lu-test-writer.test.ts`        | 2      | Possibly undefined registry entry      |
| `__tests__/.../claude-compiler.test.ts`       | 1      | Missing `TestRule` export              |
| `__tests__/.../cursor-compiler.test.ts`       | 1      | Missing `TestRule` export              |
| `__tests__/.../integration.test.ts`           | 2      | Possibly undefined `createRule`        |
| `__tests__/.../hook-registry.test.ts`         | 15     | Possibly undefined lookups             |
| `__tests__/.../security-validation.test.ts`   | 8      | `Result<T>` discriminated union access |
| `__tests__/.../validation-utils.test.ts`      | 12     | Same `Result<T>` pattern               |
| `scripts/check-drift.test.ts`                 | 6      | `string                                | undefined`in`.toBe()` |
| `scripts/plugin-spec-e2e.test.ts`             | 6      | Possibly undefined array access        |
| `scripts/plugin-spec-structure.test.ts`       | 6      | Possibly undefined plugin              |

## Notes

- The `Result<T>` discriminated union errors (security-validation, validation-utils) likely need narrowing before accessing `.data` or `.error`
- The `verbatimModuleSyntax` errors need `import type` syntax
- The three `generate-*-from-cursor.ts` scripts share identical frontmatter parsing code — consider extracting a shared utility
- The `BaseRuleImpl` export in `index.ts` suggests the export was removed or renamed during refactoring
