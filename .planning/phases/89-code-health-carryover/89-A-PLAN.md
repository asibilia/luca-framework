---
id: 89-A
title: "Fix test suite isolation — 31 failures in full bun test run"
phase: 89
wave: 2
complexity: MODERATE
---

# 89-A: Fix Test Suite Isolation — 31 Failures in Full `bun test` Run

## Objective

Eliminate the 31 test failures that occur only in the full `bun test` suite (2827 pass, 31 fail out of 2858). These tests pass when run individually but fail due to module resolution ordering, missing renderCall/renderResult functions, or stale registry expectations in the combined run.

This is a CI-blocking issue: the full suite must be green for harness verification to pass.

## Context

@file **tests**/packages/luca-framework/src/utils/branding.test.ts (passes individually, branding tests are NOT failing)
@file src/hooks/pi-extensions/luca-subagents.ts (renderCall/renderResult not exported as functions)
@file src/hooks/pi-extensions/luca-widgets.ts (widget event subscription tests fail)
@file src/hooks/pi-extensions/**helpers/session-init.ts (handleSessionStart/handleSessionPersist failures)
@file src/agents/**helpers/build-agent-registry.ts (AGENT_CATEGORIES staleness test)
@file src/hooks/scripts/session-start.sh (session hook tests)

### Failure Categories (31 unique failures)

**Category 1: Pi extension renderCall/renderResult (11 failures)**

- `luca-subagents.ts has renderCall on create and renderResult on result`
- `luca_verify renderCall returns human-readable description`
- `luca_verify renderCall handles missing checks`
- `luca_verify renderResult formats pass/fail with check details`
- `luca_verify renderResult handles malformed result gracefully`
- `luca_subagent_create has renderCall`
- `luca_subagent_create renderCall shows agent and task preview`
- `luca_subagent_result has renderResult`
- `luca_subagent_result renderResult formats status and output`
- `luca_subagent_result renderResult handles malformed result`
- Root error: `TypeError: tool.renderCall is not a function`

**Category 2: Pi extension event/widget tests (6 failures)**

- `luca-widgets extension > subscribes to 7 events`
- `luca-widgets extension > tool_result handler parses chain define event`
- `luca-widgets extension > tool_result handler parses tilldone event`
- `luca-widgets extension > tool_result handler parses verify event`
- `luca-widgets extension > agent_start clears stale widgets`
- `luca-widgets.ts loads and registers 0 tools, 7 events`

**Category 3: Session hook handler tests (7 failures)**

- `handleContextCheckThrottled > falls back to WORKING.md size when ctx unavailable`
- `handleSessionPersist > removes session lock`
- `handleSessionPersist > appends session-end marker to WORKING.md`
- `handleSessionPersist > sanitizes reason (SEC-02)`
- `handleSessionPersist > updates existing session-end marker instead of duplicating`
- `handleSessionStart > creates .planning/ directory and memory files`
- `handleSessionStart > returns void when all files already exist`

**Category 4: State bridge writeField tests (5 failures)**

- `writeField > returns error when state.json is missing (stateExists false)`
- `writeField > returns previous value on success`
- `writeField > preserves existing context fields when writing a new one`
- `writeField > returns error for invalid JSON in state.json`
- `writeComplexity > returns previous complexity value`

**Category 5: Miscellaneous (2 failures)**

- `category staleness > AGENT_CATEGORIES > every agent in the registry has a category mapping`
- `autopilotSkill - content verification > contains phase execution loop`
- `Pi extension E2E: setFooter > luca-state session_start calls setFooter when available`

## Tasks

### Task 1: Diagnose and categorize root causes

**Goal:** Determine the exact root cause for each failure category. Some may share a common cause (module cache pollution across test files), others may be independent issues.
**Files:** Test files under `__tests__/`, source files under `src/hooks/pi-extensions/`
**Steps:**

1. Run the failing test files in isolation to confirm they pass individually: `bun test __tests__/src/hooks/pi-extensions/` and similar
2. Run pairs of test files together to identify which combination triggers failures
3. Check if `bun test --preload` or test setup is clearing module state between files
4. For renderCall/renderResult failures: check if the Pi extension registration API changed (tools may now use a different property name or registration pattern)
5. For session hook failures: check if filesystem mocking (mock-fs or temp dirs) is leaking between test files
6. For writeField failures: check if state.json fixtures are shared/conflicting between tests
7. For AGENT_CATEGORIES staleness: check if `lu-roadmap-architect` was added to the registry but not to AGENT_CATEGORIES

**Verification:**

- [ ] Root cause identified for each failure category
- [ ] Documented which failures share a common cause

### Task 2: Fix Pi extension renderCall/renderResult test failures

**Goal:** Make all 11 renderCall/renderResult tests pass in the full suite
**Files:** `__tests__/src/hooks/pi-extensions/`, `src/hooks/pi-extensions/luca-subagents.ts`, `src/hooks/pi-extensions/luca-widgets.ts`
**Steps:**

1. Based on diagnosis, fix the root cause (likely: tool registration format changed, tests expect `renderCall` as a direct function on the tool object, but it may now be registered differently)
2. If the source changed: update tests to match new API
3. If the tests are correct but module isolation is the issue: add proper test isolation (beforeEach/afterEach cleanup, or restructure imports)

**Verification:**

- [ ] All 11 renderCall/renderResult tests pass in full suite

### Task 3: Fix session hook and state bridge test failures

**Goal:** Make all 12 session hook and state bridge tests pass in the full suite
**Files:** `__tests__/src/hooks/pi-extensions/`, `__tests__/packages/luca-framework/`
**Steps:**

1. Fix filesystem mock leakage or temp directory conflicts
2. Ensure each test file creates its own isolated temp directory
3. Fix state.json fixture conflicts between writeField tests
4. Add proper cleanup in afterEach/afterAll hooks

**Verification:**

- [ ] All 12 session hook and state bridge tests pass in full suite

### Task 4: Fix AGENT_CATEGORIES staleness and remaining failures

**Goal:** Fix the remaining 2-3 miscellaneous failures
**Files:** `src/agents/__helpers/build-agent-registry.ts`, `__tests__/src/agents/`, `__tests__/src/skills/`
**Steps:**

1. Add `lu-roadmap-architect` (and any other missing agents) to AGENT_CATEGORIES
2. Fix autopilot content verification test (likely expects specific string that changed)
3. Fix setFooter test for luca-state session_start

**Verification:**

- [ ] All remaining tests pass in full suite

### Task 5: Verify full suite is green

**Goal:** Confirm 0 failures in complete `bun test` run
**Files:** All test files
**Steps:**

1. Run `bun test` and confirm 0 failures
2. Run `bunx --bun tsc --noEmit` and confirm no type errors
3. Run `bun test` a second time to confirm no flaky tests

**Verification:**

- [ ] `bun test` reports 0 failures (all 2858+ tests pass)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Second run also passes (no flakiness)

## Success Criteria

- [ ] `bun test` passes with 0 failures in the full suite
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] No test was deleted or skipped to achieve green — all 31 failures are genuinely fixed
- [ ] Root causes documented in commit message
