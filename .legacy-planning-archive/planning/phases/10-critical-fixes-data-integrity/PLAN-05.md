---
phase: 10
plan: 5
type: feature
autonomous: true
wave: 2
depends_on: [4]
---

# Phase 10 Plan 5: MuninnDB Observer Component Rewrites

## Objective

Rewrite the observer memory page components to render MuninnDB data from the `useMemory` hook (established in PLAN-04). Replaces file-based markdown rendering with structured engram cards, session activity feeds, brain tree panels, and vault stats. Implements the layout, category mapping, and refresh UX decisions from CONTEXT.md.

## Context

@packages/luca-observer/components/memory/memory-entries.tsx
@packages/luca-observer/components/memory/working-sections.tsx
@packages/luca-observer/components/memory/brain-panel.tsx
@packages/luca-observer/components/memory/context-usage-bar.tsx
@packages/luca-observer/app/memory/page.tsx
@.planning/phases/10-critical-fixes-data-integrity/CONTEXT.md

### Data Available from useMemory Hook (PLAN-04)

The hook returns `MuninnMemoryData`:

```typescript
interface MuninnMemoryData {
  brain: ActivationItem[]; // Brain tree engrams from semantic recall
  engrams: Engram[]; // All engrams for categorization
  session: SessionEntry[]; // Recent session activity
  stats: StatsResponse | null; // Vault statistics
  configured: boolean; // Whether MuninnDB API key is set
  lastUpdated: Date | null; // Timestamp of last successful fetch
  refresh: () => void; // Manual refresh trigger
}
```

### CONTEXT.md Decisions (must implement)

1. **Medium cards**: Concept name + first ~100 chars of content inline, confidence badge + tag pills. Full content on expand.
2. **Hybrid category mapping**: Primary key is `memory_type` field. Fallback to concept prefix (split on first `:`). Then "Uncategorized".
3. **Known categories**: pattern (success), decision (info), pitfall (warning), preference (accent).
4. **"Show all" toggle**: Uncategorized engrams hidden by default. Shown via toggle.
5. **No polling**: Manual refresh button + "Last updated: Xs ago" timestamp.
6. **Layout**: Invoke `/frontend-design` specialist. Fallback: single-column stacked layout (Stats bar → Brain → Engrams → Session).

## Tasks

### 1. Rewrite memory-entries.tsx for MuninnDB engrams

**Type:** auto
**TDD:** false
**Depends on:** none (hook already provides data)

**Problem:** Parses raw MEMORY.md markdown to extract categories. After MuninnDB migration, engrams are the canonical data source.

**Fix:** Rewrite to accept `Engram[]` and implement the CONTEXT.md hybrid category mapping:

**Category resolution (in order of precedence):**

1. **`memory_type` field**: If the engram has a non-empty `memory_type` that matches a known category (`pattern`, `decision`, `pitfall`, `preference`), use it.
2. **Concept prefix**: If `memory_type` is empty/unknown, split `concept` on the first `:` and check if the prefix matches a known category.
3. **"Uncategorized"**: If neither yields a match, file under "Uncategorized".

**Category display:**

| Category      | Label         | Color            |
| ------------- | ------------- | ---------------- |
| pattern       | Patterns      | success          |
| decision      | Decisions     | info             |
| pitfall       | Pitfalls      | warning          |
| preference    | Preferences   | accent           |
| uncategorized | Uncategorized | muted-foreground |

**"Show all" toggle**: Uncategorized engrams are hidden by default. A "Show all" toggle at the bottom reveals/hides the Uncategorized section. Known categories are always visible.

**Engram card (medium density):**

- Concept name (bold, sans the category prefix if stripped)
- First ~100 characters of content inline, truncated with "..."
- Confidence badge (e.g., "92%" in a rounded pill)
- Tags as small pills (max 3 visible, "+N more" overflow)
- Relative timestamp from `updated_at` (e.g., "2h ago")
- Click/expand reveals full content

**The component receives `engrams: Engram[]` instead of `content: string`.** The category collapsible sections pattern is preserved but now renders structured engram data instead of raw markdown.

**Files to edit:**

- `packages/luca-observer/components/memory/memory-entries.tsx` (full rewrite)

**Verification:**

- `grep "MEMORY.md\|parseSections" packages/luca-observer/components/memory/memory-entries.tsx` returns no results
- `grep "memory_type\|Engram\|confidence" packages/luca-observer/components/memory/memory-entries.tsx` shows MuninnDB types
- `grep "Show all\|Uncategorized" packages/luca-observer/components/memory/memory-entries.tsx` shows toggle implementation
- `bunx --bun tsc --noEmit` passes

### 2. Rewrite working-sections.tsx for MuninnDB session data

**Type:** auto
**TDD:** false
**Depends on:** none (hook already provides data)

**Problem:** Parses raw WORKING.md markdown into sections. After MuninnDB migration, session data comes from the `session()` API.

**Fix:** Rewrite to accept `SessionEntry[]` and display recent session activity:

