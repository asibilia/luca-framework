# Phase 12: Observer Polish & DX Cleanup - Research

**Researched:** 2026-03-08
**Domain:** Observer UI (Tailwind CSS, React error handling, accessibility), Agent DX (cold isolation dedup), Bun API migration
**Confidence:** HIGH

## Summary

Phase 12 addresses three distinct areas: (1) observer CSS fragility where 16+ Tailwind classes are missing from the compiled CSS output, (2) error boundary and accessibility gaps in Phase 10's MuninnDB components, and (3) DX cleanup including cold isolation prompt deduplication and Bun API migration for the todos route.

The CSS issue is the most impactful finding. The compiled `globals.css` is stale -- it was built before Phase 10 added the memory components. Many classes used in `brain-panel.tsx`, `memory-entries.tsx`, `working-sections.tsx`, `todo-tracker.tsx`, and `json-viewer.tsx` are absent from the compiled output. Additionally, opacity modifier syntax (`text-muted-foreground/60`, `border-border/30`) and dynamic class composition via template literals are patterns that Tailwind's scanner struggles with. The CONTEXT.md decision to use `clsx` + CVA is sound.

The error boundary situation is better than expected: the memory page already wraps each component with `<ErrorBoundary>` and uses `<LoadingSkeleton>`. However, the dashboard page does NOT wrap its components with ErrorBoundary (except TodoTracker which has its own internal boundary). The cold isolation dedup is straightforward -- the exact same 637-character block appears in 5 reviewer agents and can be extracted to `src/agents/__helpers/`.

**Primary recommendation:** Rebuild the CSS (`bun run css:build`) after fixing all opacity modifier classes. Install `clsx` and `class-variance-authority`. The core fix is replacing non-statically-analyzable class patterns, then rebuilding.

## Standard Stack

### Core

| Library              | Version | Purpose          | Why Standard                                                            |
| -------------------- | ------- | ---------------- | ----------------------------------------------------------------------- |
| tailwindcss          | ^4      | CSS framework    | Already installed; v4 uses CSS-first config via `@import "tailwindcss"` |
| react-error-boundary | ^6.1.1  | Error boundaries | Already installed; functional API, no class components needed           |
| next                 | ^15     | Framework        | Already installed; App Router with error.tsx/loading.tsx conventions    |

### Supporting (Need Installation)

| Library                  | Version | Purpose                         | When to Use                                            |
| ------------------------ | ------- | ------------------------------- | ------------------------------------------------------ |
| clsx                     | ^2      | Conditional class merging       | Replace all template literal class interpolation       |
| class-variance-authority | ^0.7    | Variant-based class composition | Replace dynamic class patterns in todo-tracker, badges |

### Alternatives Considered

| Instead of     | Could Use           | Tradeoff                                                        |
| -------------- | ------------------- | --------------------------------------------------------------- |
| clsx           | cn() from shadcn/ui | clsx is lighter, no twMerge needed since we control all classes |
| CVA            | Manual clsx objects | CVA enforces variant patterns, prevents class soup              |
| Rebuilding CSS | Tailwind safelist   | Safelist is a band-aid; fixing the source patterns is correct   |

**Installation:**

```bash
cd packages/luca-observer && bun add clsx class-variance-authority
```

## Architecture Patterns

### Recommended Approach for CSS Class Fixes

```
packages/luca-observer/
├── components/
│   ├── dashboard/
│   │   └── todo-tracker.tsx     # Replace template literal class composition with CVA variants
│   ├── memory/
│   │   ├── brain-panel.tsx      # Replace inline styles with CSS custom properties + Tailwind classes
│   │   ├── context-usage-bar.tsx # Same -- many inline styles for color-mix
│   │   ├── memory-entries.tsx   # Fix opacity modifiers, line-clamp, underline-offset, max-h
│   │   └── working-sections.tsx # Fix opacity modifiers, border-border/30
│   └── shared/
│       └── json-viewer.tsx      # Fix border-destructive/50
├── tailwind/
│   └── base.css                 # No changes needed (CSS variables are correctly defined)
└── app/
    └── globals.css              # REBUILD via `bun run css:build` after all fixes
```

