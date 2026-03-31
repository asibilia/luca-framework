# scout-analyze

Analyze framework impact by scanning the <%= branding.frameworkName %> codebase and identifying gaps and improvement opportunities.

## main

# Scout Analyze

Sub-skill for Step 4 of the scout per-article pipeline. Framework impact analysis.

## Arguments

- slug: Article identifier
- digest_path: Path to the fully-researched digest (with Related Work and Technique Deep-Dive populated)

## Process


1. Read the completed digest document
2. Scan the <%= branding.frameworkName %> codebase for relevant domains:
   - Check existing implementations that relate to the article's techniques
   - Identify gaps where the article's approaches could improve <%= branding.frameworkName %>
   - Assess effort levels for each potential improvement
3. Produce a framework gap analysis document with:
   - **Gap Analysis table**: Area | Current State | Potential Improvement | Effort
   - **Applicable Patterns**: Which patterns from the article could be adopted
   - **Recommended Actions**: Checkbox list of concrete improvements

## Output

Write impact analysis to `docs/scouting/digests/{slug}-impact.md` with:

### Gap Analysis Table

| Area | Current State | Potential Improvement | Effort |
|------|--------------|----------------------|--------|
| ... | ... | ... | Low/Medium/High |

### Effort Levels

- **Low** (< 1 phase): Simple addition, follows existing patterns
- **Medium** (1-2 phases): New functionality, moderate integration
- **High** (3+ phases): Architectural change, significant refactoring

### Recommended Actions

- [ ] P0: [Critical improvements]
- [ ] P1: [Important improvements]
- [ ] P2: [Nice-to-have improvements]

## Codebase Areas to Scan

Reference these key areas:
- src/workflow/ (DAG engine, step registry)
- src/agents/ (agent definitions, shared sections)
- src/skills/ (skill definitions, orchestrators)
- src/harness/ (verification runner)
- src/iteration/ (budget, convergence)
- src/context/ (context tier resolution)
- .claude/rules/ (conventions and rules)