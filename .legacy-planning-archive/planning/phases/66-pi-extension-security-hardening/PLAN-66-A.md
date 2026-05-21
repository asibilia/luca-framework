---
id: PLAN-66-A
title: "Document execSync Security Model"
phase: 66
wave: 1
depends_on: []
---

# PLAN-66-A: Document execSync Security Model

## Objective

Document the accepted risk model for `execSync` usage in Pi extensions. Two CRITICAL audit findings (from `.planning/v2.1.0-MILESTONE-AUDIT.md`) identified command injection vectors in `luca-harness.ts` (L88) and `luca-tilldone.ts` (L50). These are design-inherent — the tools exist to run user-specified commands (verification loops, harness checks). The risk is mitigated by Pi's permission model which requires explicit user approval for every tool execution.

This plan creates formal documentation of the defense-in-depth model and adds `@security` JSDoc annotations to the affected call sites so future audits immediately see the risk assessment.

## Context

@file src/hooks/pi-extensions/luca-harness.ts — `runCheck()` at L76-118 passes `command` string from config to `execSync` (L88). The command originates from `.planning/config.json` harness checks or from the `params.checks` tool parameter which filters pre-defined checks by name, not by arbitrary command.

@file src/hooks/pi-extensions/luca-tilldone.ts — `runCommand()` at L40-69 passes `command` string from `params.command` tool parameter directly to `execSync` (L50). This is the more exposed vector: the LLM provides arbitrary shell commands via the `luca_tilldone` tool.

@file .planning/v2.1.0-MILESTONE-AUDIT.md — Source audit documenting these findings as CRITICAL with the note: "The risk is mitigated by Pi's own permission model which requires user approval for tool execution."

## Tasks

### Task 1: Create SECURITY-MODEL.md in .pi/

**Goal:** Establish a formal security model document that explains the defense-in-depth approach for Pi extensions that execute shell commands.

**Files:** Create `.pi/SECURITY-MODEL.md`

**Content should cover:**

- Overview of the Pi extension security boundary
- The three defense layers:
  1. **Pi Permission Layer** — Pi requires user confirmation before any tool execution. The user sees the tool name, parameters, and must explicitly approve. This is the primary control.
  2. **Input Validation Layer** — Extensions validate inputs where feasible (allowlisted check names in harness, timeout bounds, output truncation). Phase 66-B will strengthen this layer.
  3. **Blast Radius Limitation** — Commands run with the same permissions as the user's shell session (no privilege escalation). Output is truncated. Timeouts prevent runaway processes.
- Specific risk assessments for `luca-harness.ts` and `luca-tilldone.ts`
- The `luca-harness.ts` case: commands come from `.planning/config.json` (developer-controlled config file, not LLM-generated), and the `checks` parameter only filters by name against pre-defined commands — it does not accept arbitrary commands
- The `luca-tilldone.ts` case: commands are LLM-provided and arbitrary by design (the tool's purpose is to run commands in a retry loop). Pi's permission layer is the primary control. The user sees and approves each command.
- Comparison table: what is sanitized vs. what relies on Pi's permission model
- Reference to Phase 66-B (input sanitization) and Phase 66-C (normalization guards) as complementary hardening

**Verification:** `.pi/SECURITY-MODEL.md` exists and covers all three defense layers, both CRITICAL call sites, and references the audit findings.

### Task 2: Add @security JSDoc to luca-harness.ts runCheck()

**Goal:** Annotate the `execSync` call site in `luca-harness.ts` with a `@security` JSDoc tag so the accepted risk is visible in-code.

**Files:** `src/hooks/pi-extensions/luca-harness.ts`

**Changes:**

- Add `@security` tag to the `runCheck` function JSDoc (L73-75) explaining:
  - The `command` parameter originates from `.planning/config.json` (developer-controlled)
  - The `luca_verify` tool's `checks` parameter only filters by name, not arbitrary commands
  - Pi's permission layer requires user approval before execution
  - Risk classification: CRITICAL (accepted) — see `.pi/SECURITY-MODEL.md`

**Verification:** JSDoc on `runCheck` contains `@security` tag with risk classification and mitigation reference.

### Task 3: Add @security JSDoc to luca-tilldone.ts runCommand()

**Goal:** Annotate the `execSync` call site in `luca-tilldone.ts` with a `@security` JSDoc tag.

**Files:** `src/hooks/pi-extensions/luca-tilldone.ts`

**Changes:**

- Add `@security` tag to the `runCommand` function JSDoc (L37-39) explaining:
  - The `command` parameter is LLM-provided and arbitrary by design
  - Pi's permission layer is the primary mitigation — user must approve each invocation
  - Output is truncated to `MAX_OUTPUT_LENGTH` (1500 chars) to limit data exfiltration
  - Timeout prevents runaway processes
  - Risk classification: CRITICAL (accepted) — see `.pi/SECURITY-MODEL.md`

**Verification:** JSDoc on `runCommand` contains `@security` tag with risk classification and mitigation reference.

### Task 4: Add security note to module-level JSDoc in both files

**Goal:** Make the security posture visible at the module level, not just on individual functions.

**Files:** `src/hooks/pi-extensions/luca-harness.ts`, `src/hooks/pi-extensions/luca-tilldone.ts`

**Changes:**

- Add a `@security` section to the module-level JSDoc comment (top of each file) noting:
  - This extension executes shell commands via `execSync`
  - Primary mitigation: Pi permission layer (user approval required)
  - Full security model documented in `.pi/SECURITY-MODEL.md`

**Verification:** Both files have module-level `@security` annotations referencing the security model.

## Success Criteria

- [ ] `.pi/SECURITY-MODEL.md` exists with complete defense-in-depth documentation
- [ ] `luca-harness.ts` `runCheck()` has `@security` JSDoc tag
- [ ] `luca-tilldone.ts` `runCommand()` has `@security` JSDoc tag
- [ ] Both files have module-level `@security` annotations
- [ ] No functional code changes (documentation-only plan)
- [ ] `bun test` still passes (no regressions from JSDoc changes)
- [ ] `bunx --bun tsc --noEmit` still passes

## Verification

```bash
# Verify SECURITY-MODEL.md exists
test -f .pi/SECURITY-MODEL.md && echo "PASS: SECURITY-MODEL.md exists"

# Verify @security tags in source
grep -c "@security" src/hooks/pi-extensions/luca-harness.ts    # Expect >= 2
grep -c "@security" src/hooks/pi-extensions/luca-tilldone.ts   # Expect >= 2

# No regressions
bun test
bunx --bun tsc --noEmit

# Regenerate .pi/ outputs from source changes
bun run build:all --force
```
