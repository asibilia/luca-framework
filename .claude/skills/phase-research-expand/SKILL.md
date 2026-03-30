# phase-research-expand

Deep expansion on specific research topics identified during review or by user request.

## main

<main>
# Research Expansion

**Arguments:** `<phase number> [--from-review] [--topics="topic1,topic2"]`

## Process

### Step 1: Load Expansion Context

```
PADDED_PHASE="$PHASE"
if echo "$PHASE" | grep -qE '^[0-9]+$'; then
  PADDED_PHASE=$(printf "%02d" "$PHASE")
fi
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* .planning/phases/$PHASE-* 2>/dev/null | head -1)
RESEARCH_DIR="$PHASE_DIR/research"

# Read existing research files
Read all files matching: $RESEARCH_DIR/[0-9]*.md

# If --from-review: Read REVIEW-LOG.md for gap identification
if --from-review:
    Read $RESEARCH_DIR/REVIEW-LOG.md
    Parse gaps from the latest iteration
fi

# If --topics: Use specified topics directly
if --topics:
    Parse comma-separated topic list
fi
```

### Step 2: Determine Expansion Scope

Parse review feedback for CRITICAL and IMPORTANT gaps (per Decision 3):

```
# Extract actionable gaps from REVIEW-LOG.md
expansion_targets = []
for gap in parsed_gaps:
    if gap.severity == "CRITICAL" or gap.severity == "IMPORTANT":
        expansion_targets.append({
            id: gap.id,
            severity: gap.severity,
            description: gap.description,
            source_reviewer: gap.prefix  # COMP, ACC, or ACT
        })

# Skip MINOR gaps -- they don't warrant expansion
```

**Gap-to-researcher mapping:**
- G-COMP-* gaps -> may need any researcher (depends on missing facet)
- G-ACC-* gaps -> typically need lu-implementation-researcher for verification
- G-ACT-* gaps -> typically need lu-implementation-researcher for code examples

### Step 3: Spawn Targeted Researchers

Only spawn researchers for gaps that need expansion (not all 4):

```
# Determine which researchers to spawn based on gap types
researchers_needed = determine_researchers(expansion_targets)

# Each researcher receives:
# 1. The original research file as context
# 2. Specific gap descriptions to address
# 3. The REVIEW-LOG.md feedback for that gap

for researcher in researchers_needed:
    Task(subagent_type: researcher.name, prompt: "Expand research on specific gaps.
    Phase intent: {phase_description}
    Existing research: {relevant research file}

    Gaps to address:
    {list of gaps assigned to this researcher}

    Review feedback:
    {relevant reviewer comments}

    Write your expanded findings to: {RESEARCH_DIR}/{next_number}-{topic}.md
    Start file numbering at 05 to avoid overwriting original research files.")
```

**File numbering (Decision 7):**
- Original research files: 01-04 (from initial research phase)
- Expansion files: 05+ (flat layout in same research/ directory)
- Format: `{NN}-{topic-kebab-case}.md`

### Step 4: Return Structured Result

```
## EXPANSION COMPLETE
**Phase:** {N}
**Topics expanded:** {list}
**Files created:** {list}
**Remaining gaps:** {list or "none"}
```

## Researcher Selection Heuristic

| Gap Source | Primary Researcher | Reason |
|------------|-------------------|--------|
| G-COMP-* (missing architecture) | lu-architecture-researcher | Architecture facet gap |
| G-COMP-* (missing ecosystem) | lu-ecosystem-researcher | Ecosystem facet gap |
| G-COMP-* (missing implementation) | lu-implementation-researcher | Implementation facet gap |
| G-COMP-* (missing risk) | lu-risk-researcher | Risk facet gap |
| G-ACC-* (unverified claims) | lu-implementation-researcher | Needs live verification |
| G-ACC-* (outdated versions) | lu-ecosystem-researcher | Needs current ecosystem check |
| G-ACT-* (missing code examples) | lu-implementation-researcher | Needs concrete code |
| G-ACT-* (vague recommendations) | lu-architecture-researcher | Needs specific patterns |

## Success Criteria

- [ ] Expansion targets derived from REVIEW-LOG.md gaps (when --from-review)
- [ ] Only CRITICAL and IMPORTANT gaps trigger expansion (MINOR skipped)
- [ ] Targeted researchers spawned (not all 4 blindly)
- [ ] Expansion files numbered from 05+ in flat research/ directory
- [ ] Structured result returned with files created and remaining gaps
</main>