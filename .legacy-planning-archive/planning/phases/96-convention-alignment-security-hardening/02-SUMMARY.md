# Phase 96-B Summary: Add sanitizeForTemplate() to tribunal prompt construction

## Status: COMPLETE

## What Changed

Closed prompt injection gaps by sanitizing AI-generated free-text fields before they are interpolated into prompt template literals across all tribunal and debate infrastructure.

### Task 1: Add `sanitizeForTemplate` to `src/shared/__helpers/`

- **File**: `src/shared/__helpers/sanitize-template.ts` (already created in 96-01 wave)
- **Barrel**: `src/shared/index.ts` (already updated in 96-01 wave)
- Created T0 copy of `sanitizeForTemplate` to allow T2 entity domains and T0 core domains to use it without violating module boundary rules (T3 hooks cannot be imported by T0/T2).

### Task 2: Apply to `root-cause-tribunal.ts`

- **File**: `src/agents/__helpers/root-cause-tribunal.ts`
- Wrapped `fixSignal.root_cause`, `fixSignal.proposed_fix`, `fixSignal.evidence_summary` in all 3 prompt builders (9 call sites):
  - `buildDebuggerDefensePrompt`
  - `buildVerifierChallengePrompt`
  - `buildArbiterPrompt`
- Left `files_changed.join()` unwrapped (safe data).

### Task 3: Apply to `verification-tribunal.ts`

- **File**: `src/agents/__helpers/verification-tribunal.ts`
- Wrapped `conflict.t1_evidence` and `conflict.t3_evidence` in all 3 diagnostic prompt builders (6 call sites):
  - `buildTestWriterDiagnosticPrompt`
  - `buildVerifierDiagnosticPrompt`
  - `buildIntegrationDiagnosticPrompt`
- Left enum/status fields unwrapped (safe data).

### Task 4: Apply to `tribunal-rebuttals.ts`

- **File**: `src/shared/__helpers/tribunal-rebuttals.ts`
- Wrapped `defendedFinding.issue`, `defendedFinding.suggestion`, `challengerFinding.issue`, `challengerFinding.suggestion` in both prompt builders (8 call sites):
  - `buildChallengerPrompt`
  - `buildDefenderPrompt`
- Left file paths, severity, and agent names unwrapped (safe data).

### Task 5: Apply to `pr-verdict-debate.ts`

- **File**: `src/skills/__helpers/pr-verdict-debate.ts`
- Wrapped `split.comment_text`, `v.reasoning`, and `dissenterArgument` in prompt builders:
  - `buildDissenterPrompt`: comment_text + reasoning (4 call sites via map)
  - `buildMajorityResponsePrompt`: comment_text + dissenterArgument (2 call sites)
- Left agent names and count values unwrapped (safe data).

### Task 6: Write test for shared `sanitizeForTemplate`

- **File**: `__tests__/src/shared/sanitize-template.test.ts`
- 12 tests with 100% function and line coverage:
  - Strips backticks
  - Strips template injection sequences (`${...}`)
  - Replaces newlines with spaces
  - Strips control characters (0x00-0x1f, 0x7f)
  - Passes through normal text unchanged
  - Handles empty string
  - Handles combined injection patterns
  - Strips nested template literal attempts
  - Preserves Unicode text
  - Handles multiple newlines/carriage returns

### Task 7: Final validation

- `bunx --bun tsc --noEmit` -- PASS (zero errors)
- `bun test` -- 117 tests across 4 files, all pass
- All 4 target files confirmed to have `sanitizeForTemplate` imports

## Call Sites Summary

| File                     | Call Sites | Fields Sanitized                           |
| ------------------------ | ---------- | ------------------------------------------ |
| root-cause-tribunal.ts   | 9          | root_cause, proposed_fix, evidence_summary |
| verification-tribunal.ts | 6          | t1_evidence, t3_evidence                   |
| tribunal-rebuttals.ts    | 8          | issue, suggestion (defender + challenger)  |
| pr-verdict-debate.ts     | ~6         | comment_text, reasoning, dissenterArgument |
| **Total**                | **~29**    |                                            |

## Commits

1. `fix(96-02): add sanitizeForTemplate to shared/__helpers for T0 prompt sanitization` (no-op, already in 96-01)
2. `fix(96-02): sanitize free-text interpolations in root-cause-tribunal prompt builders`
3. `fix(96-02): sanitize evidence interpolations in verification-tribunal prompt builders`
4. `fix(96-02): sanitize finding issue/suggestion interpolations in tribunal-rebuttals`
5. `fix(96-02): sanitize AI-generated text in pr-verdict-debate prompt builders`
6. `fix(96-02): add comprehensive tests for shared sanitizeForTemplate`
