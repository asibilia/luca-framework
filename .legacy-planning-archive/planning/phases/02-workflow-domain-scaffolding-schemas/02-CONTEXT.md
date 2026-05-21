# Phase 2 Context: Workflow Domain Scaffolding + Schemas

## Objective

Create src/workflow/ directory structure (Archetype B, T1 Core), define all core workflow Zod schemas, and define all step contract schemas.

## Decisions

### Domain Classification (locked)

- src/workflow/ is Archetype B (Core Domain), Tier T1
- Structure: **schemas/, **helpers/, index.ts barrel
- No flat files in domain root except index.ts

### Schema Design (locked — from architecture docs)

- A01: Directory scaffolding with placeholder files and empty \_\_helpers/
- A02: 16 schemas in workflow.schemas.ts (WorkflowStep, WorkflowDAG, DAGCheckpoint, StepResult, ExecutionResult, ValidationResult, Adapter, plus supporting enums/configs)
- A03: 9 schemas in contracts.schemas.ts (ClassifyOutput, DiscussOutput, PlanOutput, ExecuteOutput, VerifyOutput, LearnOutput, CommitOutput, plus Appetite and VerificationGap)

### Key Implementation Notes (locked)

- `guard` and `executeStep` use `z.function()` — runtime closures, not serializable
- `inputSchema`/`outputSchema` use `z.any().optional()` — hold ZodTypeAny at runtime
- `checkpointSchemaVersion` field added per risk-analysis.md recommendation
- Step contracts are initial approximations (Risk 11 — expect 2-3 revision cycles)
- A02 and A03 both depend on A01 but NOT on each other

### No Gray Areas

All todos contain exact TypeScript implementations. Every field, type, and default value is specified.

## Constraints

- Barrel index.ts must be pure re-exports only
- All schemas follow schema-first-parsing rule (defaults in schema, not destructuring)
- camelCase for internal TypeScript schemas (not API-facing)
