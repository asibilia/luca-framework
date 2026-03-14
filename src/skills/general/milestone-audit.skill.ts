/**
 * milestone-audit Skill - Audit milestone completion against original requirements and acceptance criteria.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the milestone-audit skill configuration
const milestoneAuditConfig: SkillConfig = {
  frontmatter: {
    name: "milestone-audit",
    description: `Audit milestone completion against original requirements and acceptance criteria.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Audit Milestone

Audit milestone completion against original intent with cross-phase code review.

**Arguments:** \`[version]\` (optional - uses current milestone if not provided)

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-integration-checker\` - Verifies cross-phase integration
- \`dx-advocate\` - Code quality review (milestone-wide)
- \`code-simplifier\` - DRY and complexity review
- \`code-architect\` - Architecture coherence review
- \`ui\` - Tailwind/styling review
- \`security-auditor\` - Security review (milestone-wide)

**DO NOT** attempt to check integration or review code yourself. Spawn the appropriate agents.

**Reference:** See \`.claude/luca/references/task-directive.md\` for Task() syntax patterns.

## Model Profile

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

**Model lookup table:**

| Agent                     | quality | balanced | budget |
| ------------------------- | ------- | -------- | ------ |
| lu-integration-checker | sonnet  | sonnet   | haiku  |
| dx-advocate               | opus    | sonnet   | haiku  |
| code-simplifier           | opus    | sonnet   | haiku  |
| code-architect            | opus    | sonnet   | haiku  |
| tailwind-auditor          | opus    | sonnet   | haiku  |
| security-auditor          | opus    | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# All audit agents require reasoning → omit (inherit from parent)
integration_checker_model = (omit)
reviewer_model = (omit)  # dx-advocate, code-simplifier, etc.
\`\`\`

## Process

### 1. Load Context

- Read all phase VERIFICATION.md files for the milestone
- Read REQUIREMENTS.md
- Read PROJECT.md for original intent

### 2. Check Requirements Coverage

- Compare completed requirements to original v1 list
- Identify any gaps or partial implementations

### 3. Spawn Integration Checker

**MANDATORY**: You MUST spawn a lu-integration-checker sub-agent. Do NOT verify integration yourself.

First, read the phase context:

\`\`\`bash
VERIFICATION_FILES=$(find .planning/phases -name "VERIFICATION.md" -exec cat {} ;)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
\`\`\`

Then spawn the integration checker:

\`\`\`\`python
Task(
  prompt="""
<integration_context>

**Milestone:** v{version}

**Phase Verifications:**
{verification_files}

**Requirements:**
{requirements_content}

**Roadmap:**
{roadmap_content}

</integration_context>

<verification_targets>
1. Cross-phase wiring: Do components from different phases connect properly?
2. End-to-end flows: Do user journeys work across phase boundaries?
3. Data flow: Is data passed correctly between phases?
4. API contracts: Do interfaces match expectations?
</verification_targets>

<output_requirements>
Return status and any integration gaps found:
\`\`\`yaml
status: passed | gaps_found
integration_score: N/M
gaps:
  - description: "Gap description"
    phases_affected: ["01", "03"]
    severity: critical | high | medium
\`\`\`\`

</output_requirements>

Verify cross-phase integration for this milestone.
""",
subagent_type="lu-integration-checker",
model="{checker_model}",
description="Integration check: v{version}"
)

\`\`\`\`

**Do NOT proceed until the Task returns.**

### 4. Milestone-wide Code Quality Review

**Get all files changed in this milestone:**

\`\`\`bash
# Find milestone start commit (first commit on this branch or tag)
MILESTONE_START=$(git merge-base main HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD)

# Get all TypeScript/TSX files changed since milestone start
CHANGED_FILES=$(git diff --name-only $MILESTONE_START HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -100)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || echo "0")
\`\`\`\`

**If files changed:** Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE CODE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Reviewing {FILE_COUNT} files changed across all phases...
\`\`\`

**MANDATORY**: Spawn ALL reviewers in PARALLEL. Do NOT review code yourself.

First, read project standards:

\`\`\`bash
CLAUDE_CONTENT=$(cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md")
\`\`\`

Then spawn ALL reviewers in PARALLEL (same message, multiple Task calls):

\`\`\`\`python
# DX Advocate - conventions across phases
Task(
  prompt="""
Review files changed across this milestone for code quality issues.

**Changed files (all phases):**
{changed_files}

**Project standards:**
{claude_content}

**Your focus:** Conventions consistency across phases, snake_case keys, Lodash usage patterns

**Milestone-level concerns:**
- Cross-phase patterns and consistency
- DRY violations across phases
- Accumulated tech debt

**Return format:**
\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    cross_phase: true|false
\`\`\`\`

If no issues: \`issues: []\`
""",
subagent_type="dx-advocate",
model="{reviewer_model}",
description="Milestone DX review"
)

# Code Simplifier - DRY across phases

Task(
prompt="""
Review files changed across this milestone for complexity and duplication.

**Changed files (all phases):**
{changed_files}

**Your focus:** DRY violations across phases, duplicated utilities, refactoring opportunities

**Return format:**

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    cross_phase: true|false
\`\`\`

""",
subagent_type="code-simplifier",
model="{reviewer_model}",
description="Milestone simplification review"
)

# Code Architect - architecture coherence

Task(
prompt="""
Review files changed across this milestone for architecture issues.

**Changed files (all phases):**
{changed_files}

**Your focus:** Architecture consistency, module boundaries, file organization, pattern coherence across phases

**Return format:**

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    cross_phase: true|false
\`\`\`

""",
subagent_type="code-architect",
model="{reviewer_model}",
description="Milestone architecture review"
)

# Tailwind Auditor - styling consistency

Task(
prompt="""
Review files changed across this milestone for Tailwind/styling issues.

**Changed files (all phases):**
{changed_files}

**Your focus:** Dynamic color system usage, shadcn anti-patterns, Tailwind consistency

**Return format:**

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    cross_phase: true|false
\`\`\`

""",
subagent_type="ui",
model="{reviewer_model}",
description="Milestone Tailwind review"
)

# Security Auditor - security across milestone

Task(
prompt="""
Review files changed across this milestone for security issues.

**Changed files (all phases):**
{changed_files}

**Your focus:** Auth patterns consistency, API security across all endpoints, data flow

**Return format:**

\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    cross_phase: true|false
\`\`\`

""",
subagent_type="security-auditor",
model="{reviewer_model}",
description="Milestone security review"
)

\`\`\`

**Do NOT proceed until ALL Tasks return.**

**Agent-specific focus:**

- **dx-advocate**: "Conventions consistency across phases, snake_case keys, Lodash usage patterns"
- **code-simplifier**: "DRY violations across phases, duplicated utilities, refactoring opportunities"
- **code-architect**: "Architecture consistency, module boundaries, file organization, pattern coherence across phases"
- **tailwind-auditor**: "Dynamic color system usage, shadcn anti-patterns (text-muted-foreground, bg-primary), Tailwind consistency"
- **security-auditor**: "Auth patterns consistency, API security across all endpoints, data flow"

**Merge findings:** Combine all issues, categorize by severity and cross-phase flag. Store each reviewer's raw output keyed by agent name for potential debate analysis.

### 4.5 Adversarial Debate Round (Conditional)

**Gate check:**

\\\`\\\`\\\`bash
# Read debate config
DEBATE_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"milestone_debate_enabled"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$' || echo "true")
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
\\\`\\\`\\\`

**Skip if:** \\\`DEBATE_ENABLED\\\` is "false" OR complexity is below COMPLEX, OR no disagreements detected among reviewer outputs from Step 4.

**If all gates pass, proceed with debate:**

#### 4.5.1 Normalize and Detect

Collect all 5 code reviewer outputs (excluding integration checker) from Step 4.

- Normalize findings using tribunal detector
- Detect disagreements by file:line grouping
- Check severity gate (CRITICAL/HIGH required)

**Display tribunal start banner if disagreements found:**

\\\`\\\`\\\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca >>> MILESTONE DEBATE ROUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} disagreements detected across {M} reviewers.
Running adversarial rebuttal round...
\\\`\\\`\\\`

#### 4.5.2 Rebuttal Round

For each disagreement, spawn challenger and defender in PARALLEL:

\\\`\\\`\\\`\\\`python
# For each disagreement: spawn challenger and defender
# Use the SAME reviewer agent type as the original finding

Task(
  prompt="""
{challenger_prompt from buildRebuttalPrompts, augmented with milestone context}
""",
  subagent_type="{challenger_agent_type}",
  description="Challenge: {finding_summary}"
)

Task(
  prompt="""
{defender_prompt from buildRebuttalPrompts, augmented with milestone context}
""",
  subagent_type="{defender_agent_type}",
  description="Defend: {finding_summary}"
)
\\\`\\\`\\\`\\\`

**Do NOT proceed until ALL rebuttal Tasks return.**

#### 4.5.3 Resolve and Unify

Parse rebuttal responses. For each:
- Determine resolution: upheld, withdrawn, or modified
- Calculate confidence scores
- Build unified recommendations

#### 4.5.4 Display Debate Results

\\\`\\\`\\\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca >>> DEBATE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric                | Value |
|-----------------------|-------|
| Disagreements found   | {N}   |
| Rebuttals conducted   | {N}   |
| Findings withdrawn    | {N}   |
| Findings modified     | {N}   |
| Consensus confidence  | {avg} |
| Estimated token cost  | {N}   |
\\\`\\\`\\\`

#### 4.5.5 Replace Merged Findings

Replace the raw merged findings from Step 4 with unified recommendations from the debate. The unified recommendations carry confidence scores and debate history, which are used in Step 5 for the audit report.

### 5. Create Audit Report

Location: \`.planning/v{version}-MILESTONE-AUDIT.md\`

Include:
- Requirements status
- Integration status
- Code quality findings (from step 4, or unified recommendations if debate ran)
- Gaps identified
- Tech debt (populated from code review findings)

**If debate ran (Step 4.5),** add a Debate Analysis section after code quality findings:

\\\`\\\`\\\`markdown
### Debate Analysis

**Disagreements Resolved:** {N}
**Findings Withdrawn after Challenge:** {N}
**Findings Modified after Challenge:** {N}

#### High-Confidence Findings (>0.8)

| Finding | Severity | File | Confidence | Debate Status |
|---------|----------|------|------------|---------------|
| {issue} | {sev}    | {f}  | {conf}     | upheld/unchallenged |

#### Contested Findings (0.5-0.8)

| Finding | Severity | File | Confidence | Challenge Summary |
|---------|----------|------|------------|-------------------|
| {issue} | {sev}    | {f}  | {conf}     | {summary}         |

#### Withdrawn Findings

| Original Finding | Original Severity | Withdrawn By | Reason |
|------------------|-------------------|--------------|--------|
| {issue}          | {sev}             | {agent}      | {why}  |
\\\`\\\`\\\`

**If debate did NOT run,** omit the Debate Analysis section entirely. The report should be identical to the pre-debate format.

### 6. Present Results

**Route A: Clean audit**

\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► MILESTONE v{version} AUDIT COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requirements: {X}/{Y} complete ✓
Integration: passed ✓
Code quality: passed ✓

## ▶ Next Up

/milestone-complete — archive and celebrate

\`\`\`

**Route B: Issues found**

\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► MILESTONE v{version} AUDIT ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requirements: {X}/{Y} complete
Integration: {status}
Code quality: {N} issues found
Debate: {ran/skipped} {if ran: {N} disagreements resolved, {N} withdrawn, {N} modified}

### Gaps Found

- {gap 1}
- {gap 2}

### Tech Debt

- {item 1}
- {item 2}

### Cross-Phase Issues

| File   | Issue   | Phases Affected |
| ------ | ------- | --------------- |
| {file} | {issue} | {phases}        |

## ▶ Next Up

/milestone-gaps — create phases to close gaps
/milestone-complete — proceed anyway (tech debt noted)

\`\`\`

## Success Criteria

- [ ] All phase VERIFICATION.md files read
- [ ] Requirements coverage calculated
- [ ] Integration checker spawned
- [ ] Code review subagents spawned (dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor)
- [ ] Cross-phase patterns identified
- [ ] Tech debt populated from code review findings
- [ ] MILESTONE-AUDIT.md created
- [ ] Gaps clearly identified
- [ ] Debate round evaluated (gate check performed; debate ran if gates passed)
- [ ] If debate ran: unified recommendations replace raw merged findings
- [ ] If debate ran: audit report includes Debate Analysis section
- [ ] If debate skipped: behavior identical to pre-debate milestone-audit

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Audit passed | Complete milestone | \`/milestone-complete\` |
| Gaps found | Plan gap closure | \`/milestone-gaps\` |
| Want to review | Check progress | \`/progress\` |

**Primary:** \`/milestone-complete\` — Archive and prepare for next (if audit passed)

**Also available:**
- \`/milestone-gaps\` — Create phases to close gaps
- \`/progress\` — Review audit results
</main>`,
      order: 1,
    },
  ],
};

export const milestoneAuditSkill = createSkill(milestoneAuditConfig);