### Pattern 1: CVA for Component Variants (todo-tracker)

**What:** Replace dynamic class interpolation with typed variant objects.
**When to use:** Any component with 2+ visual states driven by props.
**Example:**

```typescript
// Source: CONTEXT.md decision + CVA documentation
import { cva } from "class-variance-authority";
import { clsx } from "clsx";

const todoSectionVariants = cva(
  "rounded-lg border p-4",
  {
    variants: {
      variant: {
        pending: "border-warning bg-warning/10",
        done: "border-success bg-success/10",
      },
    },
  },
);

const todoTitleVariants = cva(
  "mb-3 font-mono text-sm font-medium",
  {
    variants: {
      variant: {
        pending: "text-warning",
        done: "text-success",
      },
    },
  },
);

// Usage:
<div className={todoSectionVariants({ variant })}>
  <h3 className={todoTitleVariants({ variant })}>{title} ({todos.length})</h3>
</div>
```

### Pattern 2: Replace Opacity Modifier Syntax

**What:** Replace `text-muted-foreground/60` with `text-muted-foreground opacity-60` or explicit CSS classes.
**When to use:** Any `/NN` opacity modifier on custom theme colors.
**Why:** Tailwind v4's scanner can detect opacity modifiers but only when the base color class is a built-in Tailwind color. Custom `@theme` colors with `/60` modifiers may not compile correctly.

```typescript
// BEFORE (not compiled):
className = "text-muted-foreground/60";
className = "border-border/30";

// AFTER (statically analyzable):
className = "text-muted-foreground opacity-60";
className = "border-border opacity-30";
```

However, note that opacity applies to the entire element. For cases where only the text/border color needs transparency, use the `color-mix` approach via CSS custom properties in `base.css`, or simply use the full opacity modifier but ensure the CSS is rebuilt.

**Recommended approach:** Since Tailwind v4 DOES support opacity modifiers with custom colors (via `color-mix`), the real fix is simply rebuilding the CSS. The compiled `globals.css` is stale. Verify after rebuild -- if any classes are still missing, THEN switch to alternative patterns.

### Pattern 3: Replace Inline Styles with CSS Custom Properties

**What:** The Phase 10 memory components use many inline `style={{}}` attributes for `color-mix()` effects. These should be converted to Tailwind utility classes or CSS custom property patterns.
**When to use:** When inline styles use only CSS variables.
**Caveat:** Many of the inline styles in Phase 10 components use dynamic `color-mix(in oklab, var(--color-${variable}) 15%, transparent)` patterns where the variable name is computed at runtime. These CANNOT be statically analyzed by Tailwind. For these cases, keep inline styles but document the pattern.

```typescript
// Dynamic color that CANNOT be a Tailwind class (color name comes from data):
style={{
  color: `var(--color-${coherenceColor(score)})`,
  backgroundColor: `color-mix(in oklab, var(--color-${coherenceColor(score)}) 15%, transparent)`,
}}

// Static color that SHOULD be a Tailwind class:
// BEFORE:
style={{ backgroundColor: "var(--color-info)" }}
// AFTER:
className="bg-info"
// But this requires defining bg-info in Tailwind or base.css
```

**Verdict:** The inline styles for dynamic computed colors (where the color name comes from data/props) should remain as inline styles. This is an acceptable exception. The CONTEXT.md says "never use inline styles" but this should be interpreted as "never use inline styles when a static Tailwind class can do the job." Dynamic color references by variable name have no Tailwind equivalent.

### Anti-Patterns to Avoid

- **Template literal class interpolation:** `className={`bg-${variant}/10`}` -- Tailwind cannot scan this. Use CVA or clsx with full class names.
- **Stale CSS:** Never assume `globals.css` has all needed classes. Run `bun run css:build` after any component changes.
- **Mixing inline styles and Tailwind for the same property:** Use one approach per element, not both.

## Don't Hand-Roll

