# Phase 200: Agent Team Prompt Audit Fixes — Pre-Mortem Risk Brief

**Complexity:** SIMPLE | **Appetite:** Small (50K tokens, 40% context)

## Risk Scenarios

### 1. Inconsistent XML tag adoption across reviewer prompts

The 4 reviewer Task() blocks in phase-execute.skill.ts currently use flat markdown, while other skills already use XML blocks. Wrapping only some prompts in XML while leaving others flat creates a mixed dialect that may cause inconsistent LLM behavior.

**Mitigation:** Apply XML block restructuring to ALL Task() prompts in phase-execute.skill.ts in a single pass, including conditional security-auditor and multi-lens reviewer blocks.

### 2. Code review team reduction leaves stale references

Fix 4 reduces the default team to 3, but phase-execute.skill.ts has multiple downstream references to security-auditor (conditional spawn, YAML aggregation, verification checklist). Missing any reference causes silent result gaps.

**Mitigation:** Search for all occurrences of "security-auditor" in phase-execute.skill.ts and ensure conditional-only semantics are consistent across spawn, aggregation, and checklist sections.

### 3. Context budget exhaustion on large file

5 of 8 fixes target phase-execute.skill.ts (2700+ lines). Reading and editing 5 non-adjacent sections risks context exhaustion before reaching the remaining 4 files.

**Mitigation:** Plan wave ordering to address phase-execute.skill.ts in a single focused wave (one read, all edits), with the remaining 4 files in a second wave.

## Plan Constraints

- Apply XML restructuring atomically per file (one read, all edits, one write)
- Grep for each reviewer name after edits to verify no stale references
- Budget phase-execute.skill.ts as Wave 1 (~60% effort), remaining files as Wave 2
- Do NOT run `bun run build:all` (crashes Claude Code) — verify with `bunx --bun tsc --noEmit` only
