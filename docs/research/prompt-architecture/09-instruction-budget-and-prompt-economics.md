# Instruction Budget & Prompt Economics

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How system prompt token budgets work, the economics of instruction density, MCP tool overhead, and the CLAUDE.md-as-budget paradigm

---

## Executive Summary

A critical insight from Tyler Folkman's analysis of the Claude Code source leak: **instruction budgets are shared between system prompts and user configurations, causing dilution as line count increases.** This reframes CLAUDE.md not as a document but as a **finite budget of ~100 prescriptive constraints** that must be optimized for signal density. Combined with the system prompt structure analysis, this reveals a complete picture of prompt economics that should fundamentally shape how luca-mastracode allocates its instruction token budget.

---

## Table of Contents

1. [The Shared Instruction Budget Problem](#1-the-shared-instruction-budget-problem)
2. [CLAUDE.md as Token Budget](#2-claudemd-as-token-budget)
3. [MCP Tool Definition Overhead](#3-mcp-tool-definition-overhead)
4. [Hooks vs Instructions: Deterministic vs Probabilistic](#4-hooks-vs-instructions)
5. [The System Prompt Token Anatomy](#5-the-system-prompt-token-anatomy)
6. [Memory Taxonomy & Token Efficiency](#6-memory-taxonomy--token-efficiency)
7. [Skill Frontmatter & Discovery Economics](#7-skill-frontmatter--discovery-economics)
8. [Quantified Constraints in Production](#8-quantified-constraints-in-production)
9. [Implications for luca-mastracode](#9-implications-for-luca-mastracode)
10. [Sources](#10-sources)

---

## 1. The Shared Instruction Budget Problem

### The Core Insight

Tyler Folkman's analysis reveals a fundamental truth about Claude Code's architecture: **the instruction budget is shared between the system prompt and user-provided configurations** (CLAUDE.md, rules, skills). Every token spent on user instructions competes with the system prompt for the model's attention.

This creates a **dilution effect**: as CLAUDE.md grows longer, each individual instruction receives proportionally less model attention. A 300-line CLAUDE.md doesn't just cost more tokens — it actively degrades the effectiveness of every instruction within it.

### The Implication

This means instruction authoring is an **optimization problem**, not a documentation problem. The goal is maximum behavioral impact per token, not comprehensive coverage.

---

## 2. CLAUDE.md as Token Budget

### The Budget Paradigm

Folkman reframes CLAUDE.md from "configuration document" to "approximately 100 prescriptive constraints." His optimization process:

- **Before**: 200+ lines of instructions
- **After**: Under 80 lines
- **Reduction**: ~60%
- **Method**: Audit every line for whether it's a prescriptive constraint vs. derivable information

### What Gets Cut

- Architecture descriptions (derivable from code)
- File path references (derivable from codebase exploration)
- Redundant restatements of common conventions
- "Nice to have" preferences that rarely affect output
- Information already encoded in tool definitions or system prompt

### What Stays

- Hard constraints that override model defaults
- Project-specific conventions that contradict common patterns
- Critical safety rules
- Integration patterns unique to the project
- Behavioral rules that "fight the weights"

### The Audit Question

For every line in CLAUDE.md, ask: **"If I remove this line, will the model's behavior meaningfully change?"** If the answer is no, it's wasting budget.

---

## 3. MCP Tool Definition Overhead

### The Token Tax

Each MCP server connection injects tool definitions into the system prompt. Folkman's analysis reveals:

- **Individual MCP tools**: 15,000+ tokens each for complex tools
- **5 connected servers**: ~60,000 tokens consumed before the first user message
- **Combined with system prompt**: ~19,000 characters of base system prompt + ~73,000 characters of built-in tool definitions

### The Budget Math

For a 200K token context window:

| Component | Tokens | % of Budget |
|---|---|---|
| System prompt (static) | ~5,000 | 2.5% |
| Built-in tool definitions (36+) | ~18,000 | 9% |
| MCP tool definitions (5 servers) | ~60,000 | 30% |
| CLAUDE.md + rules + skills | ~2,000-6,000 | 1-3% |
| **Available for conversation** | **~111,000-115,000** | **~56-58%** |

This means **over 40% of the context window can be consumed by prompt infrastructure** before the user types anything.

### Optimization Strategies

1. **Minimize MCP connections**: Only connect servers actively needed
2. **Lazy tool loading**: Load tool definitions on-demand rather than at session start
3. **Tool description compression**: Keep descriptions concise while retaining behavioral guidance
4. **Disconnect idle servers**: Free tokens when MCP tools aren't being used

---

## 4. Hooks vs Instructions: Deterministic vs Probabilistic

### The Fundamental Distinction

Folkman highlights a critical architectural separation in Claude Code:

| Aspect | Hooks | Instructions (CLAUDE.md) |
|---|---|---|
| **Execution** | Deterministic — always runs | Probabilistic — model may not follow |
| **Enforcement** | Hard — blocks on failure | Soft — guidance only |
| **Token cost** | Zero — runs outside prompt | Nonzero — consumes context budget |
| **Reliability** | 100% — shell script | <100% — LLM compliance varies |
| **Complexity** | Simple — pass/fail | Rich — nuanced guidance |

### The Migration Rule

**Move rules that "must always happen" to hooks. Leave guidance rules in CLAUDE.md.**

Examples of what should be hooks (not instructions):

| Rule | Hook Type | Implementation |
|---|---|---|
| Run formatter after edits | PostToolUse (Edit/Write) | `npx prettier --write "$FILE_PATH"` |
| Block dangerous git commands | PreToolUse (Bash) | Exit code 2 blocks execution |
| Type-check after file changes | PostToolUse (Edit/Write) | `bunx --bun tsc --noEmit` |
| Lint on commit | PreToolUse (Bash/git commit) | Run linter, exit 2 on failure |

Examples of what should stay as instructions:

| Rule | Why Instructions |
|---|---|
| "Prefer functional patterns" | Requires judgment |
| "Use Bun instead of Node" | Multiple valid approaches |
| "Keep responses concise" | Style guidance |
| "Understand code before modifying" | Behavioral principle |

### The PostToolUse Formatter Pattern

From the article:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "npx prettier --write \"$FILE_PATH\""
        }]
      }
    ]
  }
}
```

This is **zero-token enforcement** — the formatter runs automatically without any instruction budget spent convincing the model to format code.

### The PreToolUse Block Pattern

PreToolUse hooks with **exit code 2** block the tool call entirely. This provides hard enforcement that no amount of prompt engineering can match — the operation physically cannot proceed.

---

## 5. The System Prompt Token Anatomy

### Claude Code v2.1.50 Structure

From the extracted system prompt, the exact section ordering:

```
1. Identity & Context (~100 tokens)
2. Skill System triggers (~200 tokens)
3. Core Behavioral Principles (~300 tokens)
4. Task Management Framework (~400 tokens)
5. File Operations Priority (~300 tokens)
6. Git Workflow Instructions (~800 tokens)
7. Code Handling Rules (~400 tokens)
8. Tool Usage Patterns & Priority (~500 tokens)
9. Planning & Clarification triggers (~400 tokens)
10. Security & Authorization (~300 tokens)
11. Agent Types & Applications (~400 tokens)
12. Memory & Context Management (~200 tokens)
13. Code References Format (~50 tokens)
───────────────────────────────────
Total system prompt: ~4,350 tokens
+ Tool definitions: ~18,000 tokens
= Total static prefix: ~22,350 tokens
```

### Key Observation

The system prompt itself is surprisingly **concise** — roughly 4,350 tokens. The tool definitions are **4x larger** than the behavioral instructions. This validates the finding from doc 03 that ~79% of prompt budget goes to tool definitions.

### Quantified Limits Found in the Prompt

| Limit | Value | Purpose |
|---|---|---|
| Token budget | 200,000 | Total context window |
| Read default limit | 2,000 lines | Prevent overloading context |
| PDF max pages | 20 per request | Prevent overloading context |
| AskUserQuestion limit | 1-4 questions | Prevent interrogation loops |
| Question options | 2-4 choices | Constrain user decision space |
| Bash timeout default | 120,000ms (2 min) | Prevent hanging commands |
| Bash timeout max | 600,000ms (10 min) | Hard ceiling for long commands |
| TodoWrite in_progress limit | 1 at a time | Force sequential focus |

These quantified limits are more enforceable than qualitative directives because they're checkable.

---

## 6. Memory Taxonomy & Token Efficiency

### The Four-Type System

Claude Code enforces a strict memory taxonomy:

| Type | Purpose | Token Efficiency |
|---|---|---|
| `user` | Role, goals, preferences | High — rarely changes |
| `feedback` | Corrections, confirmations | High — prevents repeated mistakes |
| `project` | Ongoing work, deadlines | Medium — decays over time |
| `reference` | External system pointers | High — stable references |

### The Exclusion Rule

**"Anything derivable from code should be excluded from memory."**

This prevents the common anti-pattern of storing architecture notes, file paths, or code patterns that can be re-derived by reading the codebase. Every byte of memory that duplicates derivable information wastes tokens when loaded into context.

### What This Means for MuninnDB

luca-mastracode's MuninnDB stores more types (session, pattern, pitfall, brain, metric, research, etc.). The exclusion rule still applies: before storing a memory, ask "Can the agent derive this by reading the current code?" If yes, don't store it.

---

## 7. Skill Frontmatter & Discovery Economics

### How Skill Discovery Works

Only **frontmatter fields** trigger model discovery of skills. The skill body content enters context **only on invocation**. This is a critical token-saving design:

```markdown
---
name: my-skill
description: What this skill does  # Discovery field
when_to_use: When to trigger it     # Discovery field  
---

[Detailed skill instructions here — NOT loaded until invoked]
```

### The Discovery Failure Mode

Folkman notes that skills with "vague names and no `when_to_use` field" failed to auto-invoke. The model couldn't determine relevance from ambiguous frontmatter, so it never loaded the skill body.

### Token Economics

- **Frontmatter cost**: ~50-100 tokens per skill (always loaded)
- **Body cost**: ~500-2000 tokens per skill (only on invocation)
- **10 skills with bodies always loaded**: ~5,000-20,000 wasted tokens
- **10 skills with frontmatter-only discovery**: ~500-1,000 tokens

This is a **10-20x token efficiency improvement** from lazy loading skill bodies.

### Implications for luca-mastracode

luca-mastracode's skill system (installed via `installSkills()`) copies bundled skill folders to `.mastracode/skills/`. The frontmatter-based discovery pattern should be adopted:

- Skills should have descriptive `name` and `when_to_use` fields
- Skill bodies should load only when the skill is invoked
- Ambiguous skill names waste the frontmatter token budget

---

## 8. Quantified Constraints in Production

### Instruction Phrasing Patterns from the System Prompt

The extracted Claude Code system prompt reveals consistent phrasing patterns:

**Hard constraints (NEVER/MUST):**
- "NEVER commit secrets (.env, credentials.json)"
- "NEVER skip pre-commit hooks without explicit request"
- "NEVER use git -i flag"
- "NEVER generate URLs unless confident they're programming-related"

**Soft constraints (prefer/avoid):**
- "Prefer editing existing files over creation"
- "Reserve Bash for actual system commands"
- "Avoid over-engineering; only make requested changes"

**Bidirectional constraints:**
- "Use Read for reading. Do NOT use cat/head/tail."
- "Use Edit for modifications. Do NOT use sed/awk."
- "Use Glob for file patterns. Do NOT use find/ls."

**Conditional triggers:**
- "Use EnterPlanMode for non-trivial implementation"
- Triggers listed: new features, multiple approaches, architectural decisions, multi-file changes
- Skip conditions: typo fixes, single-function additions, detailed user instructions

**Quantified limits:**
- "Only ONE todo as in_progress at a time"
- "1-4 questions per AskUserQuestion call"
- "2-4 choices per question"

### The Phrasing Hierarchy

From most enforceable to least:

1. **Quantified limits** ("max 4 questions") — checkable, unambiguous
2. **Hard constraints** ("NEVER do X") — clear prohibition
3. **Bidirectional constraints** ("Use X, NOT Y") — eliminates ambiguity
4. **Conditional triggers** ("When X, do Y") — context-dependent rules
5. **Soft constraints** ("Prefer X") — guidance, not rules
6. **Principles** ("Be concise") — general behavioral direction

The most effective prompts use primarily levels 1-4. Levels 5-6 have inconsistent enforcement.

---

## 9. Implications for luca-mastracode

### Immediate Actions

**1. Audit instruction token budget (1-2h)**

Calculate the actual token cost of luca-mastracode's current prompt infrastructure:
- Base mode instructions (per mode .md file)
- Hard constraints
- AlwaysApply rules (caveman, pr-title-format)
- Tool definitions
- Dynamic state context
- MCP tool definitions (MuninnDB, etc.)

If total exceeds 40% of context window, optimize.

**2. Migrate deterministic rules to hooks (2-3h)**

Review all rules in instruction files. Any rule that:
- Must always happen (not judgment-dependent)
- Has a binary pass/fail outcome
- Can be enforced via shell script

Should move from instructions to hooks, freeing token budget.

**3. Apply the exclusion audit to instructions (1-2h)**

For every line in mode instruction files, ask: "If I remove this line, will the model's behavior meaningfully change?" Cut anything that doesn't pass.

**4. Adopt lazy skill loading (3-4h)**

Ensure skill bodies load only on invocation. Frontmatter should be descriptive enough for the model to decide relevance without loading the full body.

**5. Add quantified constraints where missing (1-2h)**

Replace qualitative directives ("be concise") with quantified limits ("keep responses under 100 words in fast mode"). Review all soft constraints for opportunities to make them quantified or bidirectional.

### Architecture-Level Changes

**6. Token budget monitoring dashboard**

Track per-mode token costs:
- System prompt tokens
- Tool definition tokens
- MCP overhead tokens
- Available conversation tokens
- Actual usage per turn

This enables data-driven optimization of the instruction budget.

**7. MCP connection management**

Only connect MuninnDB and other MCP servers when the mode actually needs them. Disconnect during modes that don't use memory (e.g., fast mode, triage mode) to free ~15,000+ tokens.

---

## 10. Sources

### Primary Sources

- [I Read the Claude Code Source Leak — Here's What I Changed](https://tylerfolkman.substack.com/p/i-read-the-claude-code-source-leak) — Tyler Folkman's analysis of instruction budget optimization
- [Claude Code System Prompt (v2.1.50)](https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-code.md) — Extracted system prompt from asgeirtj/system_prompts_leaks
- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) — Version-tracked system prompt evolution

### Supporting Research

- [Claude Code Prompts | Anatomy of an AI Coding Agent](https://ccprompts.info/) — 124 prompts cataloged across 9 categories
- [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) — Dynamic assembly analysis
- [The Complete Guide to Writing Agent System Prompts](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1) — Token budget and attention curve guidance
- [Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices) — Anthropic official documentation
