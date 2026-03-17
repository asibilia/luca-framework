---
description: Luca workflow system for spec-driven development with cognitive memory
globs:
  - .planning/**/*
alwaysApply: false
---

# Luca workflow system for spec-driven development with cognitive memory

## main

# Luca Workflow System

Luca is a framework for agentic development, combining spec-driven development with cognitive memory systems and integrated git workflow. It solves context rot while enabling AI to learn from past experience.

## What's New in Luca

| Feature             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| Entry Point         | Unified `//lu` with intelligent routing               |
| **Git Integration** | Jira → GitHub issue → Branch → PR                    |
| Memory              | MuninnDB (semantic graph memory)                     |
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

## two-tier_memory_system

## MuninnDB Memory System

### Brain Tree — Project Identity

Stored as a MuninnDB tree (`brain:project-identity`), recalled at session start:

- Project identity (name, domain, purpose)
- Stack (languages, frameworks, databases)
- Architecture patterns
- Code conventions
- Development preferences

### Engrams — Long-Term Learning

Persistent across sessions in MuninnDB, semantically recalled:

- **Patterns** (`pattern:*`): Validated approaches that work
- **Decisions** (`decision:*`): Past choices with rationale
- **Pitfalls** (`pitfall:*`): Known issues to avoid
- **Preferences** (`preference:*`): User/project preferences

### Session Context — Active Memory

MuninnDB session engrams (`session:*`), scoped to current workflow:

- Current task context
- Immediate findings
- Hypotheses (for debugging)
- Candidate learnings

## cognitive_pre_flight

## Cognitive Pre-Flight

Before major operations, Luca runs cognitive pre-flight:

1. **Recall brain tree from MuninnDB** — Project conventions
2. **Semantic recall from MuninnDB** — Relevant patterns, decisions, pitfalls
3. **Initialize MuninnDB session context** — Session engrams
4. **Generate intuition flags** — RISK, CAUTION, OPPORTUNITY, UNKNOWN