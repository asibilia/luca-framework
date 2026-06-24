---
id: PLAN-98-B
title: "Refactor Diagnostic Prompt Builders into Factory/Template Pattern"
phase: 98
wave: 1
depends_on: []
---

# PLAN-98-B: Refactor Diagnostic Prompt Builders into Factory/Template Pattern

## Objective

Refactor the 3 diagnostic prompt builders in `verification-tribunal.ts` (lines 137-249) that share ~80% identical structure into a factory function. The only differences between them are the role name, the role description sentence, and the 3 evaluation bullet points. Everything else (header, conflict info, category list, response format) is identical.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — MEDIUM DRY issue.

## Context

@file src/agents/\_\_helpers/verification-tribunal.ts — Contains the 3 prompt builders: `buildTestWriterDiagnosticPrompt` (line 137), `buildVerifierDiagnosticPrompt` (line 178), `buildIntegrationDiagnosticPrompt` (line 219).

The shared structure across all 3 prompts is:

```
You are diagnosing a conflict between test results (T1) and [goal-backward analysis / your own goal-backward analysis / goal-backward analysis] (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As {role}, {role_description}.

**Evaluate:**
1. {question_1}
2. {question_2}
3. {question_3}

**Categorize the root cause as ONE of:**
- `tests_incomplete`: Tests pass but don't cover the full goal specification
- `goal_over_specified`: The goal-backward analysis expects more than the plan intended
- `wiring_issue`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]
```

The 3 variants differ only in:

| Field     | Test Writer                                                                               | Verifier                                                                                  | Integration Checker                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Opening   | "...goal-backward analysis (T3)"                                                          | "...your own goal-backward analysis (T3)"                                                 | "...goal-backward analysis (T3)"                                                                       |
| Role      | "lu-test-writer"                                                                          | "lu-verifier"                                                                             | "lu-integration-checker"                                                                               |
| Role desc | "analyze whether the existing tests adequately cover the plan specification"              | "critically re-examine your T3 goal-backward analysis for this conflict"                  | "analyze whether cross-component wiring is the root cause of this conflict"                            |
| Q1        | "Do the passing tests actually verify the goal's intent, or just surface-level behavior?" | "Were the must-have truths appropriately scoped for the plan's actual objectives?"        | "Could unit tests pass while integration between components is broken?"                                |
| Q2        | "Are there specification requirements that have NO corresponding test?"                   | "Did the goal-backward analysis introduce requirements beyond what the plan specified?"   | "Are there import/export connections that exist on paper but fail at runtime?"                         |
| Q3        | "Could the tests be passing with stubs, mocks, or incomplete implementations?"            | "Is the T3 PARTIAL/FAIL status based on missing implementation or missing specification?" | "Is there a disconnect between what's tested (unit behavior) and what's needed (integrated behavior)?" |

## Tasks

### Task 1: Create the `DiagnosticPromptConfig` interface and factory function

**Goal:** Add a `buildDiagnosticPrompt()` factory function to `verification-tribunal.ts` that accepts a config object with the varying parts.

**File:** `src/agents/__helpers/verification-tribunal.ts`

**Add the following interface and factory function BEFORE the existing `buildTestWriterDiagnosticPrompt` function (before line 128):**

