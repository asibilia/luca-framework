/**
 * lu-map-codebase Skill - Analyze existing codebase with parallel mapper agents. Use when user wants to understand a codebase, mentions /lu-map-codebase, or needs to map brownfield code before starting a Luca project.
 */
import { BaseSkillImpl } from '../base/base-skill';
import type { SkillConfig } from '../types/skill.types';

// Define the lu-map-codebase skill configuration
const luMapCodebaseConfig: SkillConfig = {
  frontmatter: {
    name: 'lu-map-codebase',
    description: `Analyze existing codebase with parallel mapper agents. Use when user wants to understand a codebase, mentions /lu-map-codebase, or needs to map brownfield code before starting a Luca project.`,
    'disable-model-invocation': true,
  },
  sections: [
    {
      title: 'main',
      content: `# Luca Map Codebase

Analyze existing codebase using parallel lu-codebase-mapper agents to produce structured codebase documents.

Each mapper agent explores a focus area and **writes documents directly** to \`.planning/codebase/\`. The orchestrator only receives confirmations, keeping context usage minimal.

**Arguments:** \`[optional: specific area to map, e.g., 'api' or 'auth']\`

**Output:** \`.planning/codebase/\` folder with 7 structured documents about the codebase state.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-codebase-mapper\` - Analyzes codebase and writes documents (4 parallel agents)

**DO NOT** attempt to analyze the codebase yourself. Spawn the mapper agents.

**Reference:** See \`.cursor/luca/references/task-directive.md\` for Task() syntax patterns.

### Model Resolution

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent                 | quality | balanced | budget |
| --------------------- | ------- | -------- | ------ |
| lu-codebase-mapper | opus    | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# Lightweight file scanning → use "fast"
mapper_model = "fast"
\`\`\`

## Execution Context

Read this reference file before executing:

- \`.cursor/luca/workflows/map-codebase.md\`

## When to Use

**Use map-codebase for:**

- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**

- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)

## Process

1. Check if \`.planning/codebase/\` already exists (offer to refresh or skip)
2. Create \`.planning/codebase/\` directory structure

\`\`\`bash
mkdir -p .planning/codebase
\`\`\`

1. Spawn 4 parallel lu-codebase-mapper agents:

**MANDATORY**: You MUST spawn 4 lu-codebase-mapper agents in PARALLEL. Do NOT analyze the codebase yourself.

\`\`\`python
# Agent 1: Tech Focus - STACK.md, INTEGRATIONS.md
Task(
  prompt="""
<mapping_context>

**Focus Area:** tech
**Output Directory:** .planning/codebase/
**Documents to Write:** STACK.md, INTEGRATIONS.md

</mapping_context>

<analysis_targets>
- Languages, frameworks, runtime versions
- Package dependencies (package.json, requirements.txt, etc.)
- Build tools and configuration
- External integrations (APIs, services, databases)
</analysis_targets>

<output_requirements>
- Write STACK.md with technology analysis
- Write INTEGRATIONS.md with external dependencies
- Return confirmation with document line counts
</output_requirements>

Analyze the codebase's technology stack and integrations.
""",
  subagent_type="lu-codebase-mapper",
  model="{mapper_model}",
  description="Map: tech focus"
)

# Agent 2: Arch Focus - ARCHITECTURE.md, STRUCTURE.md
Task(
  prompt="""
<mapping_context>

**Focus Area:** arch
**Output Directory:** .planning/codebase/
**Documents to Write:** ARCHITECTURE.md, STRUCTURE.md

</mapping_context>

<analysis_targets>
- Overall architecture pattern (monolith, microservices, etc.)
- Directory structure and organization
- Module boundaries and dependencies
- Data flow patterns
</analysis_targets>

<output_requirements>
- Write ARCHITECTURE.md with architecture analysis
- Write STRUCTURE.md with directory/module breakdown
- Return confirmation with document line counts
</output_requirements>

Analyze the codebase's architecture and structure.
""",
  subagent_type="lu-codebase-mapper",
  model="{mapper_model}",
  description="Map: arch focus"
)

# Agent 3: Quality Focus - CONVENTIONS.md, TESTING.md
Task(
  prompt="""
<mapping_context>

**Focus Area:** quality
**Output Directory:** .planning/codebase/
**Documents to Write:** CONVENTIONS.md, TESTING.md

</mapping_context>

<analysis_targets>
- Code conventions and style patterns
- Naming conventions
- Error handling patterns
- Testing approach (frameworks, coverage, patterns)
</analysis_targets>

<output_requirements>
- Write CONVENTIONS.md with code style analysis
- Write TESTING.md with testing approach analysis
- Return confirmation with document line counts
</output_requirements>

Analyze the codebase's coding conventions and testing patterns.
""",
  subagent_type="lu-codebase-mapper",
  model="{mapper_model}",
  description="Map: quality focus"
)

# Agent 4: Concerns Focus - CONCERNS.md
Task(
  prompt="""
<mapping_context>

**Focus Area:** concerns
**Output Directory:** .planning/codebase/
**Documents to Write:** CONCERNS.md

</mapping_context>

<analysis_targets>
- Technical debt areas
- Complexity hotspots
- Security considerations
- Performance concerns
- Areas needing refactoring
</analysis_targets>

<output_requirements>
- Write CONCERNS.md with identified issues and risks
- Prioritize by severity
- Return confirmation with document line counts
</output_requirements>

Analyze the codebase for concerns, tech debt, and risks.
""",
  subagent_type="lu-codebase-mapper",
  model="{mapper_model}",
  description="Map: concerns focus"
)
\`\`\`

**Do NOT proceed until ALL 4 Tasks return.**

1. Wait for agents to complete, collect confirmations (NOT document contents)
2. Verify all 7 documents exist with line counts
3. Commit codebase map
4. Offer next steps (typically: \`/lu-new-project\` or \`/lu-plan-phase\`)

## Success Criteria

- [ ] .planning/codebase/ directory created
- [ ] All 7 codebase documents written by mapper agents
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors

## Next Steps

**Primary:** \`/lu-progress\` — Check project status with codebase context

**Also available:**

- \`/lu-new-milestone\` — Start a new milestone using codebase knowledge
- \`/lu-discuss-phase {N}\` — Discuss a phase with codebase awareness`,
      order: 1
    }
  ]
};

export class LuMapCodebaseSkill extends BaseSkillImpl {
  constructor() {
    super(luMapCodebaseConfig);
  }
}
