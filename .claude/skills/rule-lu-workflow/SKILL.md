# rule-lu-workflow

Luca cognitive memory system: MuninnDB-backed workflow and quality curve.

## main

Luca is a framework for agentic development, combining spec-driven development with cognitive memory systems and integrated git workflow. It solves context rot while enabling AI to learn from past experience.

## What's New in Luca

| Feature             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| Entry Point         | Unified `/lu` with intelligent routing               |
| **Git Integration** | Jira → GitHub issue → Branch → PR                    |
| Memory              | MuninnDB (project identity, learnings, session)      |
| Verification        | Always runs (all complexity levels)                  |
| Learning            | Pattern/decision/pitfall capture                     |
| Pre-Flight          | Cognitive context loading                            |

## Philosophy

### Solo Developer + AI Workflow

- You are the visionary/product owner
- AI is the builder
- No teams, stakeholders, ceremonies, coordination overhead
- **NEW:** AI learns from past sessions

### Plans Are Prompts

PLAN.md is NOT a document that gets transformed into a prompt.
PLAN.md IS the prompt. It contains:

- Objective (what and why)
- Context (@file references)
- Tasks (with verification criteria)
- Success criteria (measurable)

### Quality Degradation Curve

| Context Usage | Quality   | AI's State              |
| ------------- | --------- | ----------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive |
| 30-50%        | GOOD      | Confident, solid work   |
| 50-70%        | DEGRADING | Efficiency mode begins  |
| 70%+          | POOR      | Rushed, minimal         |

**The rule:** Stop BEFORE quality degrades. Plans should complete within ~50% context.

### Ship Fast + Learn

No enterprise process. No approval gates.
Plan → Execute → **Verify** → **Learn** → Repeat

## two-tier-memory-system

## MuninnDB Memory System

All memory is stored in MuninnDB with semantic search, entity graphs, and temporal decay.

### Project Identity (brain:*)

Captures project personality, loaded at session start via `muninn_recall_tree`:

- Project identity (name, domain, purpose)
- Stack (languages, frameworks, databases)
- Architecture patterns
- Code conventions
- Development preferences

### Long-Term Learning (patterns, decisions, pitfalls)

Persistent across sessions, selectively recalled via `muninn_recall`:

- **Patterns**: Validated approaches that work
- **Decisions**: Past choices with rationale
- **Pitfalls**: Known issues to avoid
- **Preferences**: User/project preferences

### Session Memory (session:*)

Active during workflow, cleared after learning extraction via `muninn_forget`:

- Current task context
- Immediate findings
- Hypotheses (for debugging)
- Candidate learnings

## cognitive-pre-flight

## Cognitive Pre-Flight

Before major operations, Luca runs cognitive pre-flight via MuninnDB:

1. **Load project identity** — `muninn_recall_tree(id: "brain:project-identity")`
2. **Selective recall** — `muninn_recall(context: "relevant patterns, decisions, pitfalls")`
3. **Initialize session** — `muninn_remember(concept: "session:info", ...)`
4. **Generate intuition flags** — RISK, CAUTION, OPPORTUNITY, UNKNOWN