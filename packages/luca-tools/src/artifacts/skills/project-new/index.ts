/**
 * project-new skill — Initialize a new Luca project with deep context gathering and MuninnDB memory seeding.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/project-new/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca New Project

Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

This is the most leveraged moment in any project. Deep questioning here means better plans, better execution, better outcomes. One command takes you from idea to ready-for-planning.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`researcher\` - Domain research (4 parallel agents for Stack, Features, Architecture, Pitfalls)
- \`lu-research-synthesizer\` - Synthesizes research outputs into SUMMARY.md
- \`lu-roadmapper\` - Creates \`.luca/roadmap.md\` from requirements via \`luca roadmap create\`

**DO NOT** attempt to research, synthesize, or create roadmaps yourself. Spawn the appropriate agents.


### Model Resolution

Resolve models before spawning agents:

\`\`\`bash
MODEL_PROFILE=$(cat .luca/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

| Agent                      | quality | balanced | budget |
| -------------------------- | ------- | -------- | ------ |
| researcher   | opus    | sonnet   | haiku  |
| lu-research-synthesizer | opus    | sonnet   | haiku  |
| lu-roadmapper           | opus    | opus     | sonnet |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# Lightweight summarization → use "fast"
synthesizer_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
researcher_model = (omit)
roadmapper_model = (omit)
\`\`\`

## Creates

- \`.luca/state.json\` — workflow state machine (created by \`luca init\`)
- \`.luca/config.json\` — workflow preferences
- \`.luca/roadmap.md\` — phase structure (created via \`luca roadmap create\`)
- \`.luca/phases/<NN-slug>/research.md\` — domain research (per phase, optional)
- **MuninnDB** — project identity (\`brain:project-identity\`), project requirements (\`brain:project-requirements\`), and long-term learnings (seeded via \`/seed-memory\`)
- **GitHub issue** — project tracking (optional)
- **Feature branch** — linked to issue (optional)

**After this command:** Run \`/phase-plan 1\` to start execution.

## Cognitive Initialization

As part of project setup, seed the MuninnDB memory system:

### Seed Project Memory

After gathering project context through questioning, run the \`/seed-memory\` skill to populate MuninnDB with project identity:

\`\`\`
Skill(skill: "seed-memory", args: "--from-context")
\`\`\`

This seeds MuninnDB with:

- **Identity**: Project name, domain, purpose, vision
- **Stack**: Languages, frameworks, databases, key dependencies
- **Architecture**: Pattern, structure, key modules
- **Conventions**: Code style, file naming, commit format, testing approach
- **Personality**: Communication style, development preferences, verbosity

MuninnDB will then accumulate over time:

- Patterns discovered during development
- Decisions made with rationale
- Pitfalls encountered and how to avoid them
- Session context for continuity across context resets

## Process

### Phase 1: Setup

**MANDATORY FIRST STEP — Execute these checks before ANY user interaction:**

1. **Abort if project exists:**

   \`\`\`bash
   [ -f .luca/state.json ] && echo "ERROR: Project already initialized. Use /progress" && exit 1
   \`\`\`

2. **Initialize git repo in THIS directory** (required even if inside a parent repo):

   \`\`\`bash
   if [ -d .git ] || [ -f .git ]; then
       echo "Git repo exists in current directory"
   else
       git init
       echo "Initialized new git repo"
   fi
   \`\`\`

3. **Ask about GitHub issue (optional):**

   Use AskQuestion tool:

   - question: "Is this project tied to a GitHub issue? If so, enter the issue number (or leave blank to skip):"

   If issue number provided:

   - Store as \`$ISSUE_NUMBER\` for use in commits
   - Create feature branch: \`git checkout -b {issue}--{project-slug}\`
   - Example: \`42--user-dashboard-project\`

4. **Detect existing code (brownfield detection):**

   \`\`\`bash
   CODE_FILES=$(find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" 2>/dev/null | grep -v node_modules | grep -v .git | head -20)
   HAS_PACKAGE=$([ -f package.json ] || [ -f requirements.txt ] || [ -f Cargo.toml ] || [ -f go.mod ] || [ -f Package.swift ] && echo "yes")
   HAS_CODEBASE_MAP=$([ -d .luca/codebase ] && echo "yes")
   \`\`\`

### Phase 2: Brownfield Offer

**If existing code detected and .luca/codebase/ doesn't exist:**

Use AskQuestion tool:

- header: "Existing Code"
- question: "I detected existing code in this directory. Would you like to map the codebase first?"
- options:
  - "Map codebase first" — Run /codebase-map to understand existing architecture (Recommended)
  - "Skip mapping" — Proceed with project initialization

**If "Map codebase first":** Run \`/codebase-map\` first, then return to \`/project-new\`. Exit command.

### Phase 3: Deep Questioning

**Display stage banner:**

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

**Open the conversation:**

Ask inline (freeform, NOT AskQuestion): "What do you want to build?"

Wait for their response. This gives you the context needed to ask intelligent follow-up questions.

**Follow the thread:**

Based on what they said, ask follow-up questions that dig into their response. Use AskQuestion with options that probe what they mentioned — interpretations, clarifications, concrete examples.

Keep following threads. Each answer opens new threads to explore. Ask about:

- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

Consult \`questioning.md\` for techniques:

- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Decision gate:**

When you have a clear project identity, use AskQuestion:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to capture the project identity?"
- options:
  - "Capture identity" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

Loop until "Capture identity" selected.

### Phase 4: Capture Project Identity in MuninnDB

Synthesize all context into a structured \`brain:project-identity\` tree in MuninnDB (vault: repo vault):

\`\`\`
mcp__muninn__muninn_remember_tree(
  vault: "<repo_vault>",
  root: { concept: "brain:project-identity", content: "<one-line summary>", tags: ["brain","identity"] },
  children: [
    { concept: "brain:project-identity:what-this-is", content: "<what this is>" },
    { concept: "brain:project-identity:core-value", content: "<core value proposition>" },
    { concept: "brain:project-identity:scope", content: "<v1 scope>" },
    { concept: "brain:project-identity:out-of-scope", content: "<v2+ out of scope>" }
  ]
)
\`\`\`

Project identity lives as MuninnDB engrams, not as a hand-authored \`PROJECT.md\` (the legacy file has no canonical home in LUCA_DIR_CONTRACT). Run \`luca init\` to write the canonical \`.luca/\` skeleton.

\`\`\`bash
luca init
git add .luca/
bun run commit --message="initialize project identity" --type=docs --scope=project --no-push --skip-checks
\`\`\`

### Phase 5: Workflow Preferences

Ask about workflow settings using AskQuestion:

**Round 1 — Core workflow settings:**

- Mode: YOLO (auto-approve) vs Interactive (confirm each step)
- Depth: Quick (3-5 phases) vs Standard (5-8 phases) vs Comprehensive (8-12 phases)
- Execution: Parallel vs Sequential
- Git Tracking: Yes (planning docs in git) vs No (local only)

**Round 2 — Workflow agents:**

- Research: Research before planning each phase?
- Plan Check: Verify plans achieve their goals?
- Verifier: Verify work satisfies requirements?
- Model Profile: Quality vs Balanced vs Budget

Create \`.luca/config.json\` with all settings.

### Phase 6: Research Decision (Optional)

Ask if user wants to research the domain ecosystem before defining requirements.

If "Research first":

**MANDATORY**: You MUST spawn 4 parallel researcher agents. Do NOT attempt to research yourself.

First, recall the project context from MuninnDB:

\`\`\`
mcp__muninn__muninn_recall_tree(vault: "<repo_vault>", id: "brain:project-identity")
\`\`\`

Per-phase research lives under \`.luca/phases/<NN-slug>/research.md\` (per LUCA_DIR_CONTRACT). For the project-initialization domain research, persist findings to MuninnDB engrams under \`research:project-init-<topic>\` (vault: repo vault).

Then spawn ALL 4 researchers in PARALLEL (same message, multiple Task calls):

\`\`\`python
# Stack Researcher - technologies, frameworks, databases
Task(
  prompt="""
<research_context>

**Focus Area:** Stack/Technology
**Project:**
{project_content}

</research_context>

<research_questions>
1. What technologies are best suited for this project?
2. What frameworks are commonly used in this domain?
3. What database/storage solutions fit the requirements?
4. What are the trade-offs of different tech choices?
</research_questions>

<output_requirements>
- Create .luca/research/STACK.md
- Include recommendations with rationale
- Note any compatibility considerations
</output_requirements>

Research the optimal technology stack for this project.
""",
  subagent_type="researcher",
  model="{researcher_model}",
  description="Research Stack"
)

# Features Researcher - similar products, feature sets
Task(
  prompt="""
<research_context>

**Focus Area:** Features/Competition
**Project:**
{project_content}

</research_context>

<research_questions>
1. What similar products exist in this space?
2. What features are considered table-stakes?
3. What differentiators could provide competitive advantage?
4. What are common user expectations in this domain?
</research_questions>

<output_requirements>
- Create .luca/research/FEATURES.md
- Include competitive analysis
- Identify must-have vs nice-to-have features
</output_requirements>

Research features and competitive landscape for this project.
""",
  subagent_type="researcher",
  model="{researcher_model}",
  description="Research Features"
)

# Architecture Researcher - patterns, structure, scalability
Task(
  prompt="""
<research_context>

**Focus Area:** Architecture
**Project:**
{project_content}

</research_context>

<research_questions>
1. What architectural patterns fit this project?
2. How should the system be structured?
3. What scalability considerations are important?
4. What are best practices for this type of application?
</research_questions>

<output_requirements>
- Create .luca/research/ARCHITECTURE.md
- Include recommended patterns with rationale
- Note scaling considerations
</output_requirements>

Research architectural patterns and best practices for this project.
""",
  subagent_type="researcher",
  model="{researcher_model}",
  description="Research Architecture"
)

# Pitfalls Researcher - common mistakes, risks, gotchas
Task(
  prompt="""
<research_context>

**Focus Area:** Pitfalls/Risks
**Project:**
{project_content}

</research_context>

<research_questions>
1. What are common mistakes in similar projects?
2. What technical risks should be anticipated?
3. What are known gotchas in this domain?
4. What security considerations are critical?
</research_questions>

<output_requirements>
- Create .luca/research/PITFALLS.md
- Include specific warnings with mitigation strategies
- Prioritize by severity
</output_requirements>

Research common pitfalls and risks for this project.
""",
  subagent_type="researcher",
  model="{researcher_model}",
  description="Research Pitfalls"
)
\`\`\`

**Do NOT proceed until ALL 4 Tasks return.**

After all researchers complete, spawn synthesizer:

\`\`\`python
Task(
  prompt="""
<synthesis_context>

**Stack Research:**
{stack_content from .luca/research/STACK.md}

**Features Research:**
{features_content from .luca/research/FEATURES.md}

**Architecture Research:**
{architecture_content from .luca/research/ARCHITECTURE.md}

**Pitfalls Research:**
{pitfalls_content from .luca/research/PITFALLS.md}

</synthesis_context>

<output_requirements>
- Create .luca/research/SUMMARY.md
- Combine key insights from all research
- Prioritize recommendations
- Highlight decisions that need user input
</output_requirements>

Synthesize all research outputs into a cohesive summary.
""",
  subagent_type="lu-research-synthesizer",
  model="{synthesizer_model}",
  description="Synthesize Research"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Phase 7: Define Requirements

Present features by category, scope each category for v1/v2/out of scope.
Store the requirements as a MuninnDB tree under \`brain:project-requirements\` with REQ-IDs as children. The legacy hand-authored \`REQUIREMENTS.md\` has no canonical home in LUCA_DIR_CONTRACT.

### Phase 8: Create Roadmap

**MANDATORY**: You MUST spawn a lu-roadmapper sub-agent. Do NOT attempt to create the roadmap yourself.

First, recall the required context from MuninnDB:

\`\`\`
mcp__muninn__muninn_recall_tree(vault: "<repo_vault>", id: "brain:project-identity")
mcp__muninn__muninn_recall_tree(vault: "<repo_vault>", id: "brain:project-requirements")
mcp__muninn__muninn_recall(vault: "<repo_vault>", context: "project-init research summary", tags: ["research","project-init"])
\`\`\`

\`\`\`bash
CONFIG_CONTENT=$(cat .luca/config.json)
\`\`\`

Then spawn the roadmapper:

\`\`\`python
Task(
  prompt="""
<roadmap_context>

**Project:**
{project_content}

**Requirements:**
{requirements_content}

**Research Summary:**
{research_summary}

**Config (for depth setting):**
{config_content}

</roadmap_context>

<depth_guidance>
Based on config depth setting:
- Quick: 3-5 phases
- Standard: 5-8 phases
- Comprehensive: 8-12 phases
</depth_guidance>

<output_requirements>
1. Create .luca/roadmap.md via \`luca roadmap create --file <payload.json>\` with:
   - Phase structure with clear goals
   - Requirement mappings (REQ-XXX → Phase X)
   - Success criteria for each phase
   - Dependencies between phases

2. Initialize the workflow state via \`luca init\` (which creates \`.luca/state.json\`, \`config.json\`, and the canonical directory skeleton).

3. The project requirements + traceability are already stored in MuninnDB (\`brain:project-requirements\` tree, Phase 7); the roadmap-creation step should reference those engrams for requirement → phase mapping. Per-phase requirement traceability surfaces via the per-phase \`audits/\` artifacts.
</output_requirements>

Create the project roadmap based on requirements and research.
""",
  subagent_type="lu-roadmapper",
  model="{roadmapper_model}",
  description="Create Roadmap"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### Phase 9: GitHub Issue & Branch

**After roadmap is complete, offer to create a GitHub issue:**

Use AskQuestion tool:

- header: "GitHub Tracking"
- question: "Create a GitHub issue to track this project?"
- options:
  - "Create issue" — Create issue with project summary and create feature branch
  - "Skip" — No GitHub issue needed

**If "Create issue":**

1. **Create GitHub issue** using \`gh issue create\`:

   \`\`\`bash
   gh issue create      --title "feat([scope]): [project one-liner from brain:project-identity]"      --body "[Generated from brain:project-identity + brain:project-requirements MuninnDB engrams + roadmap.md summary]"
   \`\`\`

   Issue body should include:

   - Summary (from \`brain:project-identity:what-this-is\` engram)
   - Core Value
   - v1 Scope (requirements grouped by category)
   - Roadmap table (phase | goal)
   - Out of Scope (v2 items)
   - Reference to \`.luca/\` docs

2. **Create feature branch** linked to issue:

   \`\`\`bash
   git checkout -b {issue_number}--{project-slug}
   \`\`\`

3. **Record the issue and branch references in MuninnDB:**

   \`\`\`
   mcp__muninn__muninn_remember(
     vault: "<repo_vault>",
     concept: "session:project-init",
     content: "GitHub issue #{issue_number} / branch {issue_number}--{project-slug} — initial project tracking",
     tags: ["session","project-init","github"]
   )
   \`\`\`

   Branch metadata (\`branchName\`, \`baseBranch\`, \`prBase\`) flows through \`luca branch guard\` and the architect mode-agent's branch-establishment flow; no separate state-field write is required.

4. **Commit and push:**

   \`\`\`bash
   git add .
   bun run commit --message="link planning docs to GitHub issue" --type=docs --scope=repo --no-push --skip-checks
   git push -u origin {branch_name}
   \`\`\`

**If "Skip":** Continue to Phase 10.

### Phase 10: Done

Present completion with next steps:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ▶ Next Up

**Phase 1: [Phase Name]** — [Goal from roadmap.md]

/phase-discuss 1 — gather context and clarify approach

---

**Also available:**
- /phase-plan 1 — skip discussion, plan directly
\`\`\`

## Success Criteria

- [ ] .luca/ directory created
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Deep questioning completed (threads followed, not rushed)
- [ ] Project identity captured as MuninnDB \`brain:project-identity\` tree → committed
- [ ] config.json has workflow mode, depth, parallelization → committed
- [ ] Research completed (if selected) — 4 parallel agents spawned → MuninnDB research engrams persisted
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category (v1/v2/out of scope)
- [ ] Requirements stored as MuninnDB \`brain:project-requirements\` tree with REQ-IDs
- [ ] \`.luca/roadmap.md\` created via \`luca roadmap create\` with phases, requirement mappings, success criteria
- [ ] \`.luca/state.json\` initialized via \`luca init\`
- [ ] GitHub issue created (if selected) with project summary
- [ ] Feature branch created and pushed (if issue created)
- [ ] GitHub issue/branch refs stored in MuninnDB \`session:project-init\` engram (if issue created)
- [ ] User knows next step is \`/phase-discuss 1\`

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Project initialized | Discuss first phase | \`/phase-discuss 1\` |
| Want to skip discussion | Plan directly | \`/phase-plan 1\` |
| Need to map existing code | Map codebase | \`/codebase-map\` |

**Primary:** \`/phase-discuss 1\` — Gather context for first phase

**Also available:**

- \`/phase-plan 1\` — Skip discussion, plan directly
- \`/codebase-map\` — Map existing codebase first (brownfield)
</main>
`

export const projectNewSkill = defineSkill({
    name: "project-new",
    description: "Initialize a new Luca project with deep context gathering and MuninnDB memory seeding.",
    body: BODY,
})