| Problem                 | Don't Build              | Use Instead                       | Why                                                            |
| ----------------------- | ------------------------ | --------------------------------- | -------------------------------------------------------------- |
| Conditional class names | Manual template literals | `clsx()`                          | Template literals miss edge cases (extra spaces, falsy values) |
| Component variants      | `if/else` class strings  | `cva()` variants                  | Type-safe, self-documenting, prevents class string drift       |
| Error boundaries        | Custom class component   | `react-error-boundary`            | Already installed, supports functional patterns                |
| Loading skeletons       | Per-component skeletons  | `<LoadingSkeleton variant="...">` | Already built in `components/shared/loading-skeleton.tsx`      |
| Page error UI           | Custom error pages       | `<PageError>` component           | Already built in `components/shared/page-error.tsx`            |

**Key insight:** Most of the infrastructure already exists from Phase 4. The Phase 12 work is extending it to Phase 10 components and fixing CSS compilation gaps.

## Common Pitfalls

### Pitfall 1: CSS Not Rebuilding After Component Changes

**What goes wrong:** Components use Tailwind classes that aren't in `globals.css`. UI looks broken with missing styles.
**Why it happens:** The observer uses a CLI-built CSS file (`bun run css:build`), not JIT compilation during `next dev`. The CSS must be explicitly rebuilt.
**How to avoid:** Always run `bun run css:build` (or `bun run css:dev` for development) after modifying component classes. The `dev` script runs `css:watch` in parallel, but if that process wasn't running, classes will be stale.
**Warning signs:** Elements with no visible border, wrong colors, or missing layout styles.

### Pitfall 2: Opacity Modifiers on Custom Theme Colors

**What goes wrong:** `text-muted-foreground/60` doesn't get compiled to the CSS output.
**Why it happens:** Tailwind v4 supports opacity modifiers via `color-mix()` but the class must be detected by the scanner. If the base color is a custom `@theme` variable, the scanner may not pick up all modifier variants.
**How to avoid:** After adding opacity modifier classes, rebuild CSS and verify the class appears in the compiled output. If not, use explicit `opacity-60` utility instead.
**Warning signs:** Color shows at full opacity when it should be semi-transparent.

### Pitfall 3: Dynamic Class Names That Tailwind Cannot Scan

**What goes wrong:** Classes like `bg-${color}/10` where `color` is a variable produce no CSS output.
**Why it happens:** Tailwind scans source files for complete class name strings. Dynamic interpolation creates class names that don't exist as literal strings in source.
**How to avoid:** Use CVA variants that enumerate all possible class combinations, or use inline styles for truly dynamic values. If using `clsx`, use the object form: `clsx({ 'bg-success/10': variant === 'done', 'bg-warning/10': variant === 'pending' })`.
**Warning signs:** Styling changes based on props/state don't apply.

### Pitfall 4: ErrorBoundary Wrapping Client Components in Server Context

**What goes wrong:** Next.js App Router error.tsx files must be client components (`"use client"`).
**Why it happens:** Error boundaries require React state, which only exists in client components.
**How to avoid:** All error.tsx files already have `"use client"`. Keep this pattern. The `<ErrorBoundary>` component from `components/shared/error-boundary.tsx` is also a client component.
**Warning signs:** Hydration errors or "Cannot use hooks in server component" errors.

## Code Examples

### ErrorBoundary Pattern (Already Exists)

```typescript
// Source: packages/luca-observer/components/shared/error-boundary.tsx
// The ErrorBoundary component wraps react-error-boundary with consistent styling.
// Usage pattern from memory page:
<ErrorBoundary name="BrainPanel">
  <BrainPanel items={brain} />
</ErrorBoundary>
```

### LoadingSkeleton Pattern (Already Exists)

```typescript
// Source: packages/luca-observer/components/shared/loading-skeleton.tsx
// Variants: "card" | "table" | "chart" | "text"
<LoadingSkeleton variant="card" />
<LoadingSkeleton variant="text" rows={6} />
```

### CVA Pattern for TodoTracker

```typescript
// Source: class-variance-authority documentation
import { cva, type VariantProps } from "class-variance-authority";

const sectionVariants = cva("rounded-lg border p-4", {
  variants: {
    state: {
      pending: "border-warning bg-warning/10",
      done: "border-success bg-success/10",
    },
  },
});

type SectionProps = VariantProps<typeof sectionVariants>;
```

### Cold Isolation Shared Block Extraction

```typescript
// Source: src/agents/general/dx-advocate.agent.ts (lines 32-48, identical in 5 files)
// Extract to: src/agents/__helpers/cold-isolation-block.ts

/**
 * Cold isolation instruction block shared across reviewer agents.
 *
 * Defines what context cold-isolated agents receive and do not receive.
 * Used by: dx-advocate, code-simplifier, code-architect,
 * performance-auditor, security-auditor.
 */
export const COLD_ISOLATION_BLOCK = `<context_isolation>
## Context Isolation: COLD

You operate in **cold isolation** to prevent bias from executor session context.

**You receive:**
- Git diff of changed files
- MuninnDB brain tree summary (project conventions)

**You do NOT receive:**
- STATE.md (project state)
- MuninnDB session context (executor session notes)
- MuninnDB engrams (historical patterns/decisions)
- Agent summaries from other sub-agents

**Why:** Fresh perspective produces better reviews. Your judgment should be based solely on the code diff and project conventions, not influenced by the executor's reasoning or session history.
</context_isolation>`;
```

### Todos Route Bun API Migration

```typescript
// Source: packages/luca-observer/app/api/todos/route.ts
// BEFORE: Uses node:fs/promises
import { readdir, readFile } from "node:fs/promises";

// AFTER: Use Bun.file and Bun.$ APIs
const file = Bun.file(join(dirPath, filename));
const content = await file.text();

// For readdir, Bun doesn't have a direct replacement.
// Use node:fs/promises readdir (acceptable) or glob pattern.
// Bun.file() is the key win for individual file reads.
```

## State of the Art

| Old Approach                  | Current Approach                              | When Changed             | Impact                                                  |
| ----------------------------- | --------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| Tailwind v3 config file       | Tailwind v4 CSS-first `@import "tailwindcss"` | Already in use           | No config file needed; colors defined in `@theme` block |
| Class component ErrorBoundary | `react-error-boundary` functional API         | Already in use (Phase 4) | All error boundaries use `ErrorBoundary` wrapper        |
| Ad-hoc loading states         | `<LoadingSkeleton variant="...">`             | Already in use (Phase 4) | 4 variants: card, table, chart, text                    |
| `node:fs/promises`            | `Bun.file()`                                  | Project convention       | Bun APIs preferred per CLAUDE.md                        |

**Deprecated/outdated:**

- `tailwind.config.js`: Not used. Tailwind v4 uses CSS-first config.
- Class-based error boundaries: Not used. `react-error-boundary` provides functional API.
- `node:fs/promises` for file reads: Should use `Bun.file()` per project conventions (M23).

## CSS Classes Audit

### Confirmed Missing from Compiled `globals.css`

These classes are used in source components but NOT present in the compiled CSS output:

| Class                      | File(s)                                                                | Impact                                       |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| `text-muted-foreground/60` | brain-panel, memory-entries, working-sections, memory page             | Timestamps, metadata text invisible/unstyled |
| `border-border/30`         | memory-entries, working-sections                                       | Section dividers invisible                   |
| `bg-destructive/10`        | todo-tracker, json-viewer                                              | Error state backgrounds missing              |
| `bg-success/10`            | todo-tracker                                                           | Done state background missing                |
| `border-destructive`       | todo-tracker                                                           | Error border missing                         |
| `border-success`           | todo-tracker                                                           | Success border missing                       |
| `border-destructive/50`    | json-viewer                                                            | Error border missing                         |
| `max-h-[36rem]`            | memory-entries                                                         | Scroll container unbounded                   |
| `line-clamp-2`             | memory-entries                                                         | Text not truncated                           |
| `underline-offset-2`       | memory-entries                                                         | Underline position wrong                     |
| `opacity-70`               | todo-tracker                                                           | Done items not visually dimmed               |
| `line-through`             | todo-tracker                                                           | Done items not struck through                |
| `hover:underline`          | memory-entries                                                         | Hover effect missing                         |
| `hover:bg-destructive/80`  | todo-tracker                                                           | Button hover missing                         |
| `focus:ring-2`             | brain-panel, working-sections, memory-entries, json-viewer, page-error | Focus ring invisible                         |
| `focus:ring-accent`        | same                                                                   | Focus ring color missing                     |
| `focus:ring-offset-2`      | same                                                                   | Focus ring offset missing                    |

