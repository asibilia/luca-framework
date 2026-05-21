---
phase: 02-integrations-updates
plan: 05
subsystem: cli-utils
tags: [version-check, approval-gates, configuration]
dependency_graph:
  requires: [02-04]
  provides: [version-notifications, approval-config]
  affects: []
tech_stack:
  added: []
  patterns: [non-blocking-notification, optional-interface-field]
file_tracking:
  key_files:
    created:
      - packages/luca-framework/src/utils/version-check.ts
    modified:
      - packages/luca-framework/src/types.ts
      - packages/luca-framework/src/index.ts
      - packages/luca-framework/templates/base/.planning/config.json
decisions:
  - id: version-check-defer-false
    description: "Set defer: false for immediate notification after CLI completes"
    rationale: "User sees update availability right away, not on next invocation"
metrics:
  duration: ~5 minutes
  completed: 2026-02-04
---

# Phase 2 Plan 5: Version Notifications & Approval Configuration Summary

**Non-blocking version notifications with configurable approval gates for Luca CLI**

## Objective Achieved

Completed Phase 2 with version notification system and approval configuration schema. Users are notified when newer versions are available without CLI performance impact, and can configure approval gates for plan execution, destructive operations, and external API calls.

## Implementation Details

### Task 1: Version Check Utility

Created `packages/luca-framework/src/utils/version-check.ts`:

- **Non-blocking design**: Uses `update-notifier` which spawns background subprocess
- **24-hour cache**: Results cached to avoid repeated npm registry checks
- **Graceful failures**: Silent error handling prevents CLI crashes
- **Path-agnostic**: Works in both development (`src/`) and production (`dist/`) contexts
- **Commit**: `015abbf`

### Task 2: Approval Configuration Types

Updated `packages/luca-framework/src/types.ts`:

- **ApprovalConfig interface** with four fields:
  - `plans: boolean` - Approval before executing generated plans
  - `destructive: boolean` - Approval for file deletions, git force operations
  - `external: boolean` - Approval for external API calls
  - `custom_triggers: string[]` - Regex patterns for custom approval gates
- **LucaConfig extended** with optional `approvals` field for backward compatibility
- **Commit**: `70ef6e1`

### Task 3: Config Template & CLI Wiring

Updated template and CLI entry:

1. **Config template** (`templates/base/.planning/config.json`):
   - Added `approvals` section with secure defaults (all enabled)
   - Maintains backward compatibility with existing configs

2. **CLI entry point** (`src/index.ts`):
   - `checkForUpdates()` called in `runMain()` wrapper
   - Non-blocking: runs in background, doesn't delay CLI startup
   - **Commit**: `3ca76b5`

## Verification Results

| Check | Status |
|-------|--------|
| version-check.ts exists and exports checkForUpdates | ✅ |
| ApprovalConfig type defined in types.ts | ✅ |
| Config template has approvals section | ✅ |
| Version check called on CLI startup | ✅ |
| CLI still works normally | ✅ |
| No blocking behavior from version check | ✅ |
| TypeScript builds successfully | ✅ |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `015abbf` | Create version check utility |
| 2 | `70ef6e1` | Add ApprovalConfig type definition |
| 3 | `3ca76b5` | Wire version check and add approval config template |

## Deviations from Plan

None - plan executed exactly as written.

## Phase 2 Complete

This plan completes Phase 2 (Integrations & Updates):

| Plan | Name | Status |
|------|------|--------|
| 02-01 | Work Tracker Foundation | ✅ Complete |
| 02-02 | GitHub Issues Adapter | ✅ Complete |
| 02-03 | Jira REST Adapter | ✅ Complete |
| 02-04 | Update Mechanism | ✅ Complete |
| 02-05 | Version Notifications & Approvals | ✅ Complete |

**Phase 2 Requirements Addressed:**
- REQ-003: GitHub integration via adapter
- REQ-004: Jira integration via adapter
- REQ-005: Update mechanism with conflict detection

## Key Files

- `packages/luca-framework/src/utils/version-check.ts` - Non-blocking update notifications
- `packages/luca-framework/src/types.ts` - ApprovalConfig interface
- `packages/luca-framework/templates/base/.planning/config.json` - Default config with approvals

## Next Phase

Phase 3: Enterprise Readiness (REQ-007, REQ-008)
