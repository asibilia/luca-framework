# Phase 2 Context: Adapter Compatibility Report (E04)

## Decisions

### 1. Validation as Standalone Helper [auto-resolved]

The E04 todo specifies `validate()` as an adapter method, but the real Adapter interface has no `validate()` method (same reconciliation as Phase 1).

**Decision:** Implement validation as standalone functions in `src/adapters/__helpers/compatibility-validator.ts`, not on the Adapter interface. Each adapter gets a `validateXOutput()` function that takes compiled output and returns a `CompatibilityReport`.

### 2. Build Pipeline Integration Scope [auto-resolved]

The todo references `bun run build:all --adapter=all` CLI integration. The current build pipeline is complex (generated file guard, dogfood config).

**Decision:** For this phase, create the schema + validators + report aggregation utility. Defer actual CLI/build pipeline wiring to a future housekeeping task. The validators can be called programmatically by any consumer.

## Scope Boundaries

- **IN SCOPE:** CompatibilityReport schema, per-adapter validate functions, aggregation utility
- **OUT OF SCOPE:** CLI flag parsing, build pipeline changes, dist/ output wiring
