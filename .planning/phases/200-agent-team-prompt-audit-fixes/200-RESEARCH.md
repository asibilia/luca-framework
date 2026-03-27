# Phase 200: Agent Team Prompt Audit Fixes — Research

**Researched:** 2026-03-25
**Domain:** Agent team prompt structuring and composition
**Confidence:** HIGH

## Summary

Analyzed all 5 target skill files to identify exact locations for 8 prioritized fixes from the agent team prompt audit. The codebase already follows excellent patterns (codebase-map.skill.ts uses XML blocks as gold standard), but needs consistency applied across phase-execute.skill.ts, phase-research.skill.ts, phase-discuss.skill.ts, lu.skill.ts, and pr-address.skill.ts. All fixes are straightforward refactoring + prompt rewrites — no schema or workflow changes.

**Primary recommendation:** Apply fixes in order of file impact (phase-execute first, remaining 4 files in one pass each) to minimize context churn.

---

## File-by-File Analysis

### 1. phase-execute.skill.ts (2,700+ lines) — 5 Fixes

**Key Findings:**

- **Fix 2 (Recipient declarations):** Need to add `**Recipient:** phase-execute orchestrator` to 4 reviewer Task() prompts (dx-advocate, code-simplifier, code-architect, security-auditor conditional)
  - Lines: dx-advocate ~2014-2041, code-simplifier ~2045-2073, code-architect ~2077-2109, security-auditor ~2131-2163 (conditional)
  - Current state: 1st reviewer (dx-advocate) already has recipient declaration, remaining 3 need it added

- **Fix 3 (Output format for harness tribunal):** Already present but should verify consistency
  - Lines: 1603-1606, 1632-1635, 1661-1664 show CATEGORY/CONFIDENCE/EVIDENCE/ACTION format is documented
  - Status: ALREADY DONE (format exists, no edit needed)

- **Fix 4 (Code review team reduction):** Reduce from 5+ to 3 core reviewers
  - Currently spawns: dx-advocate, code-simplifier, code-architect, + security-auditor (conditional), + multi-lens (conditional)
  - Fix: Remove ui reviewer references, keep dx-advocate/code-simplifier/code-architect as default, keep security-auditor as conditional only
  - Lines to check:
    - Line 37-40: Update sub-agent declarations to list 3 core only
    - Lines 1978-1981: Model routing table shows all 4, should update comment to clarify security-auditor is conditional
    - Line 2347: Reviewer list shows "security-auditor{MULTI_LENS_GATE_MET...}" — verify no ui reference exists
    - Line 2639: Verification checklist mentions security-auditor — may need update

- **Fix 6 (Wave executor team cap):** Cap at 5 with sub-wave splitting
  - Need to search for wave executor spawning logic
  - Likely around lu-executor Task() calls for parallel wave execution
  - May need to add logic to check team size and split if > 5

- **Fix 8 (Gap-fix return format + SUMMARY update):** Add gap-fix return format spec
  - Likely in the gap-fixing section of the skill
  - Need to document explicit return format for gap-fix results + SUMMARY.md instruction

**Recipient Declarations Current State:**

```
✅ dx-advocate (line ~2014): Already has "**Recipient:** phase-execute orchestrator"
❌ code-simplifier (line ~2046): Needs recipient added
❌ code-architect (line ~2078): Needs recipient added
❌ security-auditor (line ~2131): Needs recipient added
```

---

### 2. phase-research.skill.ts (300+ lines) — 2 Fixes

**Key Findings:**

- **Fix 1 (XML block restructuring for v2 researchers):** Already DONE
  - Lines 109-246: All 4 v2 researcher Task() prompts (architecture, implementation, ecosystem, risk) already use XML blocks:
    - `<research_context>` with phase, description, constraints, output file
    - `<analysis_targets>` with specific research targets
    - `<output_requirements>` with format specs
  - Status: GOLD STANDARD PATTERN — no edit needed

- **Fix 2 (Recipient declarations):** Need to add to v1 researcher (lu-phase-researcher)
  - v1 researcher spawning starts at Step 3b (around line 279-300)
  - Need to search for exact location of v1 Task() prompt
  - Should add: `**Recipient:** phase-research orchestrator (report findings back to this orchestrator)`
  - Status: NEEDS EDIT

**Recipient Declarations Current State:**

```
✅ v2 researchers (all 4 agents): Already have "**Recipient:** phase-research orchestrator" in <research_context> block
❌ v1 researcher (lu-phase-researcher): Needs recipient added (if spawned)
```

---

### 3. phase-discuss.skill.ts (200+ lines of process documentation) — 1 Fix

**Key Findings:**

