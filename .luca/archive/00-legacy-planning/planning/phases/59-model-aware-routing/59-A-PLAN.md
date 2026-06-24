# Plan 59-A: Extend Schemas with Model Routing Fields

## Objective

Add model routing schemas to AgentFrontmatterSchema and ComplexityGateSchema.

## Tasks

### 1. Create ModelRoutingConfigSchema

In `src/agents/__schemas/agent.schemas.ts`, add:

- A `ModelIdSchema` — z.enum of known model identifiers ("opus", "sonnet", "haiku")
- A `ModelRoutingConfigSchema` — z.object with:
  - `default_model`: ModelIdSchema.default("sonnet") — default model for this agent
  - `complexity_overrides`: optional z.record mapping complexity levels to model IDs
- Add `model_routing: ModelRoutingConfigSchema.optional()` to AgentFrontmatterSchema

### 2. Extend ComplexityGateSchema

In `src/complexity/__schemas/complexity.schemas.ts`, add:

- `default_model: ModelIdSchema.optional()` — default model for this complexity level

### 3. Update DEFAULT_COMPLEXITY_MATRIX

In `src/complexity/__helpers/defaults.ts`, add default_model to each level:

- TRIVIAL: "haiku"
- SIMPLE: "haiku"
- MODERATE: "sonnet"
- COMPLEX: "sonnet"
- CRITICAL: "opus"

### 4. Update barrel exports

Ensure new schemas and types are exported from domain index.ts barrels.

## Verification

- TypeScript compiles
- Existing tests still pass (schemas have optional fields with defaults)
