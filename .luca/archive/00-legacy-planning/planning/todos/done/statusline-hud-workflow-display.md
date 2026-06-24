---
title: "Statusline HUD: Add workflow phase/progress display"
area: hooks
created: 2026-03-28
source: conversation
---

## Context

The statusline (`src/hooks/scripts/statusline.ts`) currently shows system info only -- directory, git branch, model, context %, vim mode, session name. It has zero workflow awareness. A developer glancing at the footer has no idea what phase they're in, what the AI is doing, or how far along execution is.

## Task

Add a dedicated workflow HUD line above the existing system line in the statusline, showing phase number, workflow state, wave progress bar, complexity level, and milestone version. When no workflow is active, gracefully collapse to a minimal idle indicator.

### Design (Approved: Variant A "HUD")

**Active state:**

```
 ▸ P0  EXECUTING  ██████████  1/1  COMPLEX  v8.5.0
 ~/luca-framework  113--anti-skip-enforcement-layer  opus  ctx:45%  NORMAL
```

**Idle state:**

```
 ◇ idle
 ~/luca-framework  main  opus  ctx:8%  NORMAL
```

### Single File Change

**File:** `src/hooks/scripts/statusline.ts` (169 lines -> ~270 lines)

No other files need modification. After implementation, user runs `bun run build:all` to regenerate `.claude/statusline.sh`.

### Implementation Steps

#### Step 1: Add imports

After the existing imports (line 14), add:

```typescript
import { z } from "zod";
import get from "lodash/get";
```

- `zod`: Schema-first parsing per project rule (no bare interfaces)
- `lodash/get`: Safe nested access into state.json's deep structure

#### Step 2: Add WorkflowHudState schema + readWorkflowState function

Place before the `main` function (after line 16). This reads `.planning/state.json` via `Bun.file()` and normalizes the raw state machine snapshot into a display-friendly shape.

**Zod Schema (single source of truth for defaults and types):**

```typescript
const DisplayStateEnum = z.enum([
  "EXECUTING",
  "PLANNING",
  "VERIFYING",
  "PAUSED",
  "FAILED",
  "idle",
]);

const WorkflowHudStateSchema = z.object({
  displayState: DisplayStateEnum.default("idle"),
  icon: z.string().default("\u25c7"), // diamond
  phaseLabel: z.string().default(""), // "P0", "P42", or ""
  complexity: z.string().default(""), // TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL | ""
  milestone: z.string().default(""), // "v8.5.0" (version prefix only) or ""
  currentWave: z.number().default(0),
  totalWaves: z.number().default(0),
  hasWaveData: z.boolean().default(false),
});

type WorkflowHudState = z.infer<typeof WorkflowHudStateSchema>;
```

All defaults defined in schema, no destructuring defaults anywhere. Type inferred from schema.

**Data source mapping** (from real `.planning/state.json`):

- `value` (top-level) -> maps to displayState via lookup table
- `context.complexity` -> complexity
- `context.current_milestone` -> milestone (split on space, take first token)
- `children.phase.snapshot.context.phase_id` -> phaseLabel
- `children.phase.snapshot.context.current_wave` -> currentWave
- `children.phase.snapshot.context.total_waves` -> totalWaves

**State value mapping:**

| state.json `value`                               | Display   | Icon | Color  |
| ------------------------------------------------ | --------- | ---- | ------ |
| `executing`                                      | EXECUTING | `▸`  | green  |
| `preflight`, `routing`, `discussing`, `planning` | PLANNING  | `◈`  | yellow |
| `verifying`, `learning`, `committing`            | VERIFYING | `◉`  | blue   |
| `paused`, `suspended`                            | PAUSED    | `◇`  | red    |
| `failed`                                         | FAILED    | `◇`  | red    |
| `idle`, `complete`, `cooldown`, unknown          | idle      | `◇`  | gray   |

**Error handling:** Entire function wrapped in try/catch, returns `null` on any failure. Checks `Bun.file().exists()` before reading. Uses `WorkflowHudStateSchema.safeParse()` to validate the assembled object -- if parse fails, returns `null` (graceful degradation, no crash).

#### Step 3: Add renderProgressBar function

Top-level pure function. Takes current/total counts, color functions, optional width (default 10). Returns colored string like `████████░░`.

```typescript
const renderProgressBar = (
  current: number,
  total: number,
  colorFn: (s: string) => string,
  emptyFn: (s: string) => string,
  width = 10,
): string => {
  if (total === 0) return emptyFn("\u2591".repeat(width));
  const filled = Math.max(
    0,
    Math.min(width, Math.round((current / total) * width)),
  );
  return (
    colorFn("\u2588".repeat(filled)) + emptyFn("\u2591".repeat(width - filled))
  );
};
```

#### Step 4: Add renderHudLine function

Top-level pure function. Receives `WorkflowHudState` and a color helpers object. Returns the formatted HUD string.

**Logic:**

- **idle:** return `gray(" ◇ idle")`
- **active states:** Build segments array:
  1. State icon (colored by state)
  2. Phase label in cyan (if present)
  3. Display state name (colored by state)
  4. Progress bar + wave fraction (if hasWaveData)
  5. Complexity (color-coded: green=TRIVIAL/SIMPLE, yellow=MODERATE, boldYellow=COMPLEX, red=CRITICAL)
  6. Milestone version in gray (if present)
- Join segments with double-space, prefix with single space

#### Step 5: Add boldYellow ANSI helper inside main

After the existing color helpers (line 41), add:

```typescript
const boldYellow = (t: string) => c("1;33", t);
```

This distinguishes COMPLEX (bold yellow) from MODERATE (regular yellow).

#### Step 6: Call readWorkflowState in main

After the context-metrics write block (line 109), before git branch resolution:

```typescript
const hudState = await readWorkflowState(pd);
```

#### Step 7: Modify output to emit two lines

Replace the single `process.stdout.write(parts.join(...))` at line 164 with:

```typescript
const systemLine = parts.join("  |  ");
if (hudState) {
  const hudLine = renderHudLine(hudState, {
    green,
    yellow,
    blue,
    red,
    gray,
    boldYellow,
  });
  process.stdout.write(hudLine + "\n" + systemLine);
} else {
  process.stdout.write(systemLine);
}
```

When `hudState` is null (file missing/parse error), falls back to existing single-line output.

### Key References

| File                                    | Purpose                                            |
| --------------------------------------- | -------------------------------------------------- |
| `src/hooks/scripts/statusline.ts`       | **Only file to modify**                            |
| `.planning/state.json`                  | Data source (read-only, real example at 118 lines) |
| `src/hooks/__helpers/hook-io.ts`        | Existing `projectDir()` import                     |
| `src/hooks/__helpers/bridge.ts:106-118` | Reference pattern for `Bun.file().exists()`        |

### Verification

1. **Type check:** `bunx --bun tsc --noEmit` (must pass)
2. **Manual test:** After `bun run build:all`, start a new Claude Code session in the repo and verify:
   - Two-line output appears when `.planning/state.json` exists
   - Progress bar renders with correct wave counts
   - Complexity and state are color-coded
   - Falls back to single line when state.json is absent/invalid
   - Context metrics side-effect still writes correctly
3. **Edge cases to check:**
   - Delete `.planning/state.json` -> single-line output (graceful)
   - Set `value: "idle"` -> shows `◇ idle` on line 1
   - Set `total_waves: 0` -> progress bar omitted
   - Empty `current_milestone` -> milestone segment omitted

## Notes

- Plan file: `.claude/plans/sprightly-pondering-quilt.md`
- Design was chosen via interactive review of 3 variants (HUD, Pulse, Strata)
- User confirmed: Variant A "HUD" with context % kept as number (not progress bar)
- Must use Zod schemas (not bare interfaces) per project schema-first-parsing rule
