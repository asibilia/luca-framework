---
title: "Add snapshot tests for all 10 buildXxxInstructions() outputs in luca-mastracode"
area: testing
created: 2026-04-14
priority: high
source: research
---

## Task

Add snapshot tests for all 10 buildXxxInstructions() outputs in luca-mastracode

## Context

Research for the prompt engineering hardening milestone discovered that `packages/luca-mastracode` has ZERO automated test files. No test script exists in package.json. The only CI gate is TypeScript type-checking (`bunx tsc --noEmit`), which doesn't catch behavioral regressions from prompt changes.

Given that we're about to modify all 10 instruction files and 9 subagent files, having even basic snapshot tests would dramatically reduce regression risk.

## Suggested Implementation

- Create `src/__tests__/instructions.test.ts` with snapshot tests for each `buildXxxInstructions()` output
- Assert expected section headers are present (## Role, ## Pipeline Orchestration, etc.)
- Assert HARD_CONSTRAINTS text appears in assembled output
- Add `test` script to package.json using `bun:test`

## MuninnDB Recall

For full research context, search MuninnDB for 'zero-test-coverage-luca-mastracode' or recall tag 'research'.
