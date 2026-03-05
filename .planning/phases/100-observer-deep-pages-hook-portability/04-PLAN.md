---
id: "100-04"
title: "Memory system page"
phase: 100
wave: 2
complexity: MODERATE
depends_on: ["100-01"]
tasks:
  - id: "100-04-1"
    title: "Create BRAIN panel component"
    goal: "Build a panel rendering BRAIN.md content with syntax highlighting for the project identity sections"
    verify: "BrainPanel renders BRAIN.md content with section headers; handles empty content with placeholder"
  - id: "100-04-2"
    title: "Create MEMORY entries component"
    goal: "Build a component rendering MEMORY.md content organized by category (patterns, decisions, pitfalls, preferences)"
    verify: "MemoryEntries renders MEMORY.md content with category headers and entry formatting"
  - id: "100-04-3"
    title: "Create WORKING sections component"
    goal: "Build a component rendering WORKING.md content with collapsible sections"
    verify: "WorkingSections renders WORKING.md sections with expand/collapse; shows status badge"
  - id: "100-04-4"
    title: "Create context usage bar component"
    goal: "Build a visual bar showing estimated context usage across all memory files"
    verify: "ContextUsageBar renders proportional usage with color-coded zones"
  - id: "100-04-5"
    title: "Wire memory page with real data"
    goal: "Replace the stub memory page with BRAIN panel, MEMORY entries, WORKING sections, and context usage bar"
    verify: "Memory page shows real memory file contents; handles empty state; no stubs remain"
---

# 100-04: Memory System Page

## Goal

Replace the stub memory page with a real memory system viewer showing BRAIN.md (project identity), MEMORY.md (long-term learning), WORKING.md (session memory), and context usage metrics. This page is the primary tool for understanding what the AI knows about the project and its current session state.

## Context

@packages/luca-observer/src/app/memory/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-memory.ts -- Memory polling hook (from 100-01)
@packages/luca-observer/src/app/api/memory/route.ts -- Existing API route (reads BRAIN.md, MEMORY.md, WORKING.md)
@packages/luca-observer/src/lib/file-watcher.ts -- readMemoryFiles (existing)
@packages/luca-observer/src/lib/constants.ts -- COMPLEXITY_LEVELS
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/memory/\_\_schemas/memory.schemas.ts -- Framework memory schemas (brainSchema, memoryEntrySchema, workingMemorySchema)

**Design principles:**

- Three-panel layout: BRAIN, MEMORY, WORKING
- Raw markdown displayed with mono font and basic formatting
- Context usage bar shows estimated token consumption
- WORKING.md sections are collapsible
- MEMORY.md organized by category (pattern/decision/pitfall/preference)
- All data from existing /api/memory route
- Empty state per panel when content is empty

**Data flow:**

The `/api/memory` route already exists and returns `{ brain, memory, working }` as raw markdown strings. The new `useMemory` hook (from 100-01) polls this route. Components receive the raw markdown and render it with basic formatting.

## Tasks

### Task 100-04-1: Create BRAIN panel component

Create `packages/luca-observer/src/components/memory/brain-panel.tsx`.

Renders BRAIN.md content in a styled panel with section-aware formatting.

**Key features:**

- Renders raw markdown in a mono-font panel
- Section headers (## headings) styled as bold labels
- Key-value pairs (e.g., "Project: Luca") formatted with label/value layout
- "No BRAIN.md" empty state when content is empty
- Scrollable for long content

**Props:**

```typescript
interface BrainPanelProps {
  content: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/memory/brain-panel.tsx`
- [ ] Renders BRAIN.md content with section headers
- [ ] Empty state when content is empty
- [ ] Scrollable for long content
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-04-2: Create MEMORY entries component

Create `packages/luca-observer/src/components/memory/memory-entries.tsx`.

Renders MEMORY.md content organized by category sections.

**Key features:**

- Parses markdown to identify category headers (## Patterns, ## Decisions, ## Pitfalls, ## Preferences)
- Each category shown as a collapsible section
- Individual entries rendered as cards within each category
- Category badge with count of entries
- "No MEMORY.md" empty state
- Total entry count in header

**Props:**

```typescript
interface MemoryEntriesProps {
  content: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/memory/memory-entries.tsx`
- [ ] Shows content organized by category
- [ ] Collapsible sections per category
- [ ] Empty state when content is empty
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-04-3: Create WORKING sections component

Create `packages/luca-observer/src/components/memory/working-sections.tsx`.

Renders WORKING.md content with collapsible sections.

**Key features:**

- Parses markdown for section headers (## Session Info, ## Memory Recall, ## Findings, etc.)
- Each section shown as a collapsible panel
- Status badge: "Active" (has content) or "Empty" (no content in section)
- Byte/character count per section
- "No WORKING.md" empty state
- Sections auto-expanded if they have content

**Props:**

```typescript
interface WorkingSectionsProps {
  content: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/memory/working-sections.tsx`
- [ ] Renders collapsible sections
- [ ] Status badge per section
- [ ] Empty state when content is empty
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-04-4: Create context usage bar component

Create `packages/luca-observer/src/components/memory/context-usage-bar.tsx`.

A visual bar showing estimated context usage based on character counts of all memory files.

**Key features:**

- Horizontal bar segmented by file: BRAIN (blue), MEMORY (green), WORKING (orange)
- Each segment proportional to its content size
- Total size displayed in characters and estimated tokens (chars/4 heuristic)
- Color-coded zones: under 30% green, 30-50% blue, 50-70% yellow, 70%+ red
- Legend showing per-file breakdown

**Props:**

```typescript
interface ContextUsageBarProps {
  brain: string;
  memory: string;
  working: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/memory/context-usage-bar.tsx`
- [ ] Shows segmented bar with per-file contribution
- [ ] Displays total size and estimated tokens
- [ ] Color-coded by zone
- [ ] Legend with breakdown
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-04-5: Wire memory page with real data

Replace the stub in `packages/luca-observer/src/app/memory/page.tsx`.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { BrainPanel } from "~/components/memory/brain-panel";
import { MemoryEntries } from "~/components/memory/memory-entries";
import { WorkingSections } from "~/components/memory/working-sections";
import { ContextUsageBar } from "~/components/memory/context-usage-bar";
import { useMemory } from "~/hooks/use-memory";

export default function MemoryPage() {
  const { data, loading } = useMemory();

  return (
    <PageContainer
      title="Memory"
      subtitle="BRAIN, MEMORY, and WORKING file viewer"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading memory files...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <ContextUsageBar
            brain={data?.brain ?? ""}
            memory={data?.memory ?? ""}
            working={data?.working ?? ""}
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <BrainPanel content={data?.brain ?? ""} />
            <MemoryEntries content={data?.memory ?? ""} />
            <WorkingSections content={data?.working ?? ""} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
```

**Steps:**

1. Replace the entire content of `packages/luca-observer/src/app/memory/page.tsx`
2. Add "use client" directive
3. Wire useMemory hook
4. Show loading state, then context bar + three panels

**Verify:**

- [ ] Memory page shows real file contents
- [ ] Context usage bar shows estimated usage
- [ ] Three panels: BRAIN, MEMORY, WORKING
- [ ] Each panel handles empty content
- [ ] Loading state during initial fetch
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Memory page fully functional with real data (no stubs)
- [ ] BRAIN panel shows project identity
- [ ] MEMORY entries organized by category
- [ ] WORKING sections collapsible with status badges
- [ ] Context usage bar shows estimated token consumption
- [ ] Page handles all-empty memory files gracefully
- [ ] All components follow observer design patterns
- [ ] `bunx --bun tsc --noEmit` passes