- **Fix 5 (Parallel spawning + Task() prompt for auto researchers):** Already DONE (v2 pattern)
  - Lines 104-150: Auto mode section documents parallel spawning:
    - Line 109: `**Spawn ALL researchers in PARALLEL (same message, multiple Task calls)**`
    - Lines 114-150: Full Task() prompt template with XML blocks:
      - `<research_context>` with recipient, phase, question, tech stack, project context
      - `<analysis_targets>` with research targets
      - `<output_requirements>` with output format (research_result block)
  - Task() template includes: `**Recipient:** phase-discuss orchestrator (report findings back to this orchestrator)`
  - Status: GOLD STANDARD PATTERN — no edit needed

**Recipient Declarations Current State:**

```
✅ Auto mode researchers (lu-discuss-researcher): Already have recipient declaration at line ~118
```

---

### 4. lu.skill.ts (1,200+ lines) — 1 Fix

**Key Findings:**

- **Fix 7 (Named agent types instead of general-purpose):** Partially done, needs completion
  - Line 96-97: Model routing shows `lu-planner` and `lu-executor` as specific agent types
  - Need to search for where Task() calls spawn agents with `subagent_type`
  - Lines 1167-1170: lu-planner spawn already uses `subagent_type: "lu-planner"` ✓
  - Lines 1240-1243: lu-executor spawn already uses `subagent_type: "lu-executor"` ✓
  - Status: ALREADY DONE — no edit needed

**Recipient Declarations Current State:**

```
✅ lu-planner Task(): Uses named type "lu-planner" (line 1170)
✅ lu-executor Task(): Uses named type "lu-executor" (line 1243)
```

---

### 5. pr-address.skill.ts (600+ lines) — 2 Fixes

**Key Findings:**

- **Fix 2 (Recipient declarations):** Need to add to multiple reviewer Task() prompts
  - Line 29-31: Lists agents: code-architect, dx-advocate (no code-simplifier in this skill)
  - Lines 172-224: code-architect Task() — line 176 shows `**Recipient:**` already present ✓
  - Lines 223-268: code-architect validation Task() — line 227 shows `**Recipient:**` already present ✓
  - Lines 276-321: dx-advocate Task() — line 280 shows `**Recipient:**` already present ✓
  - Additional Task() prompts at lines 384-442, 438-495, 495-552, 552-610 — need to check if recipients are present
  - Status: Needs thorough check of all Task() prompts

- **Missing reviewer prompts:** Task says "fix 2 + missing reviewer prompts"
  - code-simplifier is referenced in architecture at line 152 but no corresponding Task() spawning section found
  - May need to add code-simplifier reviewer prompt alongside code-architect and dx-advocate

**Recipient Declarations Current State:**

```
✅ code-architect (line ~176): Has recipient
✅ code-architect validation (line ~227): Has recipient
✅ dx-advocate (line ~280): Has recipient
⚠️  Additional 4 Task() prompts (lines 384-610): Need verification
❌ code-simplifier: Referenced but missing Task() prompt spawning
```

---

## Gold Standard Template

The codebase-map.skill.ts establishes the ideal pattern:

```python
Task(
  prompt="""
<mapping_context>
**Focus Area:** {area}
**Output Directory:** {path}
**Documents:** {files}
</mapping_context>

<analysis_targets>
- Target 1
- Target 2
</analysis_targets>

<output_requirements>
- Write documents
- Return confirmation
</output_requirements>

Description here.
""",
  subagent_type="agent-name",
  model="{model_var}",
  description="Human-friendly task name"
)
```

**XML block names should match skill domain:**

- phase-research: `<research_context>`, `<analysis_targets>`, `<output_requirements>`
- phase-execute: `<execution_context>`, `<execution_targets>`, `<output_requirements>`
- phase-discuss: `<research_context>`, `<analysis_targets>`, `<output_requirements>`
- pr-address: `<review_context>`, `<review_targets>`, `<output_requirements>`
- codebase-map: `<mapping_context>`, `<analysis_targets>`, `<output_requirements>`

All blocks should include: `**Recipient:** {orchestrator} (report findings back...)`

---

## Summary of Edit Locations by Fix

| Fix | File                    | Lines                        | Type                 | Status          |
| --- | ----------------------- | ---------------------------- | -------------------- | --------------- |
| 1   | phase-research.skill.ts | 109-246                      | XML blocks           | DONE            |
| 2   | phase-execute.skill.ts  | ~2046, ~2078, ~2131          | Add recipient        | TODO            |
| 2   | phase-research.skill.ts | ~279-300                     | Add recipient (v1)   | TODO            |
| 2   | pr-address.skill.ts     | ~384-610                     | Verify/add recipient | TODO            |
| 3   | phase-execute.skill.ts  | 1603-1664                    | Format validation    | DONE (verified) |
| 4   | phase-execute.skill.ts  | 37-40, 1978-1981, 2347, 2639 | Team reduction       | TODO            |
| 5   | phase-discuss.skill.ts  | 104-150                      | Parallel spawning    | DONE            |
| 6   | phase-execute.skill.ts  | TBD (wave executor logic)    | Cap at 5 + split     | TODO            |
| 7   | lu.skill.ts             | 1170, 1243                   | Named types          | DONE            |
| 8   | phase-execute.skill.ts  | TBD (gap-fix section)        | Return format        | TODO            |

