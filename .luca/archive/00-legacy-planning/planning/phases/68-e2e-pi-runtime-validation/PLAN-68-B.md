---
id: 68-B
title: "Permanent E2E test suite for Pi extensions"
phase: 68
wave: 2
depends_on: ["68-A"]
---

# Plan 68-B: Permanent E2E Test Suite for Pi Extensions

## Objective

Convert the ad-hoc validation scripts from 68-A into a permanent test file in the test suite that validates Pi extension loading, tool responses, and cross-extension integration on every test run.

## Tasks

### Task 1: Create __tests__/src/hooks/pi-extension-e2e.test.ts
- Extension loading tests (12 extensions, 39 tools, 17 events)
- Tool response shape validation (Pi-compatible format)
- Cross-extension state flows (complexity→gates, chains, safety, research, roles, purpose)

## Verification

- `bun test` passes with new tests included
- TypeScript clean
