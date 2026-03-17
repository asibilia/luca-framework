# PLAN-03 Summary: Health Gate Before Vault Setup

## Phase: 183 | Plan: 3 | Wave: 2

## Result: PASS

All three tasks completed successfully. REQ-03 is satisfied.

## Tasks Completed

### Task 1: Health pre-check in `runVaultWizard()`

- **File:** `packages/luca-framework/src/utils/vault-setup.ts`
- Added `checkMuninndbService()` call after `suggestVaultName()` and before any interactive prompts
- Returns `null` immediately with warning + recovery instructions when MuninnDB is unhealthy
- Updated JSDoc to document health pre-check behavior and distinguish from user cancellation
- No new imports needed (`checkMuninndbService` already imported at line 35)

### Task 2: Health gate in `init.ts` before vault:init step

- **File:** `packages/luca-framework/src/commands/init.ts`
- Restructured Step 5 if/else chain to: `--skip-vault` -> health gate -> normal flow
- Health gate condition: `!muninndbHealthy && !args["skip-muninndb"]`
- When `--skip-muninndb` is used, health gate is bypassed (health state unknown)
- Warning message includes recovery command (`luca vault:init`)

### Task 3: Post-init readout update

- **File:** `packages/luca-framework/src/commands/init.ts`
- Vault readout now distinguishes three states:
  - `--skip-vault`: "Skipped (--skip-vault)"
  - Health-gated: "Skipped (MuninnDB not running)" + recovery instruction
  - User choice: "Not configured (run `luca vault:init` in a project)"

## Verification

- `bunx --bun tsc --noEmit`: No new type errors (4 pre-existing errors in `dist/plugin/` unrelated to changes)
- Health gate in `runVaultWizard()`: returns `null` before any prompts when unhealthy
- Health gate in `init.ts`: skips vault prompt when `muninndbHealthy` is false
- `--skip-muninndb` flag: does not trigger health gate (health state unknown)
- Recovery guidance: all health-gate messages include `luca vault:init`

## Deviations

None.

## Files Modified

- `packages/luca-framework/src/utils/vault-setup.ts` (health pre-check + JSDoc update)
- `packages/luca-framework/src/commands/init.ts` (health gate + readout update)

## Success Criteria

- [x] REQ-03 satisfied: API key prompt is never shown when MuninnDB is unreachable
- [x] No regressions: Healthy MuninnDB flow is completely unchanged
- [x] Clear recovery: User knows exactly what to run later (`luca vault:init`)
- [x] Defense in depth: Health is checked in both `runVaultWizard()` and `init.ts`
- [x] Post-init readout correctly reflects why vault was skipped
