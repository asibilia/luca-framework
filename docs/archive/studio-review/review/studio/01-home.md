# S-01, S-02, S-03 — Home Page Issues

## S-01: "Unknown" Activity Items (High)

### Symptom

Every entry in the Recent Activity feed on the home dashboard displays "Unknown" as the event type label.

### Root Cause

**Field name mismatch.** The hook reads `event` but the ledger API returns `event_type`.

**File:** `packages/luca-studio/hooks/use-home-data.ts:83`

```typescript
// CURRENT (broken)
event: get(entry, "event", "unknown") as string,
```

The backend `TransitionRecord` schema (`packages/luca-framework/src/state/types.ts:531-541`) defines:

```typescript
export const transitionRecordSchema = z.object({
  previous_state: z.string(),
  current_state: z.string(),
  event_type: z.string(), // <-- actual field name
  event_data: z.record(z.string(), z.unknown()).default({}),
  actions_executed: z.array(z.string()).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().default(""),
  session_id: z.string().default(""),
});
```

### Secondary Issue: EVENT_TYPES Key Mismatch

Even after fixing the field name, the display label lookup will still fail.

**File:** `packages/luca-studio/lib/constants.ts:4-29`

The `EVENT_TYPES` constant uses dot-notation keys:

```typescript
"session.start", "tool.pre", "state.transition", ...
```

But the actual ledger `event_type` values are UPPERCASE state machine events:

```
"START", "RESET", "PREFLIGHT_COMPLETE", "PHASE_STARTED", "VERIFY_PASS", "field_set"
```

**File:** `packages/luca-studio/components/home/recent-activity.tsx:66`

```typescript
const eventMeta = EVENT_TYPES[entry.event as EventTypeName] ?? null;
```

### Fix

1. `use-home-data.ts:83` — Change `"event"` to `"event_type"`
2. `lib/constants.ts` — Add actual state machine event types to `EVENT_TYPES`:
   ```typescript
   "START": { label: "Session Started", color: "emerald", icon: "Play" },
   "RESET": { label: "State Reset", color: "zinc", icon: "RotateCcw" },
   "PREFLIGHT_COMPLETE": { label: "Pre-flight Complete", color: "blue", icon: "CheckCircle" },
   "PHASE_STARTED": { label: "Phase Started", color: "amber", icon: "Rocket" },
   "PHASE_COMPLETE": { label: "Phase Completed", color: "emerald", icon: "CheckCircle" },
   "VERIFY_PASS": { label: "Verification Passed", color: "emerald", icon: "ShieldCheck" },
   "field_set": { label: "Field Updated", color: "zinc", icon: "Edit" },
   ```
3. `recent-activity.tsx:66` — Normalize event type for lookup or use case-insensitive matching

---

## S-02: Blank Summaries (Medium)

### Symptom

The summary/description column in Recent Activity is always empty — entries show only a badge and timestamp with nothing between them.

### Root Cause

The component tries to read `entry.summary` and `entry.message`, neither of which exists in ledger entries.

**File:** `packages/luca-studio/components/home/recent-activity.tsx:68-71`

```typescript
// CURRENT (broken)
const summary =
  (entry.summary as string) ?? (get(entry, "message", "") as string) ?? "";
```

The `TransitionRecord` schema has no `summary` or `message` field. Available fields that could provide context:

- `event_data` — Record<string, unknown> with event-specific details
- `previous_state` / `current_state` — State transition info
- `actions_executed` — Array of action names

### Fix

Synthesize a summary from available fields:

```typescript
const summary =
  (get(entry, "event_data.description", "") as string) ||
  (entry.previous_state && entry.current_state
    ? `${entry.previous_state} → ${entry.current_state}`
    : "") ||
  (entry.actions_executed?.length
    ? `Actions: ${entry.actions_executed.join(", ")}`
    : "");
```

---

## S-03: Status Card Shows "--" for Phase and Milestone (Medium)

### Symptom

The Workflow Status card on the home dashboard shows "--" for Phase and Milestone fields. Complexity also shows incorrectly.

### Root Cause

The component reads incorrect field paths from the state context.

**File:** `packages/luca-studio/components/home/status-card.tsx:57-59`

```typescript
// CURRENT (broken)
const context = get(state, "context", {}) as Record<string, unknown>;
const phase = get(context, "current_phase_id", null) as number | null; // wrong field
const complexity = get(context, "complexity", null) as string | null; // wrong path
const milestone = get(context, "milestone_label", null) as string | null; // wrong field
```

The actual `WorkflowContext` schema (`packages/luca-framework/src/state/types.ts:145-251`):

```typescript
current_milestone: z.string().optional(),    // NOT "milestone_label"
current_phase: z.number().int().optional(),  // NOT "current_phase_id"
complexity: complexityLevelSchema.default("TRIVIAL"),  // at context root, not nested
```

### Fix

```typescript
const context = get(state, "context", {}) as Record<string, unknown>;
const phase = get(context, "current_phase", null) as number | null;
const complexity = get(context, "complexity", null) as string | null;
const milestone = get(context, "current_milestone", null) as string | null;
```

---

## Files Involved

| File                                                       | Lines            | Issue                                            |
| ---------------------------------------------------------- | ---------------- | ------------------------------------------------ |
| `packages/luca-studio/hooks/use-home-data.ts`              | 83               | `event` → `event_type`                           |
| `packages/luca-studio/lib/constants.ts`                    | 4-29             | EVENT_TYPES keys don't match actual values       |
| `packages/luca-studio/components/home/recent-activity.tsx` | 66-71            | Event lookup + summary synthesis                 |
| `packages/luca-studio/components/home/status-card.tsx`     | 57-59            | Wrong field paths for phase/milestone/complexity |
| `packages/luca-framework/src/state/types.ts`               | 145-251, 531-541 | Source of truth for field names                  |
