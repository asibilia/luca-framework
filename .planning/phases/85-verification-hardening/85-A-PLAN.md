---
id: 85-A
title: "Verification Parity Matrix & Semantic Convergence Detection"
phase: 85
wave: 1
tdd: false
---

# Plan 85-A: Verification Parity Matrix & Semantic Convergence Detection

## Objective

Implement R10 (cross-format verification parity) and R11 (semantic convergence detection) to harden the verification pipeline.

## Tasks

### T1: Parity Schema & Verifier (R10)

Create `src/compilers/__helpers/parity.ts` and corresponding schemas.

**Deliverables:**

- `parityCheckSchema` in `src/compilers/__schemas/compilers.schemas.ts` — schema for parity check results
- `checkFormatParity()` — compares entity counts across Claude/Cursor/Pi/Plugin outputs
- `checkContentParity()` — verifies structural content equivalence (same entities produce equivalent output)
- `generateParityReport()` — produces formatted parity report

**Verification:** Tests confirm count mismatches are detected, content drift flagged.

### T2: Parity Integration & Barrel Exports (R10)

Wire parity into the build pipeline and export from barrel.

**Deliverables:**

- Export parity functions from `src/compilers/index.ts`
- Export parity schema/types from barrel

**Verification:** Barrel exports compile, parity functions accessible via `~/compilers`.

### T3: Semantic Overlap in Convergence (R11)

Add cosine similarity to convergence detection.

**Deliverables:**

- `computeSemanticOverlap()` in `src/iteration/__helpers/convergence.ts` — computes cosine similarity between error message vectors using TF-IDF-like term frequency
- Add optional `semantic_overlap` field to `convergenceSignalsSchema`
- Update `computeConvergenceSignals()` to include semantic overlap
- Update `assessConvergence()` to use 4-signal stale detection when semantic_overlap present

**Verification:** Tests confirm semantic overlap detects equivalent errors with different wording.

### T4: Convergence Schema & Barrel Updates (R11)

Update iteration schemas and barrel exports.

**Deliverables:**

- Updated `convergenceSignalsSchema` with optional `semantic_overlap`
- Updated barrel exports in `src/iteration/index.ts`
- CLI entry point updated to accept `--semantic` flag

**Verification:** Schema validates with and without semantic_overlap field.

### T5: Tests for R10 & R11

**Deliverables:**

- `__tests__/src/compilers/parity.test.ts` — parity matrix tests
- `__tests__/src/iteration/semantic-convergence.test.ts` — semantic overlap tests

### T6: Final Verification & SUMMARY

Run full test suite, create 85-A-SUMMARY.md.
