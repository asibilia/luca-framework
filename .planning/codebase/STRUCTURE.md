# Codebase Structure

**Analysis Date:** 2026-02-04

## Directory Layout

```
luca-framework/
├── .cursor/
│   ├── agents/              # Specialized agent definitions
│   │   ├── lu-router.md
│   │   ├── lu-planner.md
│   │   ├── lu-executor.md
│   │   ├── lu-verifier.md
│   │   ├── lu-learner.md
│   │   ├── lu-cognition.md
│   │   └── [20+ other agents]
│   ├── skills/              # User-facing command definitions
│   │   ├── lu-plan-phase/
│   │   ├── lu-execute-phase/
│   │   ├── lu-map-codebase/
│   │   └── [30+ other skills]
│   ├── origin/
│   │   ├── templates/       # Document templates
│   │   │   ├── BRAIN.md
│   │   │   ├── MEMORY.md
│   │   │   ├── WORKING.md
│   │   │   ├── PROJECT.md
│   │   │   ├── ROADMAP.md
│   │   │   ├── STATE.md
│   │   │   ├── milestone.md
│   │   │   ├── summary.md
│   │   │   ├── phase-prompt.md
│   │   │   └── codebase/    # Codebase analysis templates
│   │   ├── workflows/       # Orchestrator workflow definitions
│   │   │   ├── execute-phase.md
│   │   │   ├── plan-phase.md
│   │   │   ├── map-codebase.md
│   │   │   └── [10+ other workflows]
│   │   └── references/      # Shared knowledge and patterns
│   │       ├── checkpoints.md
│   │       ├── tdd.md
│   │       ├── planning-config.md
│   │       └── [10+ other references]
│   ├── rules/               # Cursor rules for code conventions
│   │   ├── cursor_rules.mdc
│   │   ├── taskmaster.mdc
│   │   ├── dev_workflow.mdc
│   │   └── [20+ other rules]
│   └── plans/               # Generated plan files (if any)
├── .planning/               # Project planning data (created during init)
│   ├── PROJECT.md           # Project requirements and context
│   ├── ROADMAP.md           # Phase structure and goals
│   ├── STATE.md             # Current position and accumulated context
│   ├── BRAIN.md             # Project identity and conventions
│   ├── MEMORY.md            # Validated patterns and learnings
│   ├── WORKING.md           # Session-specific findings
│   ├── phases/              # Phase execution data
│   │   └── XX-name/         # Per-phase directory
│   │       ├── {phase}-{plan}-PLAN.md
│   │       ├── {phase}-{plan}-SUMMARY.md
│   │       ├── {phase}-VERIFICATION.md
│   │       └── {phase}-CONTEXT.md (optional)
│   ├── codebase/            # Codebase analysis documents
│   │   ├── STACK.md
│   │   ├── ARCHITECTURE.md
│   │   ├── STRUCTURE.md
│   │   ├── CONVENTIONS.md
│   │   ├── TESTING.md
│   │   ├── INTEGRATIONS.md
│   │   └── CONCERNS.md
│   └── todos/               # Captured ideas and todos
│       └── pending/
├── docs/                    # Documentation
│   ├── agent-framework/
│   │   └── luca/
│   └── style-guide/
├── AGENTS.md                # Universal agent instructions
└── LICENSE
```

## Directory Purposes

**.cursor/agents/:**
- Purpose: Specialized agent definitions for specific domains
- Contains: Agent role definitions, execution flows, success criteria
- Key files: `lu-planner.md`, `lu-executor.md`, `lu-verifier.md`, `lu-router.md`, `lu-cognition.md`
- Pattern: YAML frontmatter + role section + execution flow + structured returns

**.cursor/skills/:**
- Purpose: User-facing command definitions that spawn orchestrators
- Contains: SKILL.md files with command descriptions, execution context, process steps
- Key files: `lu-plan-phase/SKILL.md`, `lu-execute-phase/SKILL.md`, `lu-map-codebase/SKILL.md`
- Pattern: YAML frontmatter + command description + sub-agent delegation + process steps

**.cursor/origin/templates/:**
- Purpose: Standardized document structures for consistency
- Contains: Template files for PROJECT.md, ROADMAP.md, PLAN.md, SUMMARY.md, etc.
- Key files: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `summary.md`, `phase-prompt.md`
- Pattern: Template structure with field descriptions and examples

**.cursor/origin/workflows/:**
- Purpose: Orchestrator workflow definitions for multi-step processes
- Contains: Step-by-step processes with agent spawning, checkpoint handling
- Key files: `execute-phase.md`, `plan-phase.md`, `map-codebase.md`
- Pattern: Process steps with bash snippets, agent spawning patterns, result aggregation

**.cursor/origin/references/:**
- Purpose: Shared knowledge and patterns for agents to reference
- Contains: Checkpoint patterns, TDD guidelines, planning config, verification patterns
- Key files: `checkpoints.md`, `tdd.md`, `planning-config.md`, `verification-patterns.md`
- Pattern: Pattern definitions with examples and guidelines

**.cursor/rules/:**
- Purpose: Cursor rules for code conventions and development patterns
- Contains: MDC rule files for coding standards, workflows, tool preferences
- Key files: `cursor_rules.mdc`, `taskmaster.mdc`, `dev_workflow.mdc`, `no-classes.mdc`
- Pattern: Rule descriptions with DO/DON'T examples

**.planning/:**
- Purpose: Project planning data and execution artifacts
- Contains: PROJECT.md, ROADMAP.md, STATE.md, phases/, codebase/, todos/
- Key files: `PROJECT.md` (requirements), `ROADMAP.md` (phases), `STATE.md` (position)
- Pattern: Living documents updated throughout project lifecycle

