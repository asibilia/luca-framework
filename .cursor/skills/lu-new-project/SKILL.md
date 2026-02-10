---
name: "lu-new-project"
description: "Initialize a new Luca project with deep context gathering. Use when the user wants to start a new project, asks about /lu-new-project, or mentions Luca project initialization."
disable-model-invocation: true
---

<main>
<main>
# Luca New Project

Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

This is the most leveraged moment in any project. Deep questioning here means better plans, better execution, better outcomes. One command takes you from idea to ready-for-planning.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-project-researcher` - Domain research (4 parallel agents for Stack, Features, Architecture, Pitfalls)
- `lu-research-synthesizer` - Synthesizes research outputs into SUMMARY.md
- `lu-roadmapper` - Creates ROADMAP.md from requirements

**DO NOT** attempt to research, synthesize, or create roadmaps yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

### Model Resolution

Resolve models before spawning agents:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

| Agent                      | quality | balanced | budget |
| -------------------------- | ------- | -------- | ------ |
| lu-project-researcher   | opus    | sonnet   | haiku  |
| lu-research-synthesizer | opus    | sonnet   | haiku  |
| lu-roadmapper           | opus    | opus     | sonnet |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# Lightweight summarization → use "fast"
synthesizer_model = "fast"

# Reasoning-intensive agents → omit (inherit from parent)
researcher_model = (omit)
roadmapper_model = (omit)
```

## Creates

- `.planning/PROJECT.md` — project context
- `.planning/config.json` — workflow preferences
- `.planning/BRAIN.md` — project identity and conventions (NEW)
- `.planning/MEMORY.md` — long-term learning storage (NEW)
- `.planning/WORKING.md` — session working memory (NEW)
- `.planning/research/` — domain research (optional)
- `.planning/REQUIREMENTS.md` — scoped requirements
- `.planning/ROADMAP.md` — phase structure
- `.planning/STATE.md` — project memory
- **GitHub issue** — project tracking (optional)
- **Feature branch** — linked to issue (optional)

**After this command:** Run `/lu-plan-phase 1` to start execution.

## Cognitive Initialization

As part of project setup, initialize the cognitive memory system:

### BRAIN.md Creation

After gathering project context through questioning, create BRAIN.md:

```bash
# Use template
cp .cursor/luca/templates/BRAIN.md .planning/BRAIN.md
```

Then populate from questioning answers:

- **Identity**: Project name, domain, purpose, vision
- **Stack**: Languages, frameworks, databases, key dependencies
- **Architecture**: Pattern, structure, key modules
- **Conventions**: Code style, file naming, commit format, testing approach
- **Personality**: Communication style, development preferences, verbosity

### MEMORY.md Initialization

Create empty long-term memory:

```bash
cp .cursor/luca/templates/MEMORY.md .planning/MEMORY.md
```

This will accumulate:

- Patterns discovered during development
- Decisions made with rationale
- Pitfalls encountered and how to avoid them

### WORKING.md Initialization

Create session working memory:

```bash
cp .cursor/luca/templates/WORKING.md .planning/WORKING.md
```

Initialize with session info for this setup workflow.

## Execution Context

Read these reference files before executing:

- `.cursor/luca/references/questioning.md`
- `.cursor/luca/references/ui-brand.md`
- `.cursor/luca/templates/project.md`
- `.cursor/luca/templates/requirements.md`

## Process

### Phase 1: Setup

**MANDATORY FIRST STEP — Execute these checks before ANY user interaction:**

1. **Abort if project exists:**

   ```bash
   [ -f .planning/PROJECT.md ] && echo "ERROR: Project already initialized. Use /lu-progress" && exit 1
   ```

2. **Initialize git repo in THIS directory** (required even if inside a parent repo):

   ```bash
   if [ -d .git ] || [ -f .git ]; then
       echo "Git repo exists in current directory"
   else
       git init
       echo "Initialized new git repo"
   fi
   ```

