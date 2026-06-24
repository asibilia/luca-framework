---
phase: 183
plan: 3
type: bug
autonomous: true
wave: 2
depends_on: [1, 2]
---

# Phase 183 Plan 3: Health Gate Before Vault Setup

## Objective

Add a health gate that checks MuninnDB service availability before prompting the user for an API key (REQ-03). Currently, the vault wizard shows the API key prompt even when MuninnDB is not running, which is confusing because the user cannot generate an API key without the MuninnDB Web UI. The fix adds health checks at two levels: in `runVaultWizard()` (defensive, catches direct calls) and in `init.ts` (uses already-tracked `muninndbHealthy` state to skip vault:init entirely).

## Context

@packages/luca-framework/src/utils/vault-setup.ts
@packages/luca-framework/src/commands/init.ts
@packages/luca-framework/src/utils/muninndb-health.ts
@packages/luca-framework/src/utils/muninndb-schemas.ts
@.planning/phases/183-init-flow-critical-fixes/183-RESEARCH.md
@.planning/phases/183-init-flow-critical-fixes/183-CONTEXT.md

## Tasks

### 1. Add health pre-check to `runVaultWizard()`

**Type:** auto
**TDD:** false
**Depends on:** none

Add a MuninnDB health check at the top of `runVaultWizard()` before showing any prompts. If unhealthy, return `null` with a clear warning message.

**Implementation:**

In `packages/luca-framework/src/utils/vault-setup.ts`, modify `runVaultWizard()`:

1. After line 144 (`const suggested = suggestVaultName(context, cwd);`) and before line 146 (`p.log.info("MuninnDB Vault Setup");`), add the health check:

```typescript
// Health gate: check if MuninnDB is reachable before prompting for API key (REQ-03)
const serviceStatus = await checkMuninndbService();
if (!serviceStatus.healthy) {
  p.log.warn(
    "MuninnDB is not running. Vault setup requires MuninnDB to be active.",
  );
  p.log.info(
    "Start MuninnDB and run `luca vault:init` to complete vault setup.",
  );
  return null;
}
```

2. `checkMuninndbService` is already imported at line 35 -- no new import needed.

3. Update the JSDoc on `runVaultWizard()` to document the health pre-check behavior:
   - Mention that it returns `null` if MuninnDB is not healthy
   - Distinguish this from "user cancelled" (both return `null`, but the log messages differ)

**Files to create/edit:**

- `packages/luca-framework/src/utils/vault-setup.ts` (modify `runVaultWizard()`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- When MuninnDB is not running: wizard returns `null` immediately without showing any prompts
- When MuninnDB is running: wizard proceeds normally (unchanged behavior)
- Warning message is clear and actionable (tells user what to run)

### 2. Add health gate in `init.ts` before vault:init step

**Type:** auto
**TDD:** false
**Depends on:** 1

Add a health gate in `init.ts` that uses the already-tracked `muninndbHealthy` variable to skip the vault:init prompt entirely when MuninnDB is unhealthy.

**Implementation:**

In `packages/luca-framework/src/commands/init.ts`, modify the Step 5 (vault setup) block starting at line 639:

1. After the `skip-vault` check and before the `hasPackageJson` prompt (currently line 645), add a health gate:

```typescript
// Health gate: skip vault:init if MuninnDB is not healthy (REQ-03)
if (!muninndbHealthy && !args["skip-muninndb"]) {
  p.log.warn("MuninnDB is not running -- skipping vault setup.");
  p.log.info(
    "After starting MuninnDB, run `luca vault:init` in your project to complete setup.",
  );
} else if (hasPackageJson) {
  // ... existing prompt logic
}
```

2. Restructure the existing if/else block to incorporate the health gate. The logic flow should be:
   - If `--skip-vault`: log skip message (unchanged)
   - Else if MuninnDB is unhealthy (and MuninnDB step was not skipped): log health warning and skip
   - Else if `hasPackageJson`: prompt to run vault:init (existing behavior)
   - Else: show guidance to run vault:init later (existing behavior)

3. No new imports are needed -- `muninndbHealthy` is already tracked at line 518.

**Files to create/edit:**

- `packages/luca-framework/src/commands/init.ts` (modify Step 5 vault setup block)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- When MuninnDB is unhealthy: vault setup step is skipped with clear warning
- When MuninnDB is healthy: vault setup proceeds normally (unchanged behavior)
- When `--skip-muninndb` is used: vault setup still runs (health state is unknown, skip the health gate)
- Warning message tells user exactly what command to run later

### 3. Update post-init readout to reflect health-gated skip

**Type:** auto
**TDD:** false
**Depends on:** 2

Update the post-init readout section (lines 668-734) in `init.ts` to distinguish between "vault skipped due to health" and "vault skipped by user choice".

**Implementation:**

In the "Vault" section of the readout (lines 705-712), add a condition:

```typescript
// Vault section
readout.push("");
readout.push("Vault:");
if (args["skip-vault"]) {
  readout.push("  Skipped (--skip-vault)");
} else if (!muninndbHealthy && !args["skip-muninndb"]) {
  readout.push("  Skipped (MuninnDB not running)");
  readout.push("  Run `luca vault:init` after starting MuninnDB");
} else if (!vaultInitRan) {
  readout.push("  Not configured (run `luca vault:init` in a project)");
}
```

**Files to create/edit:**

- `packages/luca-framework/src/commands/init.ts` (modify post-init readout)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Post-init readout shows appropriate message for each skip reason
- Health-gated skip includes recovery instructions

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. Health gate in `runVaultWizard()`: returns `null` immediately when MuninnDB is unhealthy, no prompts shown
3. Health gate in `init.ts`: skips vault:init prompt entirely when `muninndbHealthy` is `false`
4. Dual-layer protection: both `runVaultWizard()` and `init.ts` independently check health
5. Normal flow: when MuninnDB is healthy, both paths proceed unchanged
6. Recovery guidance: all health-gate messages include `luca vault:init` recovery command
7. Flag interaction: `--skip-muninndb` does not interfere with vault setup (health gate is only active when MuninnDB step ran and failed)

## Success Criteria

- REQ-03 satisfied: API key prompt is never shown when MuninnDB is unreachable
- No regressions: Healthy MuninnDB flow is completely unchanged
- Clear recovery: User knows exactly what to run later (`luca vault:init`)
- Defense in depth: Health is checked in both `runVaultWizard()` and `init.ts` -- either alone is sufficient
- Post-init readout correctly reflects why vault was skipped

## Output Specification

- Modified file: `packages/luca-framework/src/utils/vault-setup.ts` (health pre-check in `runVaultWizard()`)
- Modified file: `packages/luca-framework/src/commands/init.ts` (health gate before vault step + readout update)
- No new files created
- No new dependencies
