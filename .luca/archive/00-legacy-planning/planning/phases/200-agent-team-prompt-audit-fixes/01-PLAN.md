---
phase: 200
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 200 Plan 1: phase-execute.skill.ts Prompt Audit Fixes

## Objective

Apply Fix 4 (code review team clarification) to phase-execute.skill.ts. This is the only remaining fix in this file -- research confirmed Fix 2 (recipients), Fix 6 (wave cap), and Fix 8 (gap-fix format) are already implemented.

> Appetite: Small (50K tokens remaining of 50K ceiling)

## Context

@src/skills/general/phase-execute.skill.ts
@.planning/phases/200-agent-team-prompt-audit-fixes/01-CONTEXT.md
@.planning/phases/200-agent-team-prompt-audit-fixes/01-PREMORTEM.md

## Pre-execution Verification

Before editing, confirm the research findings by reading these sections of phase-execute.skill.ts:

1. **Fix 2 (recipients):** Lines ~2013, ~2047, ~2079, ~2113 -- all 4 reviewer Task() prompts should already have `**Recipient:** phase-execute orchestrator`. If confirmed present, skip Fix 2 for this file.
2. **Fix 6 (wave cap):** Lines ~439-448 -- sub-wave splitting section should already exist with "max 5 plans" cap. If confirmed present, skip Fix 6.
3. **Fix 8 (gap-fix format):** Lines ~1804-1812 -- `<output_format>` block should already exist in gap-fix executor prompt. If confirmed present, skip Fix 8.

If any of the above are NOT present, apply the missing fix during Task 1.

## Tasks

### 1. Clarify security-auditor as conditional-only in team declarations (Fix 4)

**Type:** auto
**TDD:** false
**Depends on:** none

The code review team is already effectively 3 core + 1 conditional, but several locations list security-auditor alongside the core reviewers without distinguishing it. The multi-lens reviewers (architecture-lens, data-lens) are already properly gated. Fix 4 from the audit says "reduce to 3-4, drop ui, merge multi-lens into base reviewers." There is no ui reviewer. Multi-lens is already gated. The remaining work is clarifying security-auditor's conditional status in 4 locations:

**Edits to make:**

1. **Lines ~37-40 (sub-agent declarations):** security-auditor already says "(conditional)" -- verify this is clear. No change expected.

2. **Lines ~1976-1983 (model routing table):** Add a note that security-auditor is conditional-only, not spawned by default. Update the prose at line ~1974 to say "Always spawn the 3 core reviewers" instead of "ALL standard reviewers."

3. **Line ~2347 (REVIEW.md template):** The reviewer list currently shows `security-auditor{MULTI_LENS_GATE_MET...}` which implies security-auditor is always listed. Change to make security-auditor conditional in the template string, similar to how multi-lens is already conditional:

   ```
   **Reviewers:** dx-advocate, code-simplifier, code-architect{NEEDS_SECURITY ? ", security-auditor" : ""}{MULTI_LENS_GATE_MET ? ", architecture-lens, data-lens" : ""}
   ```

4. **Line ~2639 (success criteria):** Update from "Code review subagents spawned (dx-advocate, code-simplifier, code-architect, security-auditor)" to "Code review subagents spawned (dx-advocate, code-simplifier, code-architect; security-auditor if triggered)"

**Files to edit:**

- src/skills/general/phase-execute.skill.ts

**Verification:**

- Grep for "security-auditor" in the file -- every occurrence should either be in the conditional spawn block (lines ~1985-1989, ~2107-2139) or clearly marked as conditional
- The 3 core reviewers (dx-advocate, code-simplifier, code-architect) appear without qualification in team lists
- Type check passes: `bunx --bun tsc --noEmit`

## Verification

1. Grep for "security-auditor" in phase-execute.skill.ts -- all references should show conditional semantics
2. Grep for "ui" reviewer -- should find zero matches (confirm no stale ui references)
3. Run `bunx --bun tsc --noEmit` -- must pass
4. Confirm the 3 core reviewers are clearly distinguished from the conditional security-auditor

## Success Criteria

- security-auditor is clearly marked as conditional in all 4 reference locations
- No "ui" reviewer references exist
- Model routing table comment clarifies 3 core + 1 conditional
- REVIEW.md template only lists security-auditor when NEEDS_SECURITY is true
- Success criteria checklist reflects conditional status
- Type check passes

## Output Specification

- Modified: src/skills/general/phase-execute.skill.ts (4 targeted edits)
- SUMMARY.md in phase directory