### Root Cause

The compiled CSS is generated by `bun run css:build` (or `css:dev`), which runs `bunx @tailwindcss/cli -i ./tailwind/base.css -o ./app/globals.css`. The CSS was last built BEFORE Phase 10 added the memory components. A simple rebuild should pick up all static class names.

### Classes That MAY Still Be Missing After Rebuild

Opacity modifier classes on custom `@theme` colors may or may not compile in Tailwind v4. After rebuild, verify these specifically:

- `text-muted-foreground/60`
- `border-border/30`
- `border-border/50` (currently present but verify)
- `bg-destructive/10`
- `bg-success/10`
- `border-destructive/50`

If any are still missing after rebuild, replace with explicit opacity utilities or add them to a safelist in `base.css`.

## Accessibility Gaps in Phase 10 Components

### Missing Accessibility Attributes

| Component             | Missing                                    | Fix                                                      |
| --------------------- | ------------------------------------------ | -------------------------------------------------------- |
| brain-panel.tsx       | No `role`, no `aria-label` on container    | Add `role="region" aria-label="Brain tree engrams"`      |
| brain-panel.tsx       | No keyboard navigation between engrams     | Add `tabIndex={0}` to expandable items                   |
| context-usage-bar.tsx | No `role`, no `aria-label`                 | Add `role="status" aria-label="MuninnDB statistics"`     |
| context-usage-bar.tsx | Color-only status indicators               | Add text labels alongside colored dots                   |
| memory-entries.tsx    | No `role` on container                     | Add `role="region" aria-label="Memory engrams"`          |
| memory-entries.tsx    | Engram cards missing `aria-expanded`       | Add `aria-expanded={expanded}` to EngramCard button      |
| working-sections.tsx  | No `role` on container                     | Add `role="region" aria-label="Session activity"`        |
| working-sections.tsx  | Session entry rows missing `aria-expanded` | Add `aria-expanded={expanded}` to SessionEntryRow button |
| memory page           | Connection status dot is color-only        | Already has text label "Connected"/"Disconnected" -- OK  |

### Existing Good Patterns (from Phase 4)

These patterns should be extended to Phase 10 components:

- `LoadingSkeleton`: Has `aria-label="Loading" role="status" aria-busy={true}`
- `StatusIndicator`: Has `role="status" aria-label="..."` with meaningful label
- `JsonViewer`: Has `aria-expanded` on toggle buttons
- Dashboard page: Connection status has `role="status" aria-label="Connection status: ..."` with `aria-hidden` on decorative dot

## Cold Isolation Block Analysis

### Current State

The exact same block (637 characters) appears in 5 files:

1. `src/agents/general/dx-advocate.agent.ts` (lines 32-48)
2. `src/agents/general/code-simplifier.agent.ts` (lines 32-48)
3. `src/agents/general/code-architect.agent.ts` (lines 32-48)
4. `src/agents/general/performance-auditor.agent.ts` (lines 32-48)
5. `src/agents/general/security-auditor.agent.ts` (lines 32-48)

Note: `lu-verifier.agent.ts` has a DIFFERENT isolation block (WARM isolation with different receive/not-receive lists). It should NOT use the shared constant.

### Extraction Strategy

Create `src/agents/__helpers/cold-isolation-block.ts` with the shared constant. Each reviewer agent imports and interpolates it into their role section content string. The `createAgent` factory function does not need modification -- the string is simply composed before being passed to `createAgent`.

## Todos Route Analysis