3. **Ask about GitHub issue (optional):**

   Use AskQuestion tool:

   - question: "Is this project tied to a GitHub issue? If so, enter the issue number (or leave blank to skip):"

   If issue number provided:

   - Store as `$ISSUE_NUMBER` for use in commits
   - Create feature branch: `git checkout -b {issue}--{project-slug}`
   - Example: `42--user-dashboard-project`

4. **Detect existing code (brownfield detection):**

   ```bash
   CODE_FILES=$(find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" 2>/dev/null | grep -v node_modules | grep -v .git | head -20)
   HAS_PACKAGE=$([ -f package.json ] || [ -f requirements.txt ] || [ -f Cargo.toml ] || [ -f go.mod ] || [ -f Package.swift ] && echo "yes")
   HAS_CODEBASE_MAP=$([ -d .planning/codebase ] && echo "yes")
   ```

### Phase 2: Brownfield Offer

**If existing code detected and .planning/codebase/ doesn't exist:**

Use AskQuestion tool:

- header: "Existing Code"
- question: "I detected existing code in this directory. Would you like to map the codebase first?"
- options:
  - "Map codebase first" — Run /lu-map-codebase to understand existing architecture (Recommended)
  - "Skip mapping" — Proceed with project initialization

**If "Map codebase first":** Run `/lu-map-codebase` first, then return to `/lu-new-project`. Exit command.

### Phase 3: Deep Questioning

**Display stage banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

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

Consult `questioning.md` for techniques:

- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Decision gate:**

When you could write a clear PROJECT.md, use AskQuestion:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to create PROJECT.md?"
- options:
  - "Create PROJECT.md" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

Loop until "Create PROJECT.md" selected.

### Phase 4: Write PROJECT.md

Synthesize all context into `.planning/PROJECT.md` using the template from `templates/project.md`.

**Commit PROJECT.md:**

```bash
mkdir -p .planning
git add .
bun run commit --message="initialize project - [One-liner from PROJECT.md What This Is section]" --type=docs --scope=project --no-push --skip-checks
```

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

Create `.planning/config.json` with all settings.

### Phase 6: Research Decision (Optional)

Ask if user wants to research the domain ecosystem before defining requirements.

If "Research first":

**MANDATORY**: You MUST spawn 4 parallel researcher agents. Do NOT attempt to research yourself.

First, read the project context:

```bash
PROJECT_CONTENT=$(cat .planning/PROJECT.md)
mkdir -p .planning/research
```

Then spawn ALL 4 researchers in PARALLEL (same message, multiple Task calls):

```python
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
- Create .planning/research/STACK.md
- Include recommendations with rationale
- Note any compatibility considerations
</output_requirements>

Research the optimal technology stack for this project.
""",
  subagent_type="lu-project-researcher",
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
- Create .planning/research/FEATURES.md
- Include competitive analysis
- Identify must-have vs nice-to-have features
</output_requirements>

Research features and competitive landscape for this project.
""",
  subagent_type="lu-project-researcher",
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
- Create .planning/research/ARCHITECTURE.md
- Include recommended patterns with rationale
- Note scaling considerations
</output_requirements>

Research architectural patterns and best practices for this project.
""",
  subagent_type="lu-project-researcher",
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
- Create .planning/research/PITFALLS.md
- Include specific warnings with mitigation strategies
- Prioritize by severity
</output_requirements>

Research common pitfalls and risks for this project.
""",
  subagent_type="lu-project-researcher",
  model="{researcher_model}",
  description="Research Pitfalls"
)
```

**Do NOT proceed until ALL 4 Tasks return.**

After all researchers complete, spawn synthesizer:

```python
Task(
  prompt="""
<synthesis_context>

**Stack Research:**
{stack_content from .planning/research/STACK.md}

**Features Research:**
{features_content from .planning/research/FEATURES.md}

**Architecture Research:**
{architecture_content from .planning/research/ARCHITECTURE.md}

**Pitfalls Research:**
{pitfalls_content from .planning/research/PITFALLS.md}

</synthesis_context>

<output_requirements>
- Create .planning/research/SUMMARY.md
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
```