- Group entries by date (today, yesterday, earlier)
- Each entry shows: action type badge, entry ID (truncated), relative timestamp
- Preserve the collapsible panel pattern with date groups as sections
- Show entry count per group

The component receives `entries: SessionEntry[]` instead of `content: string`.

**Files to edit:**

- `packages/luca-observer/components/memory/working-sections.tsx` (full rewrite)

**Verification:**

- `grep "WORKING.md\|parseSections" packages/luca-observer/components/memory/working-sections.tsx` returns no results
- `grep "SessionEntry\|action\|timestamp" packages/luca-observer/components/memory/working-sections.tsx` shows MuninnDB types
- `bunx --bun tsc --noEmit` passes

### 3. Update brain-panel, context-usage-bar, and memory page

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2

**Changes:**

**brain-panel.tsx:** Update to accept `ActivationItem[]` instead of `content: string`. Display brain engrams as structured key-value cards:

- Each engram shows concept, content, relevance score badge
- Preserve the existing visual style (mono font, section headers)
- Empty state message updated: "No brain engrams found. Use MuninnDB to store project identity."

**context-usage-bar.tsx:** Update to accept `StatsResponse | null` instead of three content strings. Display:

- Total engrams count (replaces char counting)
- Coherence score as a colored badge (replaces token estimation)
- Vault name
- If stats unavailable, show "MuninnDB unavailable" state

**app/memory/page.tsx:** Update to:

- Use the rewritten `useMemory` hook which returns `MuninnMemoryData` (including `refresh()` and `lastUpdated`)
- Pass `data.brain` (ActivationItem[]) to BrainPanel
- Pass `data.engrams` (Engram[]) to MemoryEntries
- Pass `data.session` (SessionEntry[]) to WorkingSections
- Pass `data.stats` (StatsResponse | null) to ContextUsageBar
- Update page subtitle from "BRAIN, MEMORY, and WORKING file viewer" to "MuninnDB Memory Dashboard"
- Add **refresh button** in the page header (calls `data.refresh()`)
- Add **"Last updated: Xs ago"** subtle timestamp next to the refresh button (from `data.lastUpdated`)
- Add connection status indicator (connected/disconnected based on `data.configured`)
- **Layout**: Invoke `/frontend-design` specialist before implementing. If specialist is unavailable, use fallback layout: **single-column stacked** (Stats bar at top → Brain panel → Engrams panel → Session panel). This avoids the old 3-column grid which doesn't suit the richer MuninnDB data (per CONTEXT.md).

**Files to edit:**

- `packages/luca-observer/components/memory/brain-panel.tsx`
- `packages/luca-observer/components/memory/context-usage-bar.tsx`
- `packages/luca-observer/app/memory/page.tsx`

**Verification:**

- `grep "brainMd\|memoryMd\|workingMd\|BRAIN.md\|MEMORY.md\|WORKING.md" packages/luca-observer/app/memory/page.tsx` returns no results
- `grep "MuninnDB\|muninn\|Engram\|ActivationItem\|StatsResponse" packages/luca-observer/app/memory/page.tsx` shows MuninnDB references
- `grep "refresh\|lastUpdated" packages/luca-observer/app/memory/page.tsx` shows refresh UX
- `bunx --bun tsc --noEmit` passes

## Verification

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# No stale file-based references in rewritten files
grep -rn "BRAIN.md\|MEMORY.md\|WORKING.md\|brainMd\|memoryMd\|workingMd\|memoryFiles" \
  packages/luca-observer/components/memory/memory-entries.tsx \
  packages/luca-observer/components/memory/working-sections.tsx \
  packages/luca-observer/components/memory/brain-panel.tsx \
  packages/luca-observer/components/memory/context-usage-bar.tsx \
  packages/luca-observer/app/memory/page.tsx
# Expected: no output

# Hybrid category mapping implemented
grep "memory_type" packages/luca-observer/components/memory/memory-entries.tsx
# Expected: shows memory_type as primary key

# Show all toggle implemented
grep -i "show.all\|uncategorized" packages/luca-observer/components/memory/memory-entries.tsx
# Expected: shows toggle and uncategorized handling

# Refresh UX implemented
grep "refresh\|lastUpdated\|Last updated" packages/luca-observer/app/memory/page.tsx
# Expected: shows refresh button and timestamp
```

## Success Criteria

- Memory entries display engrams grouped by hybrid category mapping (memory_type → concept prefix → Uncategorized)
- Uncategorized engrams hidden by default with "Show all" toggle
- Engram cards use medium density (concept + ~100 chars + confidence + tags + timestamp)
- Working sections display MuninnDB session activity grouped by date
- Brain panel displays brain tree engrams from semantic recall
- Context usage bar shows vault stats (total engrams, coherence)
- Memory page has refresh button + "Last updated" timestamp (no polling)
- Layout designed by `/frontend-design` specialist (fallback: single-column stacked)
- Graceful degradation when MuninnDB is unavailable (empty states, not crashes)
- Zero references to old file-based memory system in rewritten files
- TypeScript compilation passes

## Output Specification

- 5 edited files in `packages/luca-observer/`
- No new files (all infrastructure established in PLAN-04)
