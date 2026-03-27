# SUMMARY: PLAN-98-B — Refactor Diagnostic Prompt Builders into Factory/Template Pattern

## Phase 98 | Wave 1 | GitHub Issue #42

## Objective

Refactor the 3 diagnostic prompt builders in `verification-tribunal.ts` that shared ~80% identical structure into a factory function. Only the role name, role description, opening qualifier, and 3 evaluation questions differ.

## Changes Made

### File Modified

- `src/agents/__helpers/verification-tribunal.ts`

### Task 1: Created `DiagnosticPromptConfig` interface and `buildDiagnosticPrompt` factory

Added a `DiagnosticPromptConfig` interface capturing the four varying fields (opening_qualifier, role, role_description, questions) and a private `buildDiagnosticPrompt` factory function that produces the shared template. Placed before the existing public builders at line 128.

### Task 2: Refactored `buildTestWriterDiagnosticPrompt`

Replaced the 27-line inline template with a single `buildDiagnosticPrompt()` call passing test-writer-specific config. Public API unchanged.

### Task 3: Refactored `buildVerifierDiagnosticPrompt`

Replaced the 27-line inline template with a single `buildDiagnosticPrompt()` call passing verifier-specific config. Public API unchanged.

### Task 4: Refactored `buildIntegrationDiagnosticPrompt`

Replaced the 27-line inline template with a single `buildDiagnosticPrompt()` call passing integration-checker-specific config. Public API unchanged.

## Success Criteria Verification

| Criterion                                                     | Status |
| ------------------------------------------------------------- | ------ |
| Factory function `buildDiagnosticPrompt` added                | PASS   |
| All 3 public builders delegate to factory                     | PASS   |
| "Categorize the root cause" appears exactly once (in factory) | PASS   |
| Public API unchanged (3 exported functions, same signatures)  | PASS   |
| `bunx --bun tsc --noEmit` passes                              | PASS   |
| `bun test` passes (24/24 tests, 0 failures)                   | PASS   |

## Lines of Code Impact

- Before: ~81 lines across 3 builders (27 lines each)
- After: ~45 lines (28-line factory + ~5 lines per builder config call)
- Net reduction: ~36 lines of duplicated template text eliminated

## Test Results

```
24 pass, 0 fail, 43 expect() calls
100% function coverage on verification-tribunal.ts
```
