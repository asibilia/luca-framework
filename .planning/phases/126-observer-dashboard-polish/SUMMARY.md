---
phase: 126
phase_name: Observer Dashboard Polish
total_plans: 5
waves: 4
status: ready_for_execution
---

# Phase 126: Observer Dashboard Polish - Summary

## Overview

This phase improves the observer dashboard UI/UX and reliability through 5 focused plans organized into 4 waves.

## Wave Organization

### Wave 1: Loading Skeleton Consistency
- **Plan:** 126-01
- **Todo:** #40
- **Status:** Independent, can start immediately
- **Goal:** Replace inline loading states with LoadingSkeleton component across 7 pages

### Wave 2: Error Boundaries
- **Plan:** 126-02
- **Todo:** #41
- **Status:** Depends on Wave 1 completion
- **Goal:** Add React error boundaries to all observer pages with user-friendly error handling

### Wave 3: Empty States
- **Plan:** 126-03
- **Todo:** #49
- **Status:** Depends on Wave 2 (follows error boundary patterns)
- **Goal:** Add missing empty states to workflow, harness, and cost pages

### Wave 4: Parallel Execution
Two independent plans that can be executed in parallel:

1. **Accessibility (126-04, Todo #47)**
   - Add focus rings, ARIA attributes, and keyboard navigation
   - Isolated UI enhancements

2. **Todo Tracking (126-05, Todo #64)**
   - Display todos from .planning/todos/ in dashboard
   - New feature with filesystem-based data source

## Plans Summary

| Plan | Wave | Todo | Type | Tasks | Complexity |
|------|------|------|------|-------|------------|
| 126-01 | 1 | #40 | UI Refactor | 7 pages | Trivial |
| 126-02 | 2 | #41 | Infrastructure | 5 tasks | Low |
| 126-03 | 3 | #49 | UI Enhancement | 4 tasks | Low |
| 126-04 | 4 | #47 | Accessibility | 6 tasks | Low |
| 126-05 | 4 | #64 | New Feature | 5 tasks | Medium |

## Dependencies

```
126-01 (Wave 1)
    ↓
126-02 (Wave 2)
    ↓
126-03 (Wave 3)
    ↓
┌────────────────────┐
│ 126-04 (Wave 4)    │ ← Parallel execution
│ 126-05 (Wave 4)    │
└────────────────────┘
```

## Verification Criteria

### Wave 1 - Loading Skeleton
- [ ] All 7 pages use LoadingSkeleton component
- [ ] Only expected animate-pulse instances remain (cost page, LoadingSkeleton itself)
- [ ] Visual consistency verified

### Wave 2 - Error Boundaries
- [ ] ErrorBoundary component created and exported
- [ ] All 10 observer pages wrap data sections with error boundary
- [ ] console.error added to hook catch blocks
- [ ] User-friendly error banner with retry works

### Wave 3 - Empty States
- [ ] Workflow transition log shows empty state
- [ ] Harness page handles null result
- [ ] Cost page has standardized loading
- [ ] All empty states follow existing pattern

### Wave 4 - Accessibility
- [ ] All interactive elements have focus rings
- [ ] Collapse toggles have aria-expanded
- [ ] Icon-only buttons have aria-labels
- [ ] Status indicators have aria-labels
- [ ] Keyboard navigation works

### Wave 4 - Todo Tracking
- [ ] useTodos hook reads from todo directories
- [ ] TodoTracker component displays todos
- [ ] Visual differentiation between pending/done
- [ ] Metadata correctly displayed
- [ ] Dashboard integration complete

## Execution Order

1. Execute 126-01 (Wave 1)
2. Execute 126-02 (Wave 2)
3. Execute 126-03 (Wave 3)
4. Execute 126-04 and 126-05 in parallel (Wave 4)

## Expected Outcomes

- Consistent loading states across all observer pages
- Graceful error handling with user-friendly messaging
- Clear empty states for no-data scenarios
- WCAG 2.1 Level AA accessibility compliance
- Visible todo tracking in dashboard
- Improved overall user experience and reliability

## Complexity Assessment

**Overall Phase Complexity:** TRIVIAL (complexity gate)
- No research required
- No plan verification required
- Well-defined todos with clear acceptance criteria
- Components and patterns already exist in codebase
- Can be completed in a single development session