**.planning/phases/:**
- Purpose: Per-phase execution data (plans, summaries, verification)
- Contains: Phase directories named `XX-name/` with PLAN.md, SUMMARY.md, VERIFICATION.md
- Key files: `{phase}-{plan}-PLAN.md`, `{phase}-{plan}-SUMMARY.md`, `{phase}-VERIFICATION.md`
- Pattern: Phase directories contain execution artifacts, frontmatter enables dependency graph

**.planning/codebase/:**
- Purpose: Codebase analysis documents for planning context
- Contains: STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md
- Key files: All 7 analysis documents
- Pattern: Template-driven analysis written by lu-codebase-mapper agents

**docs/:**
- Purpose: Project documentation and guides
- Contains: Agent framework docs, style guides
- Key files: `agent-framework/luca/README.md`, `style-guide/coding-standards.md`

## Key File Locations

**Entry Points:**
- `AGENTS.md`: Universal instructions for all AI agents working on repository
- `.cursor/skills/lu-*/SKILL.md`: User command entry points

**Configuration:**
- `.planning/config.json`: Planning behavior settings (model profiles, commit preferences)
- `.planning/PROJECT.md`: Project requirements, constraints, decisions
- `.planning/STATE.md`: Current position, accumulated context

**Core Logic:**
- `.cursor/agents/*.md`: Agent behavior definitions
- `.cursor/origin/workflows/*.md`: Orchestrator workflows
- `.planning/phases/XX-name/*-PLAN.md`: Executable plans

**Templates:**
- `.cursor/origin/templates/*.md`: Document templates
- `.cursor/origin/templates/codebase/*.md`: Codebase analysis templates

**State Tracking:**
- `.planning/STATE.md`: Project position and accumulated context
- `.planning/BRAIN.md`: Project identity (loaded at session start)
- `.planning/MEMORY.md`: Validated patterns (selectively recalled)
- `.planning/WORKING.md`: Session findings (cleared after learning)

**Testing:**
- No test files detected (framework definition, not application code)

## Naming Conventions

**Files:**
- Agent definitions: `lu-{domain}.md` (e.g., `lu-planner.md`, `lu-executor.md`)
- Skills: `lu-{command}/SKILL.md` (e.g., `lu-plan-phase/SKILL.md`)
- Plans: `{phase}-{plan}-PLAN.md` (e.g., `01-02-PLAN.md`)
- Summaries: `{phase}-{plan}-SUMMARY.md` (e.g., `01-02-SUMMARY.md`)
- Verification: `{phase}-VERIFICATION.md` (e.g., `01-VERIFICATION.md`)
- Templates: `{document-name}.md` (e.g., `PROJECT.md`, `ROADMAP.md`)
- Rules: `{topic}.mdc` (e.g., `cursor_rules.mdc`, `taskmaster.mdc`)

**Directories:**
- Phase directories: `{XX}-{name}/` (e.g., `01-foundation/`, `02-features/`)
- Skills: `lu-{command}/` (e.g., `lu-plan-phase/`)
- Templates: `{category}/` (e.g., `codebase/`, `research-project/`)

## Where to Add New Code

**New Agent:**
- Primary code: `.cursor/agents/{agent-name}.md`
- Follow pattern: YAML frontmatter + role + execution flow + structured returns
- Reference: Existing agents like `lu-planner.md` or `lu-executor.md`

**New Skill/Command:**
- Implementation: `.cursor/skills/{command-name}/SKILL.md`
- Workflow: `.cursor/origin/workflows/{workflow-name}.md` (if orchestrator needed)
- Pattern: YAML frontmatter + description + sub-agent delegation + process steps
- Reference: `lu-plan-phase/SKILL.md` or `lu-map-codebase/SKILL.md`

**New Template:**
- Implementation: `.cursor/origin/templates/{template-name}.md`
- Pattern: Template structure with field descriptions, examples, guidelines
- Reference: `PROJECT.md` or `summary.md` templates

**New Workflow:**
- Implementation: `.cursor/origin/workflows/{workflow-name}.md`
- Pattern: Step-by-step process with bash snippets, agent spawning, result aggregation
- Reference: `execute-phase.md` or `map-codebase.md`

**New Reference Document:**
- Implementation: `.cursor/origin/references/{topic}.md`
- Pattern: Pattern definitions with examples and guidelines
- Reference: `checkpoints.md` or `tdd.md`

**New Rule:**
- Implementation: `.cursor/rules/{topic}.mdc`
- Pattern: Rule description with DO/DON'T examples, file references
- Reference: `cursor_rules.mdc` or `taskmaster.mdc`

## Special Directories

**.planning/:**
- Purpose: Project planning data and execution artifacts
- Generated: Yes (created during `/lu-new-project` or `/lu-new-milestone`)
- Committed: Yes (unless `commit_docs: false` in config.json or gitignored)

**.planning/phases/:**
- Purpose: Per-phase execution data
- Generated: Yes (created during `/lu-plan-phase`)
- Committed: Yes (unless `commit_docs: false`)

**.planning/codebase/:**
- Purpose: Codebase analysis documents
- Generated: Yes (created during `/lu-map-codebase`)
- Committed: Yes (unless `commit_docs: false`)

**.cursor/plans/:**
- Purpose: Legacy plan storage (if any)
- Generated: Possibly (depends on project state)
- Committed: Yes

---

*Structure analysis: 2026-02-04*
