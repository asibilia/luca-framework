# Phase 157: Observer Context Window Bar - Research

**Researched:** 2026-03-13
**Domain:** Next.js 15 App Router / React 19 / shadcn + Tailwind 4 / Jotai
**Confidence:** HIGH

---

## Summary

Phase 154 already writes `.planning/.context-metrics.json` with zone, usage_percent, transcript_bytes, checked_at, and thresholds. This phase wires that file into the observer header as a live context window bar. The work splits into three clean pieces: (1) an API route at `GET /api/context-metrics` that reads the JSON file, (2) a React hook `use-context-metrics.ts` that polls the route on an interval, and (3) a `ContextWindowBar` component rendered inside the existing `Header` component.

The observer does **not** use SWR, React Query, or any third-party data-fetching library. All hooks are hand-rolled with `useCallback + useEffect + useState`, matching the `useTodos` and `useMemory` patterns exactly. Polling in the header should use `setInterval` inside a `useEffect` with a 10-second interval, clearing on unmount.

The UI library is shadcn (v4) with Tailwind 4, Radix UI primitives, and `lucide-react` icons. A `Progress` component already exists at `~/components/ui/progress` (Radix `ProgressPrimitive`). Zone-based coloring should reuse the established CSS custom property pattern: `var(--color-success)`, `var(--color-warning)`, `var(--color-destructive)` — the same variables used by `context-usage-bar.tsx` and `coherenceColor()`.

**Primary recommendation:** Build a thin `useContextMetrics` polling hook + a compact inline bar in the header, not a Card — the header has limited vertical space and the existing design inserts small controls (buttons, separators) inline.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library      | Version  | Purpose                            | Why Used                       |
| ------------ | -------- | ---------------------------------- | ------------------------------ |
| next         | ^15      | App Router, Route Handlers         | Core framework                 |
| react        | ^19      | UI rendering                       | Core framework                 |
| radix-ui     | ^1.4.3   | Progress primitive                 | Already has Progress component |
| tailwindcss  | ^4       | Styling                            | Project standard               |
| lucide-react | ^0.577.0 | Icons (Brain, AlertTriangle, etc.) | Already used in header         |
| zod          | ^3.23.8  | Schema validation in route + hook  | Project standard               |

### Supporting (already installed)

| Library               | Version   | Purpose          | When to Use                     |
| --------------------- | --------- | ---------------- | ------------------------------- |
| clsx + tailwind-merge | ^2 / ^3.5 | `cn()` utility   | All className composition       |
| jotai                 | ^2        | Atom-based state | Only if global bar state needed |

**Installation:** No new packages required. All dependencies are already in `packages/luca-observer/package.json`.

---

## Architecture Patterns

### Observed Project Structure

```
packages/luca-observer/
├── app/
│   ├── api/
│   │   ├── todos/route.ts          # File-system reader pattern
│   │   ├── muninn/stats/route.ts   # muninnProxyHandler pattern
│   │   └── workflow/topology/route.ts  # Static data pattern
│   └── layout.tsx                  # Header rendered here
├── components/
│   ├── layout/
│   │   └── header.tsx              # Injection point for bar
│   └── ui/
│       └── progress.tsx            # Radix Progress — reuse directly
├── hooks/
│   ├── use-todos.ts                # Polling hook pattern to copy
│   └── use-memory.ts               # Manual refresh pattern
└── lib/
    └── muninn-route-helper.ts      # parseQueryParams — reuse
```

### New files for this phase

```
app/api/context-metrics/route.ts    # GET /api/context-metrics
hooks/use-context-metrics.ts        # Polling hook (10s interval)
components/layout/context-window-bar.tsx  # Compact bar component
```

### Pattern 1: File-System API Route (copy from todos/route.ts)

**What:** Route Handler reads a JSON file from `.planning/` on the server, validates with Zod, returns `NextResponse.json()`.
**When to use:** Any time the observer needs to surface planning artifacts.

