# Learning Capture Workflow

This workflow is executed by `lu-learner` agent after verification completes. It extracts validated insights and updates long-term memory.

## Purpose

- Extract learnings from WORKING.md session
- Categorize into patterns, decisions, pitfalls
- Write curated entries to MEMORY.md
- Clear WORKING.md for next session

## When This Runs

- After `lu-verifier` completes (pass or fail)
- At `/lu-complete-milestone` for final consolidation
- When `/lu` workflow completes

## Process

### Step 1: Load Working Memory

```bash
cat .planning/WORKING.md 2>/dev/null
```

**Parse sections:**

- Session info (what workflow ran)
- Memory recall (what was loaded)
- Immediate findings (discoveries)
- Hypotheses (for debugging)
- Session log (actions taken)
- Pre-learning extraction (candidate insights)

### Step 2: Load Existing Memory

```bash
cat .planning/MEMORY.md 2>/dev/null
```

**Build deduplication index:**

- Existing pattern names/descriptions
- Decision titles
- Pitfall names

If MEMORY.md doesn't exist, create from template:

```bash
cp .cursor/origin/templates/MEMORY.md .planning/MEMORY.md
```

### Step 3: Extract Pattern Candidates

**Sources in WORKING.md:**

1. "Candidate Patterns" section (pre-flagged)
2. "Immediate Findings" (approach validations)
3. Session log ("this worked" type notes)

**Extraction criteria:**

| Criterion | Include If | Exclude If |
|-----------|------------|------------|
| Validated | Verification passed | Verification failed |
| Replicable | Could use again | One-time thing |
| Non-obvious | Project-specific insight | Standard practice |
| Not duplicate | New to MEMORY.md | Already documented |

**Format approved patterns:**

```markdown
#### [Pattern Name]
- **Pattern**: [Description of the approach]
- **When to use**: [Context where this applies]
- **Example**: [Code snippet or file reference]
- **Confidence**: Low (first validation)
- **Added**: [Date]
```

### Step 4: Extract Decision Candidates

**Sources in WORKING.md:**

1. "Candidate Decisions" section (pre-flagged)
2. Choice/selection language in findings
3. Decision points in session log

**Extraction criteria:**

| Criterion | Include If | Exclude If |
|-----------|------------|------------|
| Real choice | Multiple options existed | Only one option |
| Rationale worth keeping | Why matters | Obvious choice |
| Constrains future | Affects later work | Isolated decision |

**Format approved decisions:**

```markdown
### [Date] - [Decision Title]

- **Context**: [What prompted this decision]
- **Options Considered**: 
  - Option A: [Description]
  - Option B: [Description]
- **Choice**: [What was decided]
- **Rationale**: [Why]
- **Status**: Active
- **Reference**: [PR/file if applicable]
```

### Step 5: Extract Pitfall Candidates

**Sources in WORKING.md:**

1. "Candidate Pitfalls" section (pre-flagged)
2. Error/issue/problem notes in findings
3. Hypotheses section (especially rejected ones)
4. "Didn't work" type notes

**Extraction criteria (LOW BAR - capture more):**

| Criterion | Include If | Exclude If |
|-----------|------------|------------|
| Root cause known | Why it happened | Mystery issue |
| Preventable | Can avoid in future | Random/environmental |
| Relevant again | Likely to recur | Truly one-time |
| Not duplicate | New to MEMORY.md | Already documented |

**Format approved pitfalls:**

```markdown
### [Pitfall Name]

- **What happened**: [Description]
- **Root cause**: [Why it happened]
- **How to avoid**: [Prevention steps]
- **Severity**: [High/Medium/Low]
- **Reference**: [PR/file if applicable]
- **Added**: [Date]
```

### Step 6: Update Confidence Levels

For patterns/pitfalls matching existing entries:

```
IF validated again:
  Bump confidence: Low → Medium → High
  Add note: "Validated again on [date]"

IF invalidated:
  Update status: "Under Review"
  Add note: "Failed validation on [date]"

IF modified:
  Update with new context
  Add note: "Updated on [date]"
```

**Confidence levels:**

| Level | Meaning | Validations |
|-------|---------|-------------|
| Low | First occurrence | 1 |
| Medium | Multiple occurrences | 2-3 |
| High | Established pattern | 4+ |

### Step 7: Write to MEMORY.md

Append new entries to appropriate sections:

```bash
# Patterns go under ## Patterns
# Decisions go under ## Decisions
# Pitfalls go under ## Pitfalls
```

Update statistics at bottom:

```markdown
*Memory Statistics*
- Total patterns: {N}
- Total decisions: {N}
- Total pitfalls: {N}
- Last updated: [timestamp]
```

### Step 8: Clear Working Memory

Update WORKING.md status:

```markdown
*Session Status*
- [ ] Active
- [x] Learnings extracted
- [x] Ready to clear
```

Then reset for next session:

```markdown
# Working Memory

> Session-specific memory. Initialized by lu-cognition at workflow start.

*Status: Cleared after learning extraction*
*Last session: [timestamp]*
*Learnings extracted: [N] patterns, [N] decisions, [N] pitfalls*
```

### Step 9: Output Summary

```markdown
## LEARNING EXTRACTION COMPLETE

### Session Summary
- **Workflow**: {workflow name}
- **Duration**: {session duration}
- **Verification**: {passed/failed}

### Extracted to MEMORY.md

**Patterns ({N} new, {N} updated):**
{List of pattern names}

**Decisions ({N} new):**
{List of decision titles}

**Pitfalls ({N} new):**
{List of pitfall names}

### Confidence Updates
{Any existing entries that got bumps}

### Working Memory
- Status: Cleared
- Ready for next session

### Memory Statistics
- Total patterns: {N}
- Total decisions: {N}
- Total pitfalls: {N}
```

## Edge Cases

### No MEMORY.md Exists

Create from template before writing:

```bash
cp .cursor/origin/templates/MEMORY.md .planning/MEMORY.md
```

### Empty WORKING.md

```markdown
## LEARNING EXTRACTION COMPLETE

### Status
No new learnings to extract from this session.

### Working Memory
Cleared. Ready for next session.
```

### Verification Failed

Still extract learnings, but with different focus:

- **Skip patterns** (not validated)
- **Extract pitfalls** (what went wrong)
- **Note decisions** that led to failure
- **Flag for review** in next session

## Success Criteria

- [ ] WORKING.md loaded and parsed
- [ ] MEMORY.md loaded (or created)
- [ ] Pattern candidates evaluated
- [ ] Decision candidates evaluated
- [ ] Pitfall candidates evaluated
- [ ] Duplicates identified and skipped
- [ ] Confidence levels updated
- [ ] New entries written to MEMORY.md
- [ ] Statistics updated
- [ ] WORKING.md cleared
- [ ] Summary output

## Notes

- Quality over quantity - curate learnings
- Low bar for pitfalls - better to capture
- Higher bar for patterns - must be validated
- Deduplication prevents bloat
- Confidence tracking shows reliability
