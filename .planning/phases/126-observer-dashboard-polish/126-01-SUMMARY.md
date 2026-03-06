---
plan_id: 126-01
phase: 126
title: "Loading Skeleton Consistency"
status: completed
verification:
  - status: pass
    detail: All 7 pages use LoadingSkeleton instead of EmptyState for loading
  - status: pass
    detail: No inline animate-pulse loading patterns remain (except cost page metric cards + workflow state diagram)
  - status: pass
    detail: TypeScript compiles without errors
---

# Plan 126-01 Summary

## Files Changed

| File | Change |
|------|--------|
| `app/agents/page.tsx` | Replaced `EmptyState` with `<LoadingSkeleton variant="card" />` |
| `app/iterations/page.tsx` | Replaced `EmptyState` with chart+card+table skeletons |
| `app/planning/page.tsx` | Replaced `EmptyState` with card+table skeletons |
| `app/workflow/page.tsx` | Replaced `EmptyState` with `<LoadingSkeleton variant="table" />` for transition log |
| `app/cost/page.tsx` | Replaced `EmptyState` with chart+table skeletons, kept animate-pulse for metric cards |
| `app/decisions/page.tsx` | Replaced `EmptyState` with `<LoadingSkeleton variant="table" />` |
| `app/harness/page.tsx` | Replaced `EmptyState` with card+table skeletons |

## Verification Results

### Animate-pulse Audit
```bash
grep -r "animate-pulse" packages/luca-observer/app/
```

**Expected instances remaining:**
- `cost/page.tsx` (8 instances) - Loading metric card labels and values (as per plan)
- `workflow/page.tsx` (1 instance) - State diagram loading text (as per plan)
- `globals.css` (CSS definition)

**All other inline loading patterns removed.**

### TypeScript Check
```bash
bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json
# ✓ No errors
```

## Variant Mapping

| Page | Variant(s) Used | Rationale |
|------|----------------|-----------|
| agents | `card` | Matches AgentScorecardTable 3-column grid |
| iterations | `chart` + `card` + `table` | ConvergenceChart/BudgetGauge + ErrorClassificationBreakdown |
| planning | `card` + `table` | SessionPlanOverview/QualityZoneIndicator + WSJFScoreTable |
| workflow | `table` | TransitionLog (kept animate-pulse for state diagram) |
| harness | `card` + `table` | HarnessSummaryBanner + CheckResultCard list |
| cost | `chart` + `table` + animate-pulse cards | Cost curves + SessionCostTable; kept animate-pulse for metric cards |
| decisions | `table` | DecisionTimeline |

## Key Decisions

1. **Cost page metric cards**: Preserved inline `animate-pulse` for the 4 top metric cards (Total Cost, Input Tokens, Output Tokens, Cache Read Tokens) per plan specification
2. **Workflow state diagram**: Preserved inline `animate-pulse` for the "Loading state..." text in the state diagram section
3. **Import additions**: Added `LoadingSkeleton` import to all 7 pages, kept `EmptyState` import (still used for empty data states)

## Findings

- Consistent loading experience achieved across all observer dashboard pages
- All 7 pages now use semantic LoadingSkeleton component with proper `role="status"` accessibility
- LoadingSkeleton component provides 4 variants (card, table, chart, text) matching all page layouts
- Code is now more maintainable with single source of truth for loading states