```typescript
// Source: packages/luca-observer/app/api/todos/route.ts (adapted)
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

/**
 * API Response: Context window metrics from .planning/.context-metrics.json
 *
 * Uses snake_case for API-facing fields per project convention.
 */
const ContextMetricsSchema = z.object({
  zone: z.enum(["peak", "good", "degrading", "poor"]),
  usage_percent: z.number().min(0).max(100),
  transcript_bytes: z.number().int().min(0),
  checked_at: z.string(),
  thresholds: z.object({
    warn_bytes: z.number(),
    alert_bytes: z.number(),
    critical_bytes: z.number(),
  }),
});

export type ContextMetrics = z.infer<typeof ContextMetricsSchema>;

export async function GET() {
  const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
  const workspaceRoot = rawRoot ? resolve(rawRoot) : process.cwd();
  const metricsPath = join(workspaceRoot, ".planning", ".context-metrics.json");

  try {
    const content = await readFile(metricsPath, "utf-8");
    const raw: unknown = JSON.parse(content);
    const result = ContextMetricsSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid metrics format" },
        { status: 502 },
      );
    }
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Context metrics not available" },
      { status: 404 },
    );
  }
}
```

### Pattern 2: Polling Hook (copy from use-todos.ts)

**What:** `useCallback` wraps fetch logic, `useEffect` fires on mount and sets a `setInterval`, clears on unmount. Returns data, loading, error, and a `refresh` function.
**When to use:** Any data that needs to stay fresh without user action.

```typescript
// Source: hooks/use-todos.ts + use-memory.ts (adapted)
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

const ContextMetricsSchema = z.object({
  /* ... as above */
});
export type ContextMetrics = z.infer<typeof ContextMetricsSchema>;

export function useContextMetrics() {
  const [metrics, setMetrics] = useState<ContextMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false); // guard against double-fetch (React StrictMode)

  const fetchMetrics = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/context-metrics");
      if (!res.ok) {
        setError("Unavailable");
        return;
      }
      const raw: unknown = await res.json();
      const result = ContextMetricsSchema.safeParse(raw);
      if (result.success) {
        setMetrics(result.data);
        setError(null);
      }
    } catch {
      setError("Fetch failed");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
    const id = setInterval(() => void fetchMetrics(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  return { metrics, loading, error, refresh: fetchMetrics };
}
```

### Pattern 3: Header Injection

**What:** The `Header` component is a client component (`"use client"`) that renders inline controls. New bar sits between the flex-1 spacer and the vault dropdown — compact, text-xs, using the existing gap/px conventions.
**When to use:** Small status indicators that fit in one line.

```tsx
// Source: components/layout/header.tsx (existing)
// Inject after: <div className="flex-1" />
// Before: vault dropdown

<ContextWindowBar />
<Separator orientation="vertical" className="mx-2 h-4" />
```

### Pattern 4: Zone-Based Color (copy from context-usage-bar.tsx)

**What:** Map a zone string to a CSS variable color name, apply via inline `style` or `color-mix`.
**When to use:** Any status indicator that changes color based on severity.

```typescript
// Source: components/memory/context-usage-bar.tsx (coherenceColor adapted)
function zoneColor(zone: string): string {
  switch (zone) {
    case "peak":      return "success";      // green
    case "good":      return "info";         // blue
    case "degrading": return "warning";      // amber
    case "poor":      return "destructive";  // red
    default:          return "muted-foreground";
  }
}

// Usage (inline style pattern used throughout codebase):
style={{ color: `var(--color-${zoneColor(zone)})` }}

// For progress bar fill:
style={{ backgroundColor: `var(--color-${zoneColor(zone)})` }}

// For subtle badge background:
style={{
  color: `var(--color-${zoneColor(zone)})`,
  backgroundColor: `color-mix(in oklab, var(--color-${zoneColor(zone)}) 15%, transparent)`,
}}
```

### Anti-Patterns to Avoid

- **Do not install SWR or React Query** — the project deliberately hand-rolls fetching.
- **Do not use Tremor components** — the project uses shadcn + Radix, not Tremor (despite `@tremor/react` being listed as a dependency, the active components are all shadcn/Radix).
- **Do not put the bar in a Card** — Cards are page-level content. The header uses raw `div`s and `Button`s.
- **Do not import from `~/components/memory/context-usage-bar.tsx`** — that is a page-level card, not a reusable primitive.
- **Do not use polling intervals shorter than 5s** — the file is written by hooks, not a stream.

---

## Don't Hand-Roll

| Problem                      | Don't Build                       | Use Instead                                                               | Why                                  |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Progress bar rendering       | Custom `<div>` with width math    | `~/components/ui/progress` (Radix)                                        | Accessible, animated, already exists |
| Query param parsing in route | `searchParams.get()` manual parse | `parseQueryParams(searchParams, Schema)` from `~/lib/muninn-route-helper` | Consistent 400 error format          |
| `cn()` class composition     | Manual string concat              | `cn()` from `~/lib/utils`                                                 | Project standard everywhere          |
| Color selection              | Conditional CSS classes           | Inline `var(--color-*)` style                                             | Matches all existing color patterns  |
| Double-fetch guard           | AbortController                   | `useRef(false)` fetchingRef                                               | Simpler, matches existing hooks      |

