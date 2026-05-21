---
phase: 03-enterprise-readiness
plan: 01
subsystem: doctor
tags:
  - diagnostics
  - cli
  - health-checks
requires:
  - 01-01
  - 01-02
provides:
  - doctor command
  - environment diagnostics
affects:
  - 03-02
  - 03-03
tech-stack:
  added:
    - pathe
  patterns:
    - check orchestration
    - result aggregation
key-files:
  created:
    - packages/luca-framework/src/commands/doctor.ts
    - packages/luca-framework/src/utils/doctor/index.ts
    - packages/luca-framework/src/utils/doctor/types.ts
    - packages/luca-framework/src/utils/doctor/checks/node-version.ts
    - packages/luca-framework/src/utils/doctor/checks/cursor-ide.ts
    - packages/luca-framework/src/utils/doctor/checks/config-validation.ts
    - packages/luca-framework/src/utils/doctor/checks/index.ts
  modified:
    - packages/luca-framework/src/index.ts
decisions:
  - Use citty subCommand for doctor diagnostics
  - Run checks in parallel for performance
  - Provide auto-fix suggestions in output
metrics:
  duration: 15m
  completed: 2026-02-05
---

# Phase 3 Plan 01: Doctor command Summary

Implemented the `npx luca doctor` diagnostic command with essential health checks for environment readiness.

## Objective
Implement a diagnostic tool to verify environment setup, Node.js version, IDE presence, and configuration validity.

## Key Changes

### Doctor Engine
- Created `executeDoctor` orchestration engine in `packages/luca-framework/src/utils/doctor/index.ts`
- Defined `DoctorCheck` and `CheckResult` interfaces in `packages/luca-framework/src/utils/doctor/types.ts`
- Implemented parallel check execution and result aggregation with formatted output.

### Health Checks
- **Node.js Version**: Verifies Node.js >= 18.0.0.
- **Cursor IDE**: Detects Cursor installation on macOS, Windows, and Linux.
- **Config Validation**: Validates `.planning/config.json` presence and basic structure.

### CLI Integration
- Added `doctor` command to `packages/luca-framework/src/commands/doctor.ts`
- Registered the command in the main CLI entry point.

## Deviations from Plan
None - plan executed exactly as written.

## Next Phase Readiness
The doctor command is now available to help users troubleshoot their environment before starting work with Luca.
