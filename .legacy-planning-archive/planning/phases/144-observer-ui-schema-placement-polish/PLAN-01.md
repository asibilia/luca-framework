---
phase: 144
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 144 Plan 1: Observer UI -- Semantic Tokens, shadcn Components, and ARIA

## Objective

Replace hard-coded color classes and ad-hoc UI patterns in `todo-tracker.tsx` and
`todos/route.ts` with semantic design tokens, shadcn primitives, and proper
accessibility attributes. Migrate the `TodoResponse` interface to a Zod schema
with schema-first defaults.

This addresses HIGH #7-8, MEDIUM #5-6 #12-14, and LOW #3 #10 from the audit.

## Context

@packages/luca-observer/components/dashboard/todo-tracker.tsx
@packages/luca-observer/app/api/todos/route.ts
@packages/luca-observer/components/ui/progress.tsx
@packages/luca-observer/components/ui/button.tsx
@packages/luca-observer/components/ui/card.tsx
@packages/luca-observer/tailwind/base.css

## Tasks

### 1. Replace hard-coded emerald-500 with semantic success token

**Type:** auto
**TDD:** false
**Depends on:** none

Replace all `text-emerald-500` and `bg-emerald-500` occurrences in
`todo-tracker.tsx` with the semantic `text-success` / `bg-success` Tailwind
utilities (generated from `--color-success` registered in the `@theme` block of
`base.css`). This ensures theme switching works correctly for both light and dark
modes.

Specific changes in `todo-tracker.tsx`:

- Line 41: `colorClass: "text-emerald-500"` -> `colorClass: "text-success"`
- Line 46: `colorClass: "text-emerald-500"` -> `colorClass: "text-success"`
- Line 324: `text-emerald-500` -> `text-success`
- Line 353: `bg-emerald-500` -> `bg-success` (but this line is removed in task 3)

**Files to create/edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- No remaining `emerald-500` references in `todo-tracker.tsx`
- `grep -r "emerald-500" packages/luca-observer/components/dashboard/todo-tracker.tsx` returns empty

### 2. Adopt shadcn Button for error retry action

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the raw `<button>` element in the error state (around line 139) with the
shadcn `Button` component using `variant="destructive"` and `size="sm"`.

Import `Button` from `~/components/ui/button`.

Before:

```tsx
<button
  type="button"
  onClick={() => refetch()}
  className="mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-destructive-foreground hover:bg-destructive/80"
>
  Retry
</button>
```

After:

```tsx
<Button
  variant="destructive"
  size="sm"
  onClick={() => refetch()}
  className="mt-2 font-mono text-xs"
>
  Retry
</Button>
```

**Files to create/edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- No raw `<button>` elements remain in `todo-tracker.tsx`
- `Button` import from `~/components/ui/button` is present

