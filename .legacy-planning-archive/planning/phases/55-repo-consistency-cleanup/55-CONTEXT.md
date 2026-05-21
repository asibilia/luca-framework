# Phase 55 — Repo Consistency Cleanup: Context & Decisions

> Decisions locked during discussion phase. Downstream agents (planner, executor, verifier) use this as implementation guide.

## Task Summary

Comprehensive repo consistency cleanup covering all 7 concern areas identified in the v1.8.0 re-audit. Estimated ~30-50 files across the entire `src/` directory. No deferrals — all concerns addressed in this pass.

## Locked Decisions

### 1. Type Definition Strategy

| Decision                | Choice                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth         | **Zod-only** — all data shape types derived from Zod schemas via `z.infer`                                                                           |
| Hand-written interfaces | **Delete** — remove all parallel interfaces from `*.types.ts` files                                                                                  |
| Behavior contracts      | **Convert to function type signatures** — replace BaseAgent/BaseSkill/BaseRule interfaces with explicit function types (aligns with no-classes rule) |
| Backward-compat aliases | **Remove** — delete CognitionTier/CognitionConfig re-exports, update all callers                                                                     |
| Section type location   | **Canonical in `src/shared/format.ts`** — deduplicate from all `*.types.ts` files                                                                    |

### 2. Zod Naming Convention

| Element           | Convention                               | Example                                                                 |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Zod schema object | `FooSchema` (PascalCase + Schema suffix) | `export const AgentFrontmatterSchema = z.object({...})`                 |
| Inferred TS type  | `Foo` (plain PascalCase)                 | `export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>` |
| File location     | Single `.schemas.ts` file per entity     | `agent.schemas.ts` contains both schema + inferred type                 |
| Deleted files     | `*.types.ts` files removed               | `agent.types.ts`, `skill.types.ts`, `rule.types.ts` — all deleted       |

### 3. Migration Depth

| Module                       | Decision                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `src/harness/types.ts`       | **Full Zod migration** — all 6 interfaces → z.object + z.infer                       |
| `src/complexity/types.ts`    | **Full Zod migration** — enums → z.enum, interfaces → z.object                       |
| `Object.freeze()` stragglers | **Replace all with deepFreeze** across the codebase                                  |
| `safeParse` vs `parse`       | Standardize: `safeParse()` at system boundaries, `parse()` for internal trusted data |

### 4. Scope & Wave Order

**All 7 concern areas in scope. No deferrals.**

| Wave | Focus                                                                               | Risk   | Code Changes?           |
| ---- | ----------------------------------------------------------------------------------- | ------ | ----------------------- |
| 1    | Investigation — resolve unknowns (U1-U5)                                            | None   | Read-only               |
| 2    | Low-risk naming/placement — file renames, lu-workflow.rule.ts move, import cleanup  | Low    | git mv + import updates |
| 3    | Schema consolidation — Zod-only types, delete .types.ts, deduplicate Section        | High   | ~15 core files          |
| 4    | New Zod schemas + remaining — harness, complexity, registries, deepFreeze, comments | Medium | ~15-20 files            |

### 5. Directory Structure

| Decision              | Choice                                                              |
| --------------------- | ------------------------------------------------------------------- |
| `lu-workflow.rule.ts` | **Move to `src/rules/general/`** via git mv, update registry import |

### 6. Registry Patterns

| Decision      | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Pattern       | **Standardize all registries to thunks** `() => instance` |
| Hook registry | Currently plain objects — wrap in thunks for consistency  |

### 7. Comments/Documentation

| Decision          | Choice                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| Stale comments    | **Delete** — remove references to old patterns, classes, incorrect implementations |
| New documentation | **Don't add** — only fix what's broken, don't expand JSDoc in this pass            |

## Unknowns to Resolve (Wave 1)

These must be answered by investigation before any code changes:

- **U1**: Which consumers import `AgentFrontmatter` (interface) vs `AgentFrontmatterSchema` (inferred type)?
- **U2**: Which `__tests__/` files import from paths that would be affected by renames?
- **U3**: Does `lu-workflow.rule.ts` placement at rules root serve a purpose in registry ordering?
- **U4**: How does harness config load from config.json — unsafe casts?
- **U5**: What output paths does `check-drift.test.ts` validate?

## Risk Mitigations

- **R1 (build pipeline)**: Run `bun run build:all` after every wave. Verify drift check passes.
- **R2 (parallel drift)**: Eliminated by going Zod-only — single source of truth.
- **R5 (indirect consumers)**: Wave 1 investigation catches these before code changes begin.
- **Two-wave migration pattern** (from MEMORY P26): Create new → test → migrate consumers → delete old.
- **Checksum verification** (from MEMORY P22): SHA-256 of outputs before/after build to confirm zero unintended changes.

## Deferred Ideas

(none — all concerns in scope)

---

_Created: 2026-02-26_
_Complexity: COMPLEX_
_GitHub Issue: #22_