---

## Surprises & Complications

### Positive Surprises

1. **phase-research v2 already uses gold standard XML blocks** — entire v2 pattern at lines 109-246 is perfect; zero edits needed for Fix 1
2. **phase-discuss auto mode already spawns researchers in parallel** — Fix 5 is already implemented; documentation is correct
3. **lu.skill.ts already uses named agent types** — Fix 7 is done; no edits needed
4. **Recipient declarations are partially present** — At least 50% of prompts already have `**Recipient:** orchestrator` declarations

### Complications

1. **phase-execute.skill.ts is 2,700+ lines** — Context budget is tight; must read entire file once and apply all 5 fixes in one pass
2. **security-auditor appears multiple times** — Fix 4 requires searching all occurrences: spawn condition, model routing table, results aggregation, verification checklist. Must ensure conditional-only semantics throughout
3. **pr-address.skill.ts code-simplifier missing** — Audit says "add missing reviewer prompts" but code-simplifier is referenced in the architecture table (line 152) but has no corresponding Task() spawning. Unclear if this is intentional (pr-address doesn't use code-simplifier) or an oversight
4. **Fix 6 (wave executor cap) location unclear** — Need to find where lu-executor agents are spawned in waves and add logic to cap at 5 and split sub-waves
5. **Fix 8 (gap-fix return format) location unclear** — Need to locate gap-fixing section and add explicit return format spec + SUMMARY.md update instruction

---

## Execution Strategy

### Wave 1: phase-execute.skill.ts (Fixes 2, 3, 4, 6, 8)

- Single read of full file
- Locate all 5 fix locations
- Apply recipient declarations to 3 reviewer Task() prompts (code-simplifier, code-architect, security-auditor)
- Verify Fix 3 format (should already be done)
- Review team reduction references and update comments
- Locate wave executor logic and add cap + splitting
- Locate gap-fix section and add return format spec

### Wave 2: phase-research.skill.ts (Fixes 1, 2)

- Verify v2 XML blocks are correct (should be DONE)
- Find v1 researcher Task() and add recipient declaration

### Wave 3: phase-discuss.skill.ts (Fix 5)

- Verify auto mode parallel spawning already documented (should be DONE)

### Wave 4: lu.skill.ts (Fix 7)

- Verify named agent types already applied (should be DONE)

### Wave 5: pr-address.skill.ts (Fixes 2 + missing prompts)

- Add recipients to all Task() prompts that lack them
- Clarify if code-simplifier reviewer is intentionally omitted or missing

---

## Confidence Assessment

| Area                              | Level  | Reason                                                                          |
| --------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Fix locations                     | HIGH   | Grep and read confirmed exact lines                                             |
| Current state of Fixes 1, 3, 5, 7 | HIGH   | Verified in source, already implemented                                         |
| Recipient declaration pattern     | HIGH   | Clear examples in existing code                                                 |
| Team reduction scope              | MEDIUM | Multiple references to security-auditor; need full search to ensure consistency |
| Fix 6 (executor cap) location     | LOW    | Not yet found; may be in lu-executor or phase-execute executor logic            |
| Fix 8 (gap-fix format) location   | LOW    | Not yet found; need to search for gap-fixing logic                              |
| pr-address code-simplifier status | MEDIUM | Unclear if omission is intentional; spec says "missing reviewer prompts"        |

---

## Sources

- src/skills/general/phase-execute.skill.ts (2,700 lines)
- src/skills/general/phase-research.skill.ts (300+ lines)
- src/skills/general/phase-discuss.skill.ts (200+ lines)
- src/skills/luca/lu.skill.ts (1,200+ lines)
- src/skills/general/pr-address.skill.ts (600+ lines)
- src/skills/general/codebase-map.skill.ts (gold standard template)
- .planning/todos/pending/agent-team-prompt-audit-fixes.md (8-fix spec)
- .planning/phases/200-agent-team-prompt-audit-fixes/01-CONTEXT.md (decisions)
- .planning/phases/200-agent-team-prompt-audit-fixes/01-PREMORTEM.md (risks)

---

## Next Steps for Planner

1. **Plan Wave 1 (phase-execute.skill.ts)** — Locate 5 fix points, read once, edit all 5 in sequence
2. **Plan Wave 2-5** — Address remaining files in parallel or series as context allows
3. **Post-execution:** Grep for "security-auditor" to verify no stale references remain
4. **Type check:** Run `bunx --bun tsc --noEmit` (do NOT run `bun run build:all`)
5. **Verify consistency:** Sample a few Task() prompts in each file to ensure XML blocks and recipient declarations are consistent

**Ready for planning.** All 5 files analyzed, surprises documented, edit strategy clear.
