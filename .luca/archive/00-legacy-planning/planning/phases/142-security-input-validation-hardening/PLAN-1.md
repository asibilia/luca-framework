---
phase: 142
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 142 Plan 1: Shared Sanitization Helpers

## Objective

Add `escapeXmlAttr()` and `escapeRegExp()` helper functions to the T0 shared domain (`src/shared/__helpers/sanitize-template.ts`) and export them from the shared barrel. These functions are prerequisites for the security fixes in Plan 2 (H2 prompt injection, M11 unescaped regexp).

> Appetite: Medium (100000 tokens remaining of 100000 ceiling)

## Context

@src/shared/**helpers/sanitize-template.ts — existing T0 sanitizer, co-location target for new helpers
@src/shared/index.ts — barrel exports, needs new exports added
@src/hooks/pi-extensions/**helpers/sanitize.ts — T3 reference implementation of escapeRegExp and isWithinDirectory (cannot import from T3, must duplicate to T0)

## Tasks

### 1. Add escapeXmlAttr to sanitize-template.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add the `escapeXmlAttr(str: string): string` function to `src/shared/__helpers/sanitize-template.ts`. This function escapes `&`, `"`, `'`, `<`, `>` characters to their XML entity equivalents, preventing injection via XML attribute values.

The function should:

- Accept a string parameter
- Return the string with the 5 XML-sensitive characters replaced by their entity equivalents (`&amp;`, `&quot;`, `&#39;`, `&lt;`, `&gt;`)
- Process `&` first to avoid double-escaping
- Include full JSDoc documentation with purpose, parameters, return value, and examples

Place it after the existing `sanitizeForTemplate` function, under a new section comment `// --- XML Attribute Escaping ---`.

**Files to create/edit:**

- `src/shared/__helpers/sanitize-template.ts`

**Verification:**

- Function exists and is exported
- `bunx --bun tsc --noEmit` passes

### 2. Add escapeRegExp to sanitize-template.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add the `escapeRegExp(str: string): string` function to `src/shared/__helpers/sanitize-template.ts`. This function escapes all RegExp special characters (`.*+?^${}()|[]\`) so the string can be safely used in `new RegExp()`.

The function should:

- Accept a string parameter
- Return the string with all RegExp metacharacters escaped with backslash
- Use the standard MDN pattern: `str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`
- Include full JSDoc documentation

Place it after `escapeXmlAttr`, under a new section comment `// --- RegExp Escaping ---`.

**Files to create/edit:**

- `src/shared/__helpers/sanitize-template.ts`

**Verification:**

- Function exists and is exported
- `bunx --bun tsc --noEmit` passes

### 3. Export new helpers from shared barrel

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update `src/shared/index.ts` to export `escapeXmlAttr` and `escapeRegExp` from `sanitize-template.ts`. Add them to the existing "Template Sanitization" export section alongside `sanitizeForTemplate`.

**Files to create/edit:**

- `src/shared/index.ts`

**Verification:**

- Both functions are importable via `~/shared`
- `bunx --bun tsc --noEmit` passes
- No domain boundary violations: `bun run scripts/check-domain-boundaries.ts` passes

## Verification

1. `bunx --bun tsc --noEmit` — type checking passes
2. `bun run scripts/check-domain-boundaries.ts` — no tier violations
3. Both new functions are exported from `src/shared/index.ts`
4. The existing `sanitizeForTemplate` function is unchanged

## Success Criteria

- `escapeXmlAttr` and `escapeRegExp` are available in the T0 shared domain
- Plan 2 tasks can import them without tier violations
- No regressions in existing sanitize-template functionality

## Output Specification

- Modified: `src/shared/__helpers/sanitize-template.ts` (2 new exported functions)
- Modified: `src/shared/index.ts` (2 new barrel exports)
