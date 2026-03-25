---
title: "Runtime X01: Update domain-architecture and module-boundary docs for new domains"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/backlog-integration.md
depends_on: []
phase: runtime-x
estimated_files: 2
---

## Context

The runtime architecture introduces three new domains: `workflow` (T1), `adapters` (T3), and `eval` (T1). These must be registered in the project's architectural documentation before any implementation begins.

Decision: `adapters` is classified as **T3 Build** (not T1 Core). Rationale from backlog-integration.md: adapters are terminal (nothing in `src/` imports from them), they consume entity definitions (T2) and core utilities (T0-T1), and this matches the existing `src/compilers/` classification. The adapter _interface_ lives in `src/workflow/__schemas/` (T1); implementations live in `src/adapters/` (T3).

## Task

### 1. Update `.claude/rules/domain-architecture.md`

**File:** `/Users/alecsibilia/Github/luca-framework/.claude/rules/domain-architecture.md`

**Change 1 — Add `workflow` to Archetype B Core Domains table:**

In the Archetype B section, add a new row to the table:

OLD:

```
| Domain | Purpose |
|--------|---------|
| planner | Cost model, scheduler, scoring, todo parsing |
| iteration | Budget, checkpoint, classifier, convergence |
| context | Context tier resolution, assembler, envelope |
| observability | Agent scorecard engine, telemetry metrics |
| interop | Cross-agent discovery, IDE tool directory scanning |
| shared | Cross-cutting utilities (format, validation, CLI) |
```

NEW:

```
| Domain | Purpose |
|--------|---------|
| planner | Cost model, scheduler, scoring, todo parsing |
| iteration | Budget, checkpoint, classifier, convergence |
| context | Context tier resolution, assembler, envelope |
| observability | Agent scorecard engine, telemetry metrics |
| interop | Cross-agent discovery, IDE tool directory scanning |
| shared | Cross-cutting utilities (format, validation, CLI) |
| workflow | DAG definition, step registry, typed step contracts |
| eval | Behavioral equivalence evaluation, golden-output comparison |
```

**Change 2 — Add `adapters` to Archetype C Infrastructure Domains table:**

OLD:

```
| Domain | Purpose |
|--------|---------|
| compilers | Compile TS definitions to Claude/Cursor/Plugin markdown |
| complexity | Complexity gating matrix and classifications |
| harness | Verification runner (test/typecheck/lint/build) |
| hooks | Hook registry and config generators |
```

NEW:

```
| Domain | Purpose |
|--------|---------|
| compilers | Compile TS definitions to Claude/Cursor/Plugin markdown |
| complexity | Complexity gating matrix and classifications |
| harness | Verification runner (test/typecheck/lint/build) |
| hooks | Hook registry and config generators |
| adapters | IDE-specific compilation adapters (Claude, Cursor, Windsurf, VS Code) |
```

**Change 3 — Update Four Dependency Tiers table:**

OLD:

```
| Tier | Domains | Role |
|------|---------|------|
| T0 Foundation | shared, complexity | Imported by many, imports nothing from src/ |
| T1 Core | context, planner, harness, iteration, observability, interop | Import T0–T1 (same-tier allowed) |
| T2 Entity | agents, skills, rules | Import T0-T1; parallel, never cross-import |
| T3 Build | compilers, hooks | Terminal; imported by nothing in src/ |
```

NEW:

```
| Tier | Domains | Role |
|------|---------|------|
| T0 Foundation | shared, complexity | Imported by many, imports nothing from src/ |
| T1 Core | context, planner, harness, iteration, observability, interop, workflow, eval | Import T0–T1 (same-tier allowed) |
| T2 Entity | agents, skills, rules | Import T0-T1; parallel, never cross-import |
| T3 Build | compilers, hooks, adapters | Terminal; imported by nothing in src/ |
```

### 2. Update `.claude/rules/module-boundary.md`

**File:** `/Users/alecsibilia/Github/luca-framework/.claude/rules/module-boundary.md`

**Change 1 — Update Dependency Tier Map code block:**

OLD:

```
T0 Foundation:  shared, complexity       (imported by many, imports nothing from src/)
T1 Core:        context, planner, harness, iteration, observability, interop  (import T0-T1)
T2 Entity:      agents, skills, rules    (import T0-T1; parallel, never cross-import)
T3 Build:       compilers, hooks         (terminal; imported by nothing in src/)
```

NEW:

```
T0 Foundation:  shared, complexity       (imported by many, imports nothing from src/)
T1 Core:        context, planner, harness, iteration, observability, interop, workflow, eval  (import T0-T1)
T2 Entity:      agents, skills, rules    (import T0-T1; parallel, never cross-import)
T3 Build:       compilers, hooks, adapters  (terminal; imported by nothing in src/)
```

**Change 2 — Add import rule examples for new domains:**

After the existing Rule 1 examples, add:

```typescript
// ✅ T1 (workflow) importing T0 (complexity)
import { COMPLEXITY_ORDER } from "~/complexity";

// ✅ T1 (workflow) importing T1 (iteration) — same-tier allowed
import { assessBudget } from "~/iteration";

// ✅ T1 (eval) importing T1 (workflow) — same-tier allowed
import type { WorkflowStep } from "~/workflow";

// ✅ T3 (adapters) importing T2 (agents) — downward
import type { AgentConfig } from "~/agents";

// ✅ T3 (adapters) importing T1 (workflow) — downward
import type { Adapter } from "~/workflow";

// ❌ T1 (eval) importing T3 (adapters) — upward dependency
import { cursorAdapter } from "~/adapters";
// FIX: eval imports Adapter interface from workflow (T1), not adapter impl (T3)
```

## Verification

- Both rule files pass markdown linting (no broken tables)
- `workflow` and `eval` appear in T1 row of both files
- `adapters` appears in T3 row of both files
- The import examples accurately reflect the tier rules
- `bunx --bun tsc --noEmit` still passes (docs-only change, no code)
