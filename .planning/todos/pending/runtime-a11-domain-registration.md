---
title: "Runtime A11: Register workflow domain in boundary check and docs"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [A01, A02, A03, A04, A05, A06, A07, A08, A09, A10]
phase: runtime-a
estimated_files: 3
---

## Context

Register the new `src/workflow/` domain in the domain boundary enforcement script and update the architecture rules/docs. The workflow domain is Archetype B (Core Domain) at T1 Core, alongside context, planner, harness, iteration, observability, and interop. This is the final task in Phase A — it validates that the entire domain passes boundary checks and is properly documented.

## Task

### Files to Modify

#### `scripts/check-domain-boundaries.ts`

Add `workflow: 1` to the `DOMAIN_TIER` record. The exact change:

**Old:**

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
};
```

**New:**

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  workflow: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
};
```

#### `.claude/rules/domain-architecture.md`

Add `workflow` to the Archetype B (Core Domain) table. The exact change:

**Old:**

```markdown
| Domain        | Purpose                                            |
| ------------- | -------------------------------------------------- |
| planner       | Cost model, scheduler, scoring, todo parsing       |
| iteration     | Budget, checkpoint, classifier, convergence        |
| context       | Context tier resolution, assembler, envelope       |
| observability | Agent scorecard engine, telemetry metrics          |
| interop       | Cross-agent discovery, IDE tool directory scanning |
| shared        | Cross-cutting utilities (format, validation, CLI)  |
```

**New:**

```markdown
| Domain        | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| planner       | Cost model, scheduler, scoring, todo parsing                               |
| iteration     | Budget, checkpoint, classifier, convergence                                |
| context       | Context tier resolution, assembler, envelope                               |
| observability | Agent scorecard engine, telemetry metrics                                  |
| interop       | Cross-agent discovery, IDE tool directory scanning                         |
| workflow      | DAG workflow engine (builder, validator, executor, checkpoint, visualizer) |
| shared        | Cross-cutting utilities (format, validation, CLI)                          |
```

Also add `workflow` to the Four Dependency Tiers table T1 row.

**Old:**

```markdown
| T1 Core | context, planner, harness, iteration, observability, interop | Import T0–T1 (same-tier allowed) |
```

**New:**

```markdown
| T1 Core | context, planner, harness, iteration, observability, interop, workflow | Import T0–T1 (same-tier allowed) |
```

#### `.claude/rules/module-boundary.md`

Add `workflow` to the Dependency Tier Map T1 line.

**Old:**

```
T1 Core:        context, planner, harness, iteration, observability, interop  (import T0-T1)
```

**New:**

```
T1 Core:        context, planner, harness, iteration, observability, interop, workflow  (import T0-T1)
```

#### `.gitignore` (if `.planning/checkpoints/` is not already listed)

Add the checkpoints directory to gitignore since checkpoints are ephemeral local state:

```
# DAG workflow checkpoints (ephemeral local state)
.planning/checkpoints/
```

## Verification

- [ ] `bunx --bun tsc --noEmit` passes for the entire project
- [ ] `bun run scripts/check-domain-boundaries.ts` passes with zero violations
- [ ] The `workflow` domain appears at T1 in the boundary check script
- [ ] The `workflow` domain appears in the Archetype B table in domain-architecture.md
- [ ] The `workflow` domain appears in the T1 row of the tier table in both domain-architecture.md and module-boundary.md
- [ ] `.planning/checkpoints/` is in `.gitignore`
- [ ] `src/workflow/index.ts` is a pure barrel (re-exports only, no logic)
- [ ] No tier violations: workflow only imports from T0 (shared) and T1 peers (none currently, but allowed)
- [ ] `bun run check:drift` passes (no drift in generated outputs)

## Notes

- Depends on: all previous A01-A10 tasks (this is the final integration check)
- This task should be the last one executed in Phase A because it validates the entire domain
- The `check:drift` verification confirms that adding the workflow domain did not inadvertently change any generated output files (since workflow is not a compiled entity domain, it should not affect `.claude/`, `.cursor/`, or `.pi/` outputs)
- After this task completes, the entire Phase A is done and all verification items from the original monolithic todo should pass
