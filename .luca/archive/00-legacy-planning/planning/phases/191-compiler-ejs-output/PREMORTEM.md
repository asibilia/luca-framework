# Pre-Mortem Risk Brief — Phase 191

## Risks

### 1. Placeholder Symbol Collision

Filename placeholders (`__branding.commandPrefix__`) may collide with legitimate agent/skill names during output reads, causing transforms to apply to already-templated files.

**Mitigation:** Strip placeholder format in `transformOutputsToTemplates()` before returning Map; reject filenames matching `__.*__` pattern.

### 2. Transform Logic Divergence

Moved code from script context (async file I/O, stats tracking) to compiler context (Map input/output) may lose edge cases (e.g., exclusion list behavior or placeholder restoration order).

**Mitigation:** Compare transformed content byte-for-byte with current script output.

### 3. Compiler Module Tier Violation

Adding template-transform.ts to `src/compilers/__helpers/` creates implicit T3→T0 dependency if shared/ later imports compiler schemas for branding config.

**Mitigation:** Define branding interface in compilers only; validate module boundaries with `bun run scripts/check-domain-boundaries.ts` after build.

## Plan Constraints

- Extract transform functions exactly as-is from lines 73-203 of copy-harness-templates.ts; do NOT refactor logic
- Verify compiled agent/skill Map keys never match `__.*__` pattern
- Test all 7 regex patterns in transformBrandingContent()
