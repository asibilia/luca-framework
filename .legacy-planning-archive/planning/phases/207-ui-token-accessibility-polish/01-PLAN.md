---
phase: 207
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 207 Plan 1: Hardcoded Color Migration to CSS Variable Tokens

## Objective

Replace all hardcoded green/amber Tailwind color classes with semantic CSS variable tokens (`text-success`, `bg-success/10`, `text-warning`, `bg-warning/10`) across 6 components and the settings page. The tokens `--color-success`, `--color-warning`, and `--color-info` already exist in `tailwind/base.css` and are mapped to `--success`/`--warning`/`--info` custom properties with light/dark mode values. Components currently bypass these tokens with hardcoded `green-500`, `green-600`, `green-700`, `amber-500`, `amber-600`, `amber-700` classes.

> Appetite: Small (50000 tokens remaining of 50000 ceiling)

## Context

@packages/luca-studio/tailwind/base.css (lines 17-35: existing `--color-success`, `--color-warning`, `--color-info` tokens; lines 75-91 & 129-145: light/dark mode values)
@packages/luca-studio/components/feedback/save-bar.tsx
@packages/luca-studio/app/settings/page.tsx
@packages/luca-studio/components/settings/config-history.tsx
@packages/luca-studio/components/settings/vault-config.tsx
@packages/luca-studio/components/settings/project-identity.tsx
@packages/luca-studio/components/shared/entity-tab-container.tsx

## Tasks

### 1. Audit and map all hardcoded color instances

**Type:** auto
**TDD:** false
**Depends on:** none

Identify every hardcoded green/amber Tailwind class in the 6 target files and map each to its semantic token replacement. The mapping is:

| Hardcoded Class                      | Semantic Replacement |
| ------------------------------------ | -------------------- |
| `text-green-700 dark:text-green-400` | `text-success`       |
| `text-green-600 dark:text-green-400` | `text-success`       |
| `bg-green-500/10`                    | `bg-success/10`      |
| `border-green-500/30`                | `border-success/30`  |
| `text-amber-700 dark:text-amber-400` | `text-warning`       |
| `text-amber-600 dark:text-amber-400` | `text-warning`       |
| `text-amber-500`                     | `text-warning`       |
| `bg-amber-500/10`                    | `bg-warning/10`      |
| `border-amber-500/30`                | `border-warning/30`  |

No new CSS variables are needed -- the tokens exist. The Tailwind v4 `@theme` block in `base.css` already registers `--color-success`, `--color-warning`, `--color-info`, so classes like `text-success`, `bg-success/10` work out of the box.

**Files to create/edit:**

- None (analysis task)

**Verification:**

- Mapping table covers all instances found via grep for `green-` and `amber-` in target files

### 2. Replace hardcoded colors in save-bar.tsx

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the saved-state background/text colors.

Current:

```
bg-green-500/10 text-green-700 dark:text-green-400
```

Replacement:

```
bg-success/10 text-success
```

The `dark:text-green-400` override is no longer needed because `--success` already has a dark mode value defined in `base.css` (`.dark { --success: #22c55e; }`).

**Files to create/edit:**

- `packages/luca-studio/components/feedback/save-bar.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining `green-` or `amber-` classes in the file

### 3. Replace hardcoded colors in settings/page.tsx

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace three hardcoded color patterns:

1. **Publish success banner** (line ~173): `border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400` to `border-success/30 bg-success/10 text-success`
2. **SSE conflict warning** (line ~205): `border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400` to `border-warning/30 bg-warning/10 text-warning`

**Files to create/edit:**

- `packages/luca-studio/app/settings/page.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining `green-` or `amber-` classes in the file

### 4. Replace hardcoded colors in config-history.tsx, vault-config.tsx, project-identity.tsx

**Type:** auto
**TDD:** false
**Depends on:** 1

All three files use the same amber warning pattern for error states:

```
border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400
```

Replace with:

```
border-warning/30 bg-warning/10 text-warning
```

Additionally, `vault-config.tsx` has health status colors:

- `text-green-600 dark:text-green-400` to `text-success`
- `text-amber-600 dark:text-amber-400` to `text-warning`

**Files to create/edit:**

- `packages/luca-studio/components/settings/config-history.tsx`
- `packages/luca-studio/components/settings/vault-config.tsx`
- `packages/luca-studio/components/settings/project-identity.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining `green-` or `amber-` classes in any of the three files

### 5. Replace hardcoded colors in entity-tab-container.tsx

**Type:** auto
**TDD:** false
**Depends on:** 1

Two amber instances:

1. Dirty indicator text (line ~253): `text-amber-500` to `text-warning`
2. Sidecar offline icon (line ~357): `text-amber-500` to `text-warning`

**Files to create/edit:**

- `packages/luca-studio/components/shared/entity-tab-container.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining `green-` or `amber-` classes in the file

## Verification

1. Run `bunx --bun tsc --noEmit` across luca-studio -- no type errors
2. Grep `packages/luca-studio/components` and `packages/luca-studio/app` for `green-[0-9]` and `amber-[0-9]` -- zero matches in the 6 target files
3. Visual spot check: success states render green, warning/error states render amber, both in light and dark mode

## Success Criteria

- Zero hardcoded green/amber Tailwind color classes remain in the 6 target files
- All status colors use `text-success`, `bg-success/*`, `text-warning`, `bg-warning/*` semantic tokens
- No `dark:text-green-*` or `dark:text-amber-*` overrides remain (the CSS variables handle dark mode)
- TypeScript compilation passes

## Output Specification

- 6 modified component/page files with semantic color tokens replacing hardcoded values
