# Phase 205 Pre-Mortem Risk Brief

**Phase:** 205 — Entity Hook DRY Extraction
**Complexity:** SIMPLE
**Generated:** 2026-03-26

## Failure Scenarios

### 1. Jotai Atom Factory ID Collision

**Risk:** Generic hooks using hardcoded `__noop__` atoms will collide when multiple entity types load without selection.
**Likelihood:** Medium
**Impact:** Medium — silent state corruption across entity pages
**Mitigation:** Ensure EntityHookConfig includes entityType in atom factory key generation (`${entityType}:__noop__` instead of bare `__noop__`).

### 2. FieldKeyMap Serialization Schema-First Violation

**Risk:** Entity-specific field key maps moved to schemas but hook consumers still pass raw objects without Zod validation.
**Likelihood:** Low
**Impact:** Low — violates convention but doesn't break runtime
**Mitigation:** Create `FieldKeyMapSchema` with safeParse validation. Update wrapper hooks to parse config before passing to generic.

### 3. Dead Code Reference Propagation

**Risk:** Removing `canUndo`/`canRedo` from pages but not from the hook return type, leaving orphaned exports.
**Likelihood:** Medium
**Impact:** Low — dead code remains but no runtime impact
**Mitigation:** Grep for ALL `canUndo`/`canRedo` references before cleanup. Remove from hook return type in same commit as page cleanup (atomic change).

## Plan Constraints

- Validate atom factory key generation (entityType must be included)
- Use safeParse on FieldKeyMap in wrapper hooks
- Remove canUndo/canRedo from hook return type atomically with page cleanup
