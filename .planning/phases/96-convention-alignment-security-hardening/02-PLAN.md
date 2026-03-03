---
id: 96-B
title: "Add sanitizeForTemplate() to tribunal prompt construction for prompt injection hardening"
phase: 96
wave: 1
complexity: MODERATE
todo: 96-B
---

# 96-B: Add `sanitizeForTemplate()` to Tribunal Prompt Construction

## Objective

Close prompt injection gaps in all tribunal/debate prompt-building functions by sanitizing AI-generated free-text fields before they are interpolated into prompt template literals. The `sanitizeForTemplate()` function already exists in `src/hooks/pi-extensions/__helpers/sanitize.ts` (T3), but T2 (agents, skills) and T0 (shared) cannot import from T3. This plan first adds `sanitizeForTemplate` to `src/shared/` (T0), then applies it across all prompt construction sites.

## Context

@src/hooks/pi-extensions/**helpers/sanitize.ts — lines 65-71: canonical `sanitizeForTemplate()` implementation (T3, not importable by T0-T2)
@src/agents/**helpers/root-cause-tribunal.ts — lines 119-233: three prompt builders interpolate `fixSignal.root_cause`, `fixSignal.proposed_fix`, `fixSignal.evidence_summary` (AI-generated free text)
@src/agents/**helpers/verification-tribunal.ts — lines 136-248: three prompt builders interpolate `conflict.t1_evidence`, `conflict.t3_evidence` (AI-generated free text)
@src/shared/**helpers/tribunal-rebuttals.ts — lines 112-170: two prompt builders interpolate `finding.issue`, `finding.suggestion` (AI-generated free text)
@src/skills/\_\_helpers/pr-verdict-debate.ts — lines 126-208: two prompt builders interpolate `split.comment_text` (AI-generated free text)
@src/shared/index.ts — barrel for shared domain (add new export)
@.claude/rules/module-boundary.md — tier import rules (T0 shared cannot import T3 hooks)

## Tasks

### Task 1: Add `sanitizeForTemplate` to `src/shared/__helpers/`

**Goal:** Create a `sanitizeForTemplate` function in the shared domain (T0) so all tiers can import it.

**Files:** `src/shared/__helpers/sanitize-template.ts` (new), `src/shared/index.ts`

**Steps:**

1. Create `src/shared/__helpers/sanitize-template.ts` with the same implementation as the hooks version:

   ````typescript
   /**
    * Strip template injection characters from strings before prompt interpolation.
    *
    * Removes backticks, ${...} sequences, newlines, and control characters
    * to prevent prompt injection via AI-generated free-text fields.
    *
    * @param str - The raw string to sanitize
    * @returns A string safe for template literal interpolation
    *
    * @example
    * ```typescript
    * sanitizeForTemplate("hello `world` ${injected}") // "hello world injected}"
    * sanitizeForTemplate("line1\nline2") // "line1 line2"
    * ```
    */
   export function sanitizeForTemplate(str: string): string {
     return str
       .replace(/`/g, "")
       .replace(/\$\{/g, "")
       .replace(/[\n\r]/g, " ")
       .replace(/[\x00-\x1f\x7f]/g, "");
   }
   ````

2. Add export to `src/shared/index.ts` barrel:

   ```typescript
   // ─── Template Sanitization ────────────────────────────────────────────────────

   export { sanitizeForTemplate } from "./__helpers/sanitize-template";
   ```

3. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] File exists at `src/shared/__helpers/sanitize-template.ts`
- [ ] File imports nothing from other src/ domains (pure function, T0 compliant)
- [ ] `sanitizeForTemplate` exported from `src/shared/index.ts`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Apply `sanitizeForTemplate` to `root-cause-tribunal.ts`

**Goal:** Sanitize all AI-generated free-text fields in the three prompt builders.

**Files:** `src/agents/__helpers/root-cause-tribunal.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
   ```

2. In `buildDebuggerDefensePrompt` (line 119), sanitize interpolated fields:
   - `${fixSignal.root_cause}` → `${sanitizeForTemplate(fixSignal.root_cause)}`
   - `${fixSignal.proposed_fix}` → `${sanitizeForTemplate(fixSignal.proposed_fix)}`
   - `${fixSignal.evidence_summary}` → `${sanitizeForTemplate(fixSignal.evidence_summary)}`
   - `${fixSignal.files_changed.join(", ")}` is safe (file paths, not free text) — no change

3. In `buildVerifierChallengePrompt` (line 163), sanitize the same fields:
   - `${fixSignal.root_cause}` → `${sanitizeForTemplate(fixSignal.root_cause)}`
   - `${fixSignal.proposed_fix}` → `${sanitizeForTemplate(fixSignal.proposed_fix)}`
   - `${fixSignal.evidence_summary}` → `${sanitizeForTemplate(fixSignal.evidence_summary)}`

4. In `buildArbiterPrompt` (line 208), sanitize the same fields:
   - `${fixSignal.root_cause}` → `${sanitizeForTemplate(fixSignal.root_cause)}`
   - `${fixSignal.proposed_fix}` → `${sanitizeForTemplate(fixSignal.proposed_fix)}`
   - `${fixSignal.evidence_summary}` → `${sanitizeForTemplate(fixSignal.evidence_summary)}`

5. Run `bunx --bun tsc --noEmit`.

**Total call sites:** 9 (3 fields x 3 functions)

**Verification:**

- [ ] All 9 free-text interpolation sites wrapped with `sanitizeForTemplate()`
- [ ] `files_changed.join()` NOT wrapped (safe data)
- [ ] Import added from `~/shared/__helpers/sanitize-template`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Apply `sanitizeForTemplate` to `verification-tribunal.ts`

**Goal:** Sanitize AI-generated evidence fields in the three diagnostic prompt builders.

**Files:** `src/agents/__helpers/verification-tribunal.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
   ```

2. In `buildTestWriterDiagnosticPrompt` (line 136), sanitize:
   - `${conflict.t1_evidence}` → `${sanitizeForTemplate(conflict.t1_evidence)}`
   - `${conflict.t3_evidence}` → `${sanitizeForTemplate(conflict.t3_evidence)}`
   - `${conflict.conflict_type}`, `${conflict.t1_status}`, `${conflict.t3_status}` are enum/constrained values — no change

3. In `buildVerifierDiagnosticPrompt` (line 177), sanitize:
   - `${conflict.t1_evidence}` → `${sanitizeForTemplate(conflict.t1_evidence)}`
   - `${conflict.t3_evidence}` → `${sanitizeForTemplate(conflict.t3_evidence)}`

4. In `buildIntegrationDiagnosticPrompt` (line 218), sanitize:
   - `${conflict.t1_evidence}` → `${sanitizeForTemplate(conflict.t1_evidence)}`
   - `${conflict.t3_evidence}` → `${sanitizeForTemplate(conflict.t3_evidence)}`

5. Run `bunx --bun tsc --noEmit`.

**Total call sites:** 6 (2 fields x 3 functions)

**Verification:**

- [ ] All 6 free-text interpolation sites wrapped with `sanitizeForTemplate()`
- [ ] Enum/status fields NOT wrapped (constrained values)
- [ ] Import added from `~/shared/__helpers/sanitize-template`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Apply `sanitizeForTemplate` to `tribunal-rebuttals.ts`

**Goal:** Sanitize AI-generated `issue` and `suggestion` fields in the challenger and defender prompt builders.

**Files:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Steps:**

1. Add import at top of file (relative import since it is in the same domain):

   ```typescript
   import { sanitizeForTemplate } from "./sanitize-template";
   ```

2. In `buildChallengerPrompt` (line 112), sanitize:
   - `${defendedFinding.issue}` → `${sanitizeForTemplate(defendedFinding.issue)}`
   - `${defendedFinding.suggestion}` → `${sanitizeForTemplate(defendedFinding.suggestion)}`
   - `${challengerFinding.issue}` → `${sanitizeForTemplate(challengerFinding.issue)}`
   - `${challengerFinding.suggestion}` → `${sanitizeForTemplate(challengerFinding.suggestion)}`
   - `${defendedFinding.file}`, `${defendedFinding.severity}`, `${defendedFinding.source_agent}` are structured data — no change

3. In `buildDefenderPrompt` (line 143), sanitize:
   - `${defendedFinding.issue}` → `${sanitizeForTemplate(defendedFinding.issue)}`
   - `${defendedFinding.suggestion}` → `${sanitizeForTemplate(defendedFinding.suggestion)}`
   - `${challengerFinding.issue}` → `${sanitizeForTemplate(challengerFinding.issue)}`
   - `${challengerFinding.suggestion}` → `${sanitizeForTemplate(challengerFinding.suggestion)}`

4. Run `bunx --bun tsc --noEmit`.

**Total call sites:** 8 (4 fields x 2 functions)

**Verification:**

- [ ] All 8 free-text interpolation sites wrapped with `sanitizeForTemplate()`
- [ ] File path, severity, agent name fields NOT wrapped
- [ ] Import added from `./sanitize-template` (same domain)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Apply `sanitizeForTemplate` to `pr-verdict-debate.ts`

**Goal:** Sanitize the `comment_text` field in dissenter and majority response prompt builders.

**Files:** `src/skills/__helpers/pr-verdict-debate.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
   ```

2. In `buildDissenterPrompt` (line 126), sanitize:
   - `${split.comment_text}` (line 152) → `${sanitizeForTemplate(split.comment_text)}`
   - The `v.agent` and `v.reasoning` in the map calls (lines 145, 148) — `v.reasoning` is AI-generated free text, sanitize it: `${v.agent}: ${sanitizeForTemplate(v.reasoning)}`

3. In `buildMajorityResponsePrompt` (line 184), sanitize:
   - `${split.comment_text}` (line 196) → `${sanitizeForTemplate(split.comment_text)}`
   - `${dissenterArgument}` (line 199) → `${sanitizeForTemplate(dissenterArgument)}`

4. Run `bunx --bun tsc --noEmit`.

**Total call sites:** 5 (2 in dissenter prompt for comment_text and reasoning map, 3 in majority prompt for comment_text, dissenterArgument)

**Verification:**

- [ ] All free-text interpolation sites wrapped with `sanitizeForTemplate()`
- [ ] Agent names and count values NOT wrapped
- [ ] Import added from `~/shared/__helpers/sanitize-template`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 6: Write test for shared `sanitizeForTemplate`

**Goal:** Add a test covering the shared version of `sanitizeForTemplate`.

**Files:** `__tests__/src/shared/sanitize-template.test.ts` (new)

**Steps:**

1. Create the test file:

   ```typescript
   import { describe, test, expect } from "bun:test";
   import { sanitizeForTemplate } from "../../../src/shared/__helpers/sanitize-template";

   describe("sanitizeForTemplate", () => {
     test("strips backticks", () => {
       expect(sanitizeForTemplate("hello `world`")).toBe("hello world");
     });

     test("strips template injection sequences", () => {
       expect(sanitizeForTemplate("value ${injected}")).toBe("value injected}");
     });

     test("replaces newlines with spaces", () => {
       expect(sanitizeForTemplate("line1\nline2\rline3")).toBe(
         "line1 line2 line3",
       );
     });

     test("strips control characters", () => {
       expect(sanitizeForTemplate("a\x00b\x1fc\x7fd")).toBe("abcd");
     });

     test("passes through normal text unchanged", () => {
       expect(sanitizeForTemplate("normal text")).toBe("normal text");
     });

     test("handles empty string", () => {
       expect(sanitizeForTemplate("")).toBe("");
     });

     test("handles combined injection patterns", () => {
       expect(sanitizeForTemplate("`${process.exit(1)}`\n\x00")).toBe(
         "process.exit(1)} ",
       );
     });
   });
   ```

2. Run `bun test __tests__/src/shared/sanitize-template.test.ts`.

**Verification:**

- [ ] All 7 test cases pass
- [ ] Test file follows project naming convention (kebab-case)

### Task 7: Final validation

**Goal:** Run full verification to confirm no regressions.

**Steps:**

1. Run `bunx --bun tsc --noEmit` — full type check.
2. Run `bun test` — full test suite.
3. Verify all prompt builder functions now sanitize free-text inputs.
4. Grep for unsanitized prompt interpolation patterns in modified files to confirm completeness.

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (pre-existing failures acceptable)
- [ ] All 4 tribunal/debate files have `sanitizeForTemplate` imports
- [ ] Total of ~28 call sites sanitized across 10 prompt builder functions

## Success Criteria

- [ ] `sanitizeForTemplate` available at T0 (shared) for all tiers to import
- [ ] All AI-generated free-text fields sanitized before prompt interpolation
- [ ] No prompt injection vectors remain in tribunal/debate prompt builders
- [ ] Structured data (file paths, severity enums, agent names) NOT over-sanitized
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] New test file validates `sanitizeForTemplate` behavior