**Key insight:** This codebase has all the primitives in place. The bar is assembly work, not invention work.

---

## Common Pitfalls

### Pitfall 1: Wrong workspace root resolution

**What goes wrong:** `process.cwd()` inside the Next.js dev server may not be the project root containing `.planning/`. The file is not found, route returns 404 constantly.
**Why it happens:** `next dev` sets cwd to the package directory (`packages/luca-observer/`), not the repo root.
**How to avoid:** Check `LUCA_PROJECT_DIR` or `WORKSPACE_ROOT` env vars first (same pattern as `todos/route.ts`). Walk up directories if both are absent.
**Warning signs:** Route always returns 404 in dev even though the file exists.

### Pitfall 2: `usage_percent` is always 0

**What goes wrong:** The bar renders but shows 0% permanently.
**Why it happens:** Phase 154's observer hook writes `transcript_bytes` but `usage_percent` is computed relative to a maximum — if the maximum is undefined or zero, the percent is 0.
**How to avoid:** Check the actual `.context-metrics.json` file content during testing. The sample shows `"usage_percent": 0` and `"transcript_bytes": 0` when idle, which is correct behavior. The bar should show 0% in this state, not an error.
**Warning signs:** Bar shows 0% even during active sessions.

### Pitfall 3: Header height overflow

**What goes wrong:** The bar pushes the header to two lines or clips.
**Why it happens:** The header uses `h-(--header-height)` (48px via `calc(var(--spacing) * 12)`). Adding a tall element breaks it.
**How to avoid:** Keep the bar to a single line, text-xs, using the same `flex items-center gap-1.5` pattern. The progress bar height should stay at `h-1` (4px) — the existing Progress primitive default.
**Warning signs:** Header height changes, page content shifts down.

### Pitfall 4: StrictMode double-fetch spike on mount

**What goes wrong:** The hook fires two simultaneous fetches on initial mount in React StrictMode (Next.js 15 dev mode).
**Why it happens:** React 19 StrictMode mounts/unmounts/remounts effects in development.
**How to avoid:** Use `fetchingRef.current` guard (already established pattern in `use-memory.ts`).
**Warning signs:** Two network requests logged for `/api/context-metrics` on each page load in dev.

### Pitfall 5: Tremor Progress vs shadcn Progress confusion

**What goes wrong:** Developer imports `ProgressBar` from `@tremor/react` thinking it is the project standard.
**Why it happens:** `@tremor/react` is in `package.json` but the active UI system is shadcn.
**How to avoid:** Import `Progress` from `~/components/ui/progress` only.

---

## Code Examples

### Complete zone color helper

```typescript
// Source: verified pattern from components/memory/context-usage-bar.tsx
/**
 * Resolve context window zone to a CSS variable color name.
 *
 * Zones map to the Luca semantic color tokens defined in tailwind/base.css:
 * - peak:      --color-success (green)
 * - good:      --color-info (blue)
 * - degrading: --color-warning (amber)
 * - poor:      --color-destructive (red)
 */
function zoneColor(zone: string): string {
  switch (zone) {
    case "peak":
      return "success";
    case "good":
      return "info";
    case "degrading":
      return "warning";
    case "poor":
      return "destructive";
    default:
      return "muted-foreground";
  }
}
```

### Compact bar layout for header

```tsx
// Source: verified from header.tsx flex layout
// Place between <div className="flex-1" /> and the vault dropdown.
<div className="flex items-center gap-1.5">
  <Brain className="size-3.5 text-muted-foreground" aria-hidden="true" />
  <div className="w-20">
    <Progress
      value={metrics.usage_percent}
      className="h-1"
      // Override indicator color via CSS custom property
      style={
        {
          "--progress-color": `var(--color-${zoneColor(metrics.zone)})`,
        } as React.CSSProperties
      }
    />
  </div>
  <span className="font-mono text-xs text-muted-foreground">
    {metrics.usage_percent.toFixed(0)}%
  </span>
</div>
```

**Note:** The existing `Progress` component's indicator uses `bg-primary`. To color it by zone, either (a) extend the Progress component to accept a `style` prop on the indicator, or (b) wrap in a container with a CSS custom property and target `.data-[slot=progress-indicator]` in Tailwind. Option (a) is simpler and matches the codebase pattern of passing `style` props.

### API route shell (file-system pattern)

```typescript
// Source: app/api/todos/route.ts pattern
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const ContextMetricsSchema = z.object({
  zone: z.enum(["peak", "good", "degrading", "poor"]),
  usage_percent: z.number().min(0).max(100),
  transcript_bytes: z.number().int().min(0),
  checked_at: z.string(),
  thresholds: z.object({
    warn_bytes: z.number(),
    alert_bytes: z.number(),
    critical_bytes: z.number(),
  }),
});

export async function GET() {
  const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
  const workspaceRoot = rawRoot ? resolve(rawRoot) : process.cwd();
  const metricsPath = join(workspaceRoot, ".planning", ".context-metrics.json");

  try {
    const content = await readFile(metricsPath, "utf-8");
    const raw: unknown = JSON.parse(content);
    const result = ContextMetricsSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid metrics format" },
        { status: 502 },
      );
    }
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Context metrics not available" },
      { status: 404 },
    );
  }
}
```

---

## State of the Art

| Old Approach                           | Current Approach                            | Notes                                                  |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Tremor components (ProgressBar, Badge) | shadcn + Radix primitives                   | Tremor in package.json but shadcn is the active system |
| next/font manual setup                 | `Inter` via `next/font/google` with CSS var | Already done in layout.tsx                             |
| SWR for polling                        | `setInterval` in useEffect                  | Deliberate — no SWR installed                          |
| Tailwind 3 config file                 | Tailwind 4 CSS `@theme` blocks              | base.css drives all tokens                             |

**Deprecated/outdated:**

- `@tremor/react` ProgressBar: Listed in dependencies but the component system is 100% shadcn. Do not use.

---

## Open Questions

1. **Progress indicator color override mechanism**
   - What we know: The `Progress` component renders `bg-primary` on the indicator via a hardcoded class.
   - What's unclear: Whether to (a) extend the Progress component with a `color` prop, or (b) use a data attribute + Tailwind selector to override.
   - Recommendation: Option (a) — add an optional `indicatorClassName` prop to `progress.tsx`. This is a one-line change and keeps the component API clean.

2. **Tooltip content for the bar**
   - What we know: The header wraps controls in `<Tooltip>` for accessible labels. The vault switcher and theme toggle both have tooltips.
   - What's unclear: What tooltip text is most useful — zone name, byte count, or threshold info.
   - Recommendation: Show `"Context: {zone} · {transcript_bytes} / {warn_bytes} bytes"` to give actionable detail without being verbose.

3. **Behavior when `.context-metrics.json` is absent**
   - What we know: The route returns 404 when the file does not exist (Phase 154 hook may not have run yet).
   - What's unclear: Whether to hide the bar entirely or show a greyed-out placeholder.
   - Recommendation: Hide the bar entirely when `metrics === null` — keep the header clean for repos that do not use Phase 154.

---

## Sources

### Primary (HIGH confidence)

- Direct file reads: `packages/luca-observer/app/layout.tsx` — header/layout structure confirmed
- Direct file reads: `packages/luca-observer/components/layout/header.tsx` — injection point and styling patterns
- Direct file reads: `packages/luca-observer/components/memory/context-usage-bar.tsx` — zone color pattern
- Direct file reads: `packages/luca-observer/hooks/use-memory.ts` — polling + fetchingRef guard pattern
- Direct file reads: `packages/luca-observer/hooks/use-todos.ts` — hook with Zod safeParse pattern
- Direct file reads: `packages/luca-observer/app/api/todos/route.ts` — file-system route pattern
- Direct file reads: `packages/luca-observer/components/ui/progress.tsx` — existing Progress primitive
- Direct file reads: `packages/luca-observer/package.json` — confirmed no SWR/React Query
- Direct file reads: `packages/luca-observer/tailwind/base.css` — color tokens confirmed
- Direct file reads: `.planning/.context-metrics.json` — actual schema confirmed

### Secondary (MEDIUM confidence)

- `packages/luca-observer/lib/muninn-route-helper.ts` — `parseQueryParams` utility (confirmed reusable for this route if query params are added later)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — package.json verified, no ambiguity
- Architecture: HIGH — all patterns read directly from source files
- Pitfalls: HIGH (workspace root), MEDIUM (others) — root resolution is a known runtime issue; others are inferred from code patterns
- Color system: HIGH — CSS vars verified in tailwind/base.css and context-usage-bar.tsx

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — Tailwind 4 / shadcn / Next 15 are stable; no fast-moving deps)