**Do NOT proceed until the Task returns.**

### Phase 7: Define Requirements

Present features by category, scope each category for v1/v2/out of scope.
Create `.planning/REQUIREMENTS.md` with REQ-IDs.

### Phase 8: Create Roadmap

**MANDATORY**: You MUST spawn a lu-roadmapper sub-agent. Do NOT attempt to create the roadmap yourself.

First, read the required context:

```bash
PROJECT_CONTENT=$(cat .planning/PROJECT.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md)
RESEARCH_SUMMARY=$(cat .planning/research/SUMMARY.md 2>/dev/null || echo "No research available")
CONFIG_CONTENT=$(cat .planning/config.json)
```

Then spawn the roadmapper:

```python
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
1. Create .planning/ROADMAP.md with:
   - Phase structure with clear goals
   - Requirement mappings (REQ-XXX → Phase X)
   - Success criteria for each phase
   - Dependencies between phases

2. Create .planning/STATE.md initialized to:
   - Current Phase: 1
   - Status: ready_for_planning

3. Update REQUIREMENTS.md with traceability table showing which requirements map to which phases
</output_requirements>

Create the project roadmap based on requirements and research.
""",
  subagent_type="lu-roadmapper",
  model="{roadmapper_model}",
  description="Create Roadmap"
)
```

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

1. **Create GitHub issue** using `gh issue create`:

   ```bash
   gh issue create      --title "feat([scope]): [project one-liner from PROJECT.md]"      --body "[Generated from PROJECT.md, REQUIREMENTS.md, ROADMAP.md summary]"
   ```

   Issue body should include:

   - Summary (from PROJECT.md "What This Is")
   - Core Value
   - v1 Scope (requirements grouped by category)
   - Roadmap table (phase | goal)
   - Out of Scope (v2 items)
   - Reference to `.planning/` docs

2. **Create feature branch** linked to issue:

   ```bash
   git checkout -b {issue_number}--{project-slug}
   ```

3. **Update STATE.md** with issue and branch references:

   Add to Project Reference section:

   - `**GitHub Issue:** #{issue_number}`
   - `**Branch:** \`{issue_number}--{project-slug}\``

4. **Commit and push:**

   ```bash
   git add .
   bun run commit --message="link planning docs to GitHub issue" --type=docs --scope=repo --no-push --skip-checks
   git push -u origin {branch_name}
   ```

**If "Skip":** Continue to Phase 10.

### Phase 10: Done

Present completion with next steps:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ▶ Next Up

**Phase 1: [Phase Name]** — [Goal from ROADMAP.md]

/lu-discuss-phase 1 — gather context and clarify approach

---

**Also available:**
- /lu-plan-phase 1 — skip discussion, plan directly
```

## Success Criteria

- [ ] .planning/ directory created
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Deep questioning completed (threads followed, not rushed)
- [ ] PROJECT.md captures full context → committed
- [ ] config.json has workflow mode, depth, parallelization → committed
- [ ] Research completed (if selected) — 4 parallel agents spawned → committed
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category (v1/v2/out of scope)
- [ ] REQUIREMENTS.md created with REQ-IDs → committed
- [ ] ROADMAP.md created with phases, requirement mappings, success criteria
- [ ] STATE.md initialized
- [ ] GitHub issue created (if selected) with project summary
- [ ] Feature branch created and pushed (if issue created)
- [ ] STATE.md updated with issue/branch references (if issue created)
- [ ] User knows next step is `/lu-discuss-phase 1`

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Project initialized | Discuss first phase | `/lu-discuss-phase 1` |
| Want to skip discussion | Plan directly | `/lu-plan-phase 1` |
| Need to map existing code | Map codebase | `/lu-map-codebase` |

**Primary:** `/lu-discuss-phase 1` — Gather context for first phase

**Also available:**

- `/lu-plan-phase 1` — Skip discussion, plan directly
- `/lu-map-codebase` — Map existing codebase first (brownfield)
</main>
</main>