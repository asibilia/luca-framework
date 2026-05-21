---
phase: 02-integrations-updates
plan: 02
subsystem: adapters
tags: [github, gh-cli, execa, work-tracker]

dependency_graph:
  requires: ["02-01"]
  provides: ["github-adapter", "gh-cli-integration"]
  affects: ["02-05"]

tech_stack:
  added: []
  patterns: ["gh-cli-subprocess", "label-based-inference"]

key_files:
  created:
    - packages/luca-framework/src/adapters/github-adapter.ts
  modified:
    - packages/luca-framework/src/adapters/index.ts

decisions:
  - id: "gh-cli-over-rest"
    summary: "Use gh CLI instead of GitHub REST API"
    rationale: "CLI handles auth, rate limiting, and provides reliable JSON output"
  - id: "label-inference"
    summary: "Infer ticket type/priority from GitHub labels"
    rationale: "GitHub Issues lack native type/priority fields; labels are conventional"
  - id: "develop-fallback"
    summary: "Fallback to git checkout if gh issue develop fails"
    rationale: "Not all repos have gh issue develop configured"

metrics:
  duration: "~2 minutes"
  completed: "2026-02-04"
---

# Phase 2 Plan 02: GitHub Issues Adapter Summary

**One-liner:** GitHub Issues adapter using gh CLI with label-based type/priority inference and graceful error handling.

## Objective

Implement the GitHub Issues adapter using the gh CLI for issue retrieval and branch creation. This validates the adapter pattern works with real external data before tackling Jira's more complex REST API.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Implement GitHub Adapter | ad0d716 | ✅ Done |
| 2 | Wire Factory and Test Integration | d7ad497 | ✅ Done |

## Implementation Details

### Task 1: GitHub Adapter Implementation

**File created:** `packages/luca-framework/src/adapters/github-adapter.ts`

**Key components:**
- `createGitHubAdapter()` factory function returning WorkTrackerContract
- `getTicket()` using `gh issue view --json` for issue retrieval
- `createBranch()` with `gh issue develop` fallback to `git checkout -b`
- `linkPR()` as no-op (GitHub auto-links via "Closes #123")
- `validate()` checking `gh auth status`

**Helper functions:**
- `inferTypeFromLabels()` — Maps labels to WorkTicketType (bug/story/epic/task)
- `inferPriorityFromLabels()` — Maps labels to WorkTicketPriority (highest/high/medium/low)
- `parseGhError()` — Converts execa errors to user-friendly messages

### Task 2: Factory Wiring

**File modified:** `packages/luca-framework/src/adapters/index.ts`

**Changes:**
- Added `createGitHubAdapter` import
- Routed 'github' type to GitHub adapter in factory switch
- Exported `createGitHubAdapter` from module
- Updated JSDoc documentation

## Verification Results

| Check | Status |
|-------|--------|
| github-adapter.ts exists | ✅ Pass |
| TypeScript builds without errors | ✅ Pass |
| Factory returns GitHub adapter for type='github' | ✅ Pass |
| validate() detects gh CLI status | ✅ Pass |
| getTicket() returns proper WorkTicket structure | ✅ Pass |
| Error handling provides helpful messages | ✅ Pass |

**Live test results:**
```typescript
const adapter = createWorkTrackerAdapter('github');
// adapter.name === 'github' ✓
// adapter.validate() === { success: true, data: true } ✓
// adapter.getTicket('#1') returns issue with proper mapping ✓
```

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| gh CLI over REST API | CLI handles auth, rate limiting, and provides reliable JSON output |
| Label-based type inference | GitHub Issues lacks native type field; labels are conventional |
| Label-based priority inference | GitHub Issues lacks native priority field; labels are conventional |
| gh issue develop fallback | Not all repos have develop command configured; git checkout as backup |
| linkPR as no-op | GitHub auto-links PRs via "Closes #123" keywords in PR body |

## Deviations from Plan

None — plan executed exactly as written.

## Files Changed

**Created:**
- `packages/luca-framework/src/adapters/github-adapter.ts` (299 lines)

**Modified:**
- `packages/luca-framework/src/adapters/index.ts` (+12 lines)

## Next Phase Readiness

**Provides for 02-05 (Version Check & Approvals):**
- Working GitHub adapter for issue-linked workflows
- Validated adapter pattern with real external data

**No blockers identified.**

## Key Links

```typescript
// Factory → GitHub adapter
import { createGitHubAdapter } from './github-adapter'

// GitHub adapter → execa (shell execution)
import { execa } from 'execa'

// GitHub adapter → WorkTrackerContract
implements WorkTrackerContract
```

---
*Summary generated: 2026-02-04*
