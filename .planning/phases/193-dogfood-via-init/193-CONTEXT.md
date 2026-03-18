# Phase 193 — Dogfood via luca init: Context

## Decision Summary

### 1. Shared resolution approach [researched]

**Decision:** Phase 192 already created `scripts/resolve-templates.ts` with `resolveTemplates()`. This phase verifies that `luca init` can import and use this same function, achieving the single-code-path goal.

The key question: does `packages/luca-framework/src/commands/init.ts` already have its own template resolution, or does it use a different mechanism? If it has its own, we extract/replace it with `resolveTemplates()`. If it delegates elsewhere, we wire it.

### 2. bun link + luca init flow [researched]

**Decision:** The dogfood flow is:

1. `bun run build:compile` — src/ → templates/ (EJS placeholders)
2. `bun link` — register local package globally
3. `luca init` — deploys templates → .claude/ using resolveTemplates()

The chicken-and-egg is already resolved: compilation has no CLI dependency.

### 3. Verification strategy [researched]

**Decision:** Compare .claude/ output from `bun run build:deploy` vs `bun link && luca init` — should be functionally identical (same resolveTemplates code path).

## Scope Guardrail

This phase:

1. Ensures luca init imports resolveTemplates from the shared module
2. Verifies the dogfood pipeline works end-to-end
3. Documents the bun link + luca init workflow

Does NOT modify: compilers, build-compile, copy-harness-templates