```typescript
/**
 * Configuration for a diagnostic prompt variant.
 *
 * Each tribunal perspective (test-writer, verifier, integration-checker)
 * provides its own config to customize the shared prompt template.
 */
interface DiagnosticPromptConfig {
  /** Opening description — how the T3 analysis is introduced */
  opening_qualifier: string;
  /** Agent role name (e.g., "lu-test-writer") */
  role: string;
  /** One-sentence description of the agent's diagnostic focus */
  role_description: string;
  /** Three evaluation questions specific to this perspective */
  questions: [string, string, string];
}

/**
 * Build a diagnostic prompt from a shared template and perspective-specific config.
 *
 * All three tribunal perspectives (test-writer, verifier, integration-checker)
 * share the same prompt structure. Only the opening qualifier, role description,
 * and evaluation questions differ. This factory produces the full prompt from
 * a ConflictSignal and a DiagnosticPromptConfig.
 *
 * @param conflict - The conflict signal to diagnose
 * @param config - Perspective-specific prompt configuration
 * @returns Complete diagnostic prompt string
 */
function buildDiagnosticPrompt(
  conflict: ConflictSignal,
  config: DiagnosticPromptConfig,
): string {
  return `You are diagnosing a conflict between test results (T1) and ${config.opening_qualifier} (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As ${config.role}, ${config.role_description}.

**Evaluate:**
1. ${config.questions[0]}
2. ${config.questions[1]}
3. ${config.questions[2]}

**Categorize the root cause as ONE of:**
- \`tests_incomplete\`: Tests pass but don't cover the full goal specification
- \`goal_over_specified\`: The goal-backward analysis expects more than the plan intended
- \`wiring_issue\`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]`;
}
```

**Verification:** The factory function compiles without errors.

### Task 2: Refactor `buildTestWriterDiagnosticPrompt` to use the factory

**Goal:** Replace the full prompt template in `buildTestWriterDiagnosticPrompt` with a call to `buildDiagnosticPrompt`.

**File:** `src/agents/__helpers/verification-tribunal.ts`

**Current (lines 137-167):**

```typescript
export function buildTestWriterDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return `You are diagnosing a conflict between test results (T1) and goal-backward analysis (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As lu-test-writer, analyze whether the existing tests adequately cover the plan specification.

**Evaluate:**
1. Do the passing tests actually verify the goal's intent, or just surface-level behavior?
2. Are there specification requirements that have NO corresponding test?
3. Could the tests be passing with stubs, mocks, or incomplete implementations?

**Categorize the root cause as ONE of:**
- \`tests_incomplete\`: Tests pass but don't cover the full goal specification
- \`goal_over_specified\`: The goal-backward analysis expects more than the plan intended
- \`wiring_issue\`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]`;
}
```

**Target:**

```typescript
export function buildTestWriterDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "goal-backward analysis",
    role: "lu-test-writer",
    role_description:
      "analyze whether the existing tests adequately cover the plan specification",
    questions: [
      "Do the passing tests actually verify the goal's intent, or just surface-level behavior?",
      "Are there specification requirements that have NO corresponding test?",
      "Could the tests be passing with stubs, mocks, or incomplete implementations?",
    ],
  });
}
```

**Verification:** Function signature unchanged; existing tests still pass.

### Task 3: Refactor `buildVerifierDiagnosticPrompt` to use the factory

**Goal:** Replace the full prompt template in `buildVerifierDiagnosticPrompt` with a call to `buildDiagnosticPrompt`.

**File:** `src/agents/__helpers/verification-tribunal.ts`

**Current (lines 178-208):**

```typescript
export function buildVerifierDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return `You are diagnosing a conflict between test results (T1) and your own goal-backward analysis (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As lu-verifier, critically re-examine your T3 goal-backward analysis for this conflict.

**Evaluate:**
1. Were the must-have truths appropriately scoped for the plan's actual objectives?
2. Did the goal-backward analysis introduce requirements beyond what the plan specified?
3. Is the T3 PARTIAL/FAIL status based on missing implementation or missing specification?

**Categorize the root cause as ONE of:**
- \`tests_incomplete\`: Tests pass but don't cover the full goal specification
- \`goal_over_specified\`: The goal-backward analysis expects more than the plan intended
- \`wiring_issue\`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]`;
}
```

**Target:**

```typescript
export function buildVerifierDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "your own goal-backward analysis",
    role: "lu-verifier",
    role_description:
      "critically re-examine your T3 goal-backward analysis for this conflict",
    questions: [
      "Were the must-have truths appropriately scoped for the plan's actual objectives?",
      "Did the goal-backward analysis introduce requirements beyond what the plan specified?",
      "Is the T3 PARTIAL/FAIL status based on missing implementation or missing specification?",
    ],
  });
}
```

**Verification:** Function signature unchanged; existing tests still pass.

### Task 4: Refactor `buildIntegrationDiagnosticPrompt` to use the factory

**Goal:** Replace the full prompt template in `buildIntegrationDiagnosticPrompt` with a call to `buildDiagnosticPrompt`.

**File:** `src/agents/__helpers/verification-tribunal.ts`

**Current (lines 219-249):**

```typescript
export function buildIntegrationDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return `You are diagnosing a conflict between test results (T1) and goal-backward analysis (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As lu-integration-checker, analyze whether cross-component wiring is the root cause of this conflict.

**Evaluate:**
1. Could unit tests pass while integration between components is broken?
2. Are there import/export connections that exist on paper but fail at runtime?
3. Is there a disconnect between what's tested (unit behavior) and what's needed (integrated behavior)?

**Categorize the root cause as ONE of:**
- \`tests_incomplete\`: Tests pass but don't cover the full goal specification
- \`goal_over_specified\`: The goal-backward analysis expects more than the plan intended
- \`wiring_issue\`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]`;
}
```

**Target:**

```typescript
export function buildIntegrationDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "goal-backward analysis",
    role: "lu-integration-checker",
    role_description:
      "analyze whether cross-component wiring is the root cause of this conflict",
    questions: [
      "Could unit tests pass while integration between components is broken?",
      "Are there import/export connections that exist on paper but fail at runtime?",
      "Is there a disconnect between what's tested (unit behavior) and what's needed (integrated behavior)?",
    ],
  });
}
```

**Verification:** Function signature unchanged; existing tests still pass.

## Success Criteria

- [ ] New `buildDiagnosticPrompt` factory function added to `verification-tribunal.ts`
- [ ] New `DiagnosticPromptConfig` interface defined in the same file
- [ ] All 3 public prompt builders delegate to the factory (no duplicated prompt template strings)
- [ ] Public API unchanged: `buildTestWriterDiagnosticPrompt`, `buildVerifierDiagnosticPrompt`, `buildIntegrationDiagnosticPrompt` still exported with same signatures
- [ ] Generated prompts are character-for-character identical to the original (no behavioral change)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify factory function exists
grep -n "function buildDiagnosticPrompt" src/agents/__helpers/verification-tribunal.ts && echo "PASS: factory exists" || echo "FAIL"

# Verify all 3 builders delegate to factory
grep -c "buildDiagnosticPrompt(conflict," src/agents/__helpers/verification-tribunal.ts | grep -q "3" && echo "PASS: all 3 delegate" || echo "FAIL"

# Verify no duplicate template blocks remain (the "Categorize the root cause" block should appear exactly once — in the factory)
grep -c "Categorize the root cause" src/agents/__helpers/verification-tribunal.ts | grep -q "1" && echo "PASS: single template" || echo "FAIL"

# Verify public exports unchanged
grep -n "export function build.*DiagnosticPrompt" src/agents/__helpers/verification-tribunal.ts | wc -l | grep -q "3" && echo "PASS: 3 public builders" || echo "FAIL"

# No regressions
bunx --bun tsc --noEmit
bun test
```