### 3. Replace custom progress bar with shadcn Progress and add ARIA

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the hand-rolled progress bar (lines 351-356) with the shadcn `Progress`
component. The Radix `Progress` primitive automatically provides
`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`
attributes, resolving the ARIA accessibility gap (MEDIUM #14).

Import `Progress` from `~/components/ui/progress`.

Before:

```tsx
<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
  <div
    className="h-full rounded-full bg-emerald-500 transition-all"
    style={{ width: `${completionRate}%` }}
  />
</div>
```

After:

```tsx
<Progress
  value={completionRate}
  className="h-1.5 [&_[data-slot=progress-indicator]]:bg-success"
/>
```

Note: The shadcn Progress component uses `bg-primary` for the indicator by
default. The `[&_[data-slot=progress-indicator]]:bg-success` class overrides
the indicator color to use the semantic success token, maintaining the green
color from the original hand-rolled bar.

**Files to create/edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- `Progress` import from `~/components/ui/progress` is present
- No hand-rolled `<div>` progress bar remains
- The rendered progress bar has `role="progressbar"` in the DOM (Radix provides this)

### 4. Adopt shadcn Card for ad-hoc card surfaces

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the ad-hoc `rounded-md border border-border bg-card p-2.5` pattern used
in `TodoRow` (line 269) and `VelocityPanel` stat cells (lines 315, 323, 331)
and milestone rows (line 369) with the shadcn `Card` component using `size="sm"`.

The shadcn Card provides consistent border treatment via `ring-1 ring-foreground/10`
and proper data-slot attributes for design system coherence.

For TodoRow (line 269):

```tsx
// Before
<div className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5 transition-colors hover:bg-muted/50">

// After -- use Card size="sm" with flex layout override
<Card size="sm" className="flex-row items-center gap-2.5 py-2.5 transition-colors hover:bg-muted/50">
```

For VelocityPanel stat cells (grid items at lines 315/323/331):
Replace each `<div className="rounded-md border border-border bg-card p-2.5 text-center">`
with `<Card size="sm" className="p-2.5 text-center">`.

For milestone breakdown rows (line 369):
Replace `<div className="... rounded-md border border-border bg-card p-2">`
with `<Card size="sm" className="flex-row items-center justify-between p-2">`.

**Files to create/edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- No remaining `border border-border bg-card` patterns in `todo-tracker.tsx`
- All card-like surfaces use the `Card` component
- `grep "border-border" packages/luca-observer/components/dashboard/todo-tracker.tsx` returns empty (outside of any that shadcn Card itself may reference)

### 5. Migrate TodoResponse to Zod schema with schema-first defaults

**Type:** auto
**TDD:** false
**Depends on:** none

In `packages/luca-observer/app/api/todos/route.ts`:

1. Replace the `TodoResponse` interface (lines 26-37) with a Zod schema that
   includes schema-first defaults for all optional fields.

2. Replace the manual property defaults in `readTodosFromDir` (lines 114-124)
   with `TodoResponseSchema.parse()`.

Schema definition:

```typescript
const TodoResponseSchema = z.object({
  filename: z.string(),
  title: z.string().default("Untitled"),
  area: z.string().default("unknown"),
  created: z.string().default(""),
  source: z.string().default("manual"),
  tier: z.coerce.number().int().default(0),
  complexity: z.string().default("UNKNOWN"),
  priority: z.string().default("P3"),
  milestone: z.string().default(""),
  state: z.enum(["pending", "done", "completed"]),
});

type TodoResponse = z.infer<typeof TodoResponseSchema>;
```

Usage in `readTodosFromDir`:

```typescript
todos.push(
  TodoResponseSchema.parse({
    filename: file,
    title: fm.title || undefined,
    area: fm.area || undefined,
    created: fm.created || undefined,
    source: fm.source || undefined,
    tier: fm.tier || undefined,
    complexity: fm.complexity || undefined,
    priority: fm.priority || undefined,
    milestone: fm.milestone || undefined,
    state,
  }),
);
```

This eliminates manual defaults (`fm.title || file.replace(...)` etc.) and
ensures a single source of truth for default values per the schema-first parsing
rule. Keep the special case for `title` (fallback to filename without `.md`)
by using `.default()` with a transform or handling it before parse.

Actually, since the title default depends on the filename (dynamic), handle it as:

```typescript
title: fm.title || file.replace(/\.md$/, ""),
```

This is acceptable because the default is data-dependent. All other defaults
should come from the schema.

**Files to create/edit:**

- `packages/luca-observer/app/api/todos/route.ts`

**Verification:**

- No `interface TodoResponse` remains in the file
- `TodoResponseSchema` is defined with Zod
- Manual `|| "unknown"` / `|| "manual"` / etc. defaults are removed (except title which is data-dependent)
- Type is inferred via `z.infer<typeof TodoResponseSchema>`

### 6. Replace native .filter() with lodash filter

**Type:** auto
**TDD:** false
**Depends on:** none

Replace all four native `Array.filter()` calls in `todo-tracker.tsx` with lodash
`filter` for consistency with the lodash-preference rule.

Import `filter` from `lodash/filter`.

Occurrences to replace:

1. Line 65: `todos.filter((t) => t.state === "pending")` ->
   `filter(todos, (t) => t.state === "pending")`

2. Line 66: `todos.filter((t) => t.state === "done" || t.state === "completed")` ->
   `filter(todos, (t) => t.state === "done" || t.state === "completed")`

3. Line 72: `finished.filter((t) => t.milestone)` ->
   `filter(finished, (t) => t.milestone)`

4. Line 110: `todos.filter((t) => { ... })` ->
   `filter(todos, (t) => { ... })`

**Files to create/edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- No native `.filter()` calls remain in `todo-tracker.tsx`
- `filter` import from `lodash/filter` is present

## Verification

1. `bunx --bun tsc --noEmit` passes with no new errors
2. No `emerald-500` references in `todo-tracker.tsx`
3. No raw `<button>` elements in `todo-tracker.tsx`
4. No hand-rolled progress bar in `todo-tracker.tsx`
5. `TodoResponse` in `route.ts` is a Zod schema, not an interface
6. All card-like surfaces use shadcn `Card` component
7. No native `.filter()` calls in `todo-tracker.tsx`

## Success Criteria

- All hard-coded colors replaced with semantic tokens (theme-switchable)
- shadcn Progress replaces custom progress bar (with ARIA semantics)
- shadcn Button replaces raw button element
- shadcn Card replaces ad-hoc card patterns
- TodoResponse uses Zod schema-first parsing
- No TypeScript errors introduced

## Output Specification

- Modified: `packages/luca-observer/components/dashboard/todo-tracker.tsx`
- Modified: `packages/luca-observer/app/api/todos/route.ts`
