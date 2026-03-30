/**
 * phase-graduate Skill - Graduate verified research findings into
 * MuninnDB engrams for per-task recall during execution.
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const phaseGraduateConfig: SkillConfig = {
  frontmatter: {
    name: "phase-graduate",
    description:
      "Graduate verified research findings into MuninnDB engrams for per-task recall during execution.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Research Graduation

**Arguments:** \`<phase number>\`

## Prerequisites

- Research review status must be APPROVED (check REVIEW-LOG.md)
- If not approved, refuse to graduate and instruct user to run review first

## Process

### Step 1: Verify Review Status

\`\`\`
PADDED_PHASE=$(printf "%02d" $PHASE)
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* .planning/phases/$PHASE-* 2>/dev/null | head -1)
RESEARCH_DIR="$PHASE_DIR/research"

# Read REVIEW-LOG.md
Read $RESEARCH_DIR/REVIEW-LOG.md

# Check final status is APPROVED
# If status is not APPROVED:
#   Return error: "Research review not approved. Run /phase-research-review {phase} first."
\`\`\`

### Step 2: Resolve Vault Name

\`\`\`
# Read repo vault from config (primary)
VAULT=$(cat .planning/config.json | parse muninn.vault)
# Fallback: "luca-framework"
# NEVER use "default" for research:* engrams
\`\`\`

### Step 3: Spawn lu-research-graduator

\`\`\`
Task(subagent_type: "lu-research-graduator", prompt: "
  Graduate research findings for Phase {PHASE}.

  Research directory: $RESEARCH_DIR
  Vault: $VAULT (REPO vault, NOT default)
  Phase intent: {phase description from CONTEXT.md}

  Read all numbered research files in $RESEARCH_DIR (01-*.md through NN-*.md).
  Apply graduation scoring formula:
    score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
    threshold = 0.55

  Write engrams via muninn_remember_batch to vault: $VAULT
  Write GRADUATION-REPORT.md to $RESEARCH_DIR
  Archive research files to $RESEARCH_DIR/archive/
")
\`\`\`

### Step 4: Verify Graduation Output

After graduator completes:

\`\`\`
# Verify GRADUATION-REPORT.md exists
Read $RESEARCH_DIR/GRADUATION-REPORT.md

# Verify engrams were written to REPO vault (not default)
# Check report for vault field matching $VAULT

# Verify archive directory exists
Check $RESEARCH_DIR/archive/ contains numbered files

# Verify process artifacts remain in research/
Check REVIEW-LOG.md and GRADUATION-REPORT.md are still in $RESEARCH_DIR
\`\`\`

### Step 5: Return Structured Result

\`\`\`
## GRADUATION COMPLETE

**Phase:** {N} - {name}
**Engrams created:** {count}
**Vault:** {vault name}
**Concepts:** {list of research:* concepts}
**Filtered out:** {N} LOW confidence findings
**Archived:** {N} research files moved to archive/

## Research Refs for Planner

The planner should reference these concepts:
- {list of research:* concept names}

## Next Steps

/phase-plan {N} -- Create plans using graduated research context
\`\`\`

## Success Criteria

- [ ] Review status verified as APPROVED before graduating
- [ ] Graduator agent spawned with correct vault name
- [ ] HIGH/MEDIUM findings graduated to MuninnDB (repo vault)
- [ ] LOW confidence findings filtered (not graduated)
- [ ] GRADUATION-REPORT.md written with file-to-engram mapping
- [ ] Related engrams linked via muninn_link
- [ ] Research files archived to research/archive/ (Decision 24)
- [ ] Process artifacts (REVIEW-LOG.md, GRADUATION-REPORT.md) remain in research/
</main>`,
      order: 1,
    },
  ],
};

export const phaseGraduateSkill = createSkill(phaseGraduateConfig);
