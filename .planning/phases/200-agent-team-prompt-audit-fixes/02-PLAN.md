---
phase: 200
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 200 Plan 2: phase-research.skill.ts v1 Researcher Task Template

## Objective

Add a complete Task() prompt template for the v1 single-agent researcher path in phase-research.skill.ts. Currently the v1 path (Step 3b, line ~280) only provides instructional text ("Use lu-phase-researcher agent via Task() with **Recipient:**...") without a full prompt template. The v2 path (lines 109-246) has complete Task() templates with XML blocks and recipient declarations -- the v1 path should match this quality level.

> Appetite: Small (tokens remaining after Wave 1)

## Context

@src/skills/general/phase-research.skill.ts
@.planning/phases/200-agent-team-prompt-audit-fixes/200-RESEARCH.md

## Tasks

### 1. Add v1 researcher Task() prompt template with recipient and XML blocks

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the single-line instruction at Step 3b (line ~280) with a full Task() prompt template that follows the v2 gold standard pattern. The template should include:

- `<research_context>` XML block with recipient declaration, phase info, domain focus
- `<analysis_targets>` XML block with research focus areas
- `<output_requirements>` XML block with output format spec (RESEARCH.md structure)
- `subagent_type="lu-phase-researcher"`

**Current (line ~280):**

```
   - Use lu-phase-researcher agent via Task() with `**Recipient:** phase-research orchestrator`
   - Focus on ecosystem knowledge for the domain
```

**Replace with a complete Task() template modeled after the v2 pattern (lines 109-140), adapted for single-agent research:**

```python
Task(
  prompt="""
<research_context>

**Recipient:** phase-research orchestrator (report findings back to this orchestrator)

**Phase:** {phase_number}
**Phase Description:** {phase_description}
**Domain:** {domain}
**Constraints:** {constraints_from_context_md}
**Output File:** {phase_dir}/{phase}-RESEARCH.md

</research_context>

<analysis_targets>
- Ecosystem knowledge for the domain (libraries, tools, APIs)
- Recommended stack and architecture patterns
- Common pitfalls and prevention strategies
- Integration considerations with existing codebase
</analysis_targets>

<output_requirements>
- Write findings to the output file specified above
- Structure as: Summary, Stack Recommendations, Architecture Patterns, Pitfalls, Integration Notes
- Include specific version numbers for recommended dependencies
- Return confirmation when complete
</output_requirements>

Research the domain and write your findings to the output file.
""",
  subagent_type="lu-phase-researcher",
  model="{researcher_model}",
  description="Research {domain} for Phase {phase_number}"
)
```

**Files to edit:**

- src/skills/general/phase-research.skill.ts

**Verification:**

- The v1 Task() template includes `**Recipient:** phase-research orchestrator`
- XML blocks follow the v2 naming convention: `<research_context>`, `<analysis_targets>`, `<output_requirements>`
- `subagent_type="lu-phase-researcher"` is specified
- Type check passes: `bunx --bun tsc --noEmit`

## Verification

1. Read phase-research.skill.ts Step 3b section -- should now contain a full Task() prompt template
2. Grep for "Recipient" in the file -- should appear in v1 template (new) and all 4 v2 templates (existing)
3. Run `bunx --bun tsc --noEmit` -- must pass

## Success Criteria

- v1 researcher path has a complete Task() prompt template with XML blocks
- Recipient declaration present in v1 template
- Output format matches the RESEARCH.md structure described in Step 3b point 3
- No changes to v2 path (already gold standard)
- Type check passes

## Output Specification

- Modified: src/skills/general/phase-research.skill.ts (1 targeted edit in Step 3b)
- SUMMARY.md in phase directory