### Current State

`packages/luca-observer/app/api/todos/route.ts` uses:

- `readdir` from `node:fs/promises` -- acceptable (Bun has no direct alternative)
- `readFile` from `node:fs/promises` -- should use `Bun.file().text()` per project conventions
- `join` from `node:path` -- acceptable (Bun supports this)

### Migration Approach

Replace `readFile(join(dirPath, file), "utf-8")` with `await Bun.file(join(dirPath, file)).text()`. Keep `readdir` since Bun has no ergonomic replacement.

## safeSanitizeJsonParse Return Type Drift (M11)

### Current State

Two copies exist:

1. `src/shared/__helpers/validation-utils.ts`: Returns `Result<unknown>` (named type)
2. `packages/luca-framework/src/utils/sanitize.ts`: Returns `{ success: true; data: unknown } | { success: false; error: string }` (inline union)

Both are functionally identical. The named `Result<unknown>` type is defined in `validation-utils.ts`. The fix is to use the same return type in both locations. Since the `packages/` copy cannot import from `src/` (isolated domains), the inline union should be replaced with a locally-defined matching type, or a NOTE comment should document the relationship.

**Note:** This item is listed in the audit but is OUT OF SCOPE for Phase 12 per the CONTEXT.md decisions. The CONTEXT.md does not list M11 as a Phase 12 item. It belongs to a future DX cleanup phase. Include only if the planner decides to add it as a bonus task.

## Open Questions

1. **CSS rebuild timing:** Should the CSS rebuild (`bun run css:build`) happen as a final step after ALL class fixes, or incrementally after each component fix?
   - What we know: The rebuild is fast (~2 seconds). Doing it once at the end is simpler.
   - Recommendation: Do it once at the end of all CSS-related tasks. Include it as a verification step.

2. **Inline styles for dynamic colors:** Several Phase 10 components compute color names from data (e.g., `coherenceColor(score)` returns "success"/"warning"/etc., then used as `var(--color-${result})`). These CANNOT become Tailwind classes because the class name is computed at runtime.
   - What we know: CONTEXT.md says "never use inline styles" but these have no static alternative.
   - Recommendation: Keep inline styles for dynamic computed colors. Document as an accepted exception. Focus Phase 12 on fixing STATIC class issues (opacity modifiers, missing classes) not dynamic ones.

3. **CVA scope:** How many components need CVA beyond todo-tracker?
   - What we know: todo-tracker is the primary candidate (H6/H7). The memory components use inline styles for dynamic colors, not dynamic class names.
   - Recommendation: Use CVA only for todo-tracker. Use `clsx` more broadly for conditional class merging.

## Sources

### Primary (HIGH confidence)

- Direct codebase investigation of all files listed above
- Compiled CSS analysis (`packages/luca-observer/app/globals.css`, 26KB, 1 line minified)
- Phase 10 component source code (4 memory components + memory page)
- Tailwind v4 CSS-first configuration (`tailwind/base.css`)
- Existing Phase 4 patterns (error-boundary.tsx, loading-skeleton.tsx, page-error.tsx)
- v3.0.0 Milestone Audit Report (`.planning/v3.0.0-MILESTONE-AUDIT.md`)
- CONTEXT.md decisions (3 locked decisions)

### Secondary (MEDIUM confidence)

- Tailwind v4 opacity modifier behavior with custom `@theme` colors (verified by CSS output analysis but not by running a build)

### Tertiary (LOW confidence)

- Whether `bun run css:build` alone will fix all opacity modifier classes (needs verification after rebuild)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - all libraries verified in package.json, patterns verified in codebase
- Architecture: HIGH - existing Phase 4 patterns documented and working
- CSS issues: HIGH - compiled CSS analyzed line-by-line, 16+ missing classes confirmed
- Pitfalls: HIGH - root cause (stale CSS build) confirmed by analysis
- Accessibility: HIGH - direct comparison between Phase 4 patterns and Phase 10 components
- Cold isolation: HIGH - exact text compared across all 6 agent files

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- no upstream library changes expected)
