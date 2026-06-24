---
title: "Comprehensive repo consistency cleanup: types, schemas, naming, directory structure"
area: framework
created: 2026-02-25
source: conversation
---

## Context

The v1.8.0 re-audit exposed many inconsistencies that have accumulated across milestones. While individual findings are being fixed per-milestone, the systemic patterns need a dedicated cleanup phase. The codebase has grown organically and conventions have evolved — leaving behind a patchwork of old and new patterns coexisting.

## Task

Perform a comprehensive repo consistency cleanup covering all of the following areas:

### 1. Type Definition Strategy (Zod schemas vs hand-written interfaces)

The codebase has three entity type files (`agent.types.ts`, `skill.types.ts`, `rule.types.ts`) that each contain hand-written TypeScript interfaces AND re-export Zod-inferred types from companion `.schemas.ts` files. This creates dual definitions with drift risk.

- **Decide:** Should hand-written interfaces be the source of truth (with Zod for runtime validation), or should Zod schemas be canonical (with `z.infer<>` for all types)?
- **Standardize:** Whichever direction is chosen, apply it uniformly across agents, skills, and rules
- **Deduplicate:** Remove the `Section` type that's defined in `format.ts` AND in all three `*.types.ts` files
- **Audit:** Check for any other duplicated type definitions across the codebase

### 2. Directory Structure Rationalization

Files are scattered across inconsistent locations:

- `/scripts/` — Generator scripts, shared utils, parse helpers
- `/src/shared/` — Format, utils, validation, deep-freeze, types, cli-utils
- `/src/*/types/` — Per-entity type folders (agents/types/, skills/types/, rules/types/)
- Some entities use `*.types.ts` files, some use `/types/` directories

**Cleanup items:**

- Decide on a consistent pattern for shared utilities (all in `src/shared/` or split by concern?)
- Rationalize `/scripts/shared/` vs `/src/shared/` — should generator utils live alongside runtime utils?
- Standardize whether entity types live in `types/` subdirectories or `*.types.ts` sibling files
- Audit for orphaned files, misplaced utilities, and dead code

### 3. File Naming Convention Enforcement

Despite the `file-naming.md` rule mandating kebab-case, inconsistencies persist:

- Some generated files have inconsistent naming from generators
- Config variable naming inside files (PascalCase vs camelCase) has been inconsistent
- Test file naming should be audited for consistency with source file naming

### 4. Schema/Validation Pattern Consistency

- Some entity files do double Zod validation (schema.parse at definition + factory parse at instantiation)
- Some use `Object.freeze()` (shallow), now being migrated to `deepFreeze()` — ensure no stragglers
- The `validate*Config` naming pattern is ambiguous (does it validate or create?)
- `safeParse` vs `parse` usage isn't consistent across system boundaries

### 5. Import Path Consistency

- Some files use `node:fs` where `Bun.file()` would be preferred (but sync constraints exist)
- Import grouping and ordering varies across files
- Some cross-package imports use deep relative paths instead of workspace aliases

### 6. Registry Pattern Consistency

- Agent/skill/rule registries use thunks (`() => instance`) for lazy loading
- Hook registry uses plain metadata objects
- Profile registry uses a different structure altogether
- Consider whether thunks are still needed or if direct references suffice

### 7. Comment/Documentation Staleness

- Several stale comments reference classes, old patterns, or incorrect implementations
- JSDoc accuracy varies — some describe what code _used to_ do, not what it does now

## Relationship to Existing Todos

- **`repo-structure-architect-subagent`** — That todo is about building an _automated agent_ to detect these issues. This todo is about actually _fixing_ them. The cleanup should happen first; the subagent can then enforce the patterns going forward.
- **v1.8.0 audit fixes** — The current milestone has been fixing individual findings. This todo captures the systemic cleanup that's too broad for per-finding fixes.

## Notes

- This should be a dedicated milestone (or a major phase within one), not squeezed into another feature milestone
- Consider running this cleanup BEFORE the npm package unification (`unify-npm-package-cli-and-state`) since the package structure should be clean before publishing
- Some decisions here (like type strategy) are architectural and should go through a discussion phase
- Estimated scope: COMPLEX (5-10 files per concern area, ~30-50 files total)
