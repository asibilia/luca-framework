# Phase 225 — DRY Consolidation: Pre-Mortem Risk Brief

**Complexity:** MODERATE | **Appetite:** Medium

## Risk Scenarios

### R1: `initialSkill` fail-open confusion (HIGH)

The factory's `initialSkill` field hides a behavioral split: some hooks treat missing context as valid for the first skill (fail-open), others unconditionally block (fail-closed). A future author may accidentally supply `initialSkill` on a hook that should always block.

**Mitigation:** Document `initialSkill` as a fail-open exception in JSDoc. Hooks that omit it are contractually fail-closed. Add runtime assertion: if `initialSkill` is set but matched skill !== `initialSkill`, block.

### R2: Generic write signature loses type safety (MEDIUM)

`writeLuContext` uses `& Record<string, unknown>` escape hatch. If copied into the generic factory, TypeScript accepts typos in patch field names silently.

**Mitigation:** Drop `& Record<string, unknown>` from generic write signature. Accept only `Partial<Omit<z.infer<TSchema>, "context_version">>`. Verify all call sites compile before removing originals.

### R3: Incomplete ABORT_TRANSITION extraction (MEDIUM)

`pr-address.states.ts` also defines `ABORT_TRANSITION` but is not listed in DRY-003/004/005 todos. Partial extraction leaves mixed state (4 files import, 1 defines own).

**Mitigation:** Include all 5 `*.states.ts` files in the extraction scope. Single commit to ensure completeness.

## Plan Constraints

1. Factory `initialSkill` must be documented as fail-open exception with JSDoc warning
2. Generic write signature must NOT carry the `& Record<string, unknown>` escape hatch
3. ABORT_TRANSITION extraction must include ALL 5 states files (including pr-address.states.ts)
