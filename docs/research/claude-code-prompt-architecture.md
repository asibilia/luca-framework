# Claude Code Prompt Architecture: Lessons for luca-mastracode

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How Claude Code constructs system prompts and what techniques luca-mastracode should adopt

---

## Executive Summary

Claude Code's system prompt is not a static string — it is a **dynamically assembled context** built from 30+ conditional components, 36+ tool definitions, multi-agent orchestration prompts, and session-specific state. The architecture is designed around three core principles: **prompt cache efficiency**, **behavioral precision over prose**, and **mid-conversation injection for context rot remediation**.

This document catalogs every technique identified through source analysis, the March 2026 source leak, and community reverse-engineering — then maps each to a concrete recommendation for luca-mastracode.

---

## Table of Contents

1. [Prompt Assembly Architecture](#1-prompt-assembly-architecture)
2. [The Cache Boundary Pattern](#2-the-cache-boundary-pattern)
3. [Behavioral Instruction Techniques](#3-behavioral-instruction-techniques)
4. [Tool Definition Patterns](#4-tool-definition-patterns)
5. [Mid-Conversation Injection (system-reminder)](#5-mid-conversation-injection)
6. [Memory System Architecture](#6-memory-system-architecture)
7. [Multi-Agent Coordination Prompts](#7-multi-agent-coordination-prompts)
8. [Context Management & Compaction](#8-context-management--compaction)
9. [Attention Curve Exploitation](#9-attention-curve-exploitation)
10. [Security & Anti-Distillation](#10-security--anti-distillation)
11. [Gap Analysis: luca-mastracode vs Claude Code](#11-gap-analysis)
12. [Prioritized Recommendations](#12-prioritized-recommendations)
13. [Sources](#13-sources)

---

## 1. Prompt Assembly Architecture

### How Claude Code Builds a Prompt

Claude Code assembles its system prompt from **9 categories** containing **124 total prompts** (19k characters for system prompt alone, 73k for tool definitions):

```
Static Prefix (globally cached, 1-hour TTL)
├── Identity & Introduction (1-3 sentences)
├── System Rules & Permissions
├── Executing Actions with Care (reversibility/blast radius framework)
├── Doing Tasks (coding philosophy)
├── Using Your Tools (dedicated tool preference)
├── Tone and Style
├── Session-Specific Guidance (conditional)
├── Tool Definitions (36+ tools, each with own prompt)
└── __SYSTEM_PROMPT_DYNAMIC_BOUNDARY__
Dynamic Suffix (session-specific, 5-minute TTL)
├── Environment Info (cwd, platform, shell, model, date)
├── Language Preference
├── CLAUDE.md / Project Rules
├── Memory Prompt (MEMORY.md index)
├── MCP Server Instructions (recomputed each turn)
├── Git Status Snapshot
└── Scratchpad Instructions
```

### Key Architectural Decisions

1. **Conditional assembly**: Components are included/excluded based on configuration flags, available tools, user type (internal vs external), and session state
2. **Functional composition**: Each section is a function returning a string (or empty string to exclude)
3. **~124 distinct prompts** across system, tools, agents, memory, and services — not one monolithic blob

### What luca-mastracode Does Today

luca-mastracode uses a **three-layer composition**:

```
Base Markdown (loaded from instructions/*.md, static per mode)
  + Dynamic State Context (read per-request via readLucaState())
  + Hard Constraints (3 universal rules)
  + Bundled AlwaysApply Rules (caveman, pr-title-format)
= Final instruction string
```

**Gap**: No cache boundary marker. No conditional component inclusion. No per-turn dynamic sections beyond workflow state. Tool definitions are static per mode, not dynamically assembled.

---

## 2. The Cache Boundary Pattern

### The Technique

Claude Code splits every system prompt at `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`:

- **Before the boundary** (static): Identity, behavioral rules, tool instructions — cached globally across all users with a **1-hour TTL**
- **After the boundary** (dynamic): CLAUDE.md, git status, MCP instructions, memory — per-session with a **5-minute TTL**

Any section that must bypass caching is explicitly marked with `DANGEROUS_uncachedSystemPromptSection()` — a naming convention that signals the performance cost to developers.

### Why This Matters

Prompt caching reduces latency and cost dramatically. Claude Code's architecture means spawning 5 sub-agents costs barely more than 1, because they share the cached static prefix (fork model).

### The Micro-Compaction Strategy

When approaching token limits, Claude Code performs **surgical edits** via `apiMicrocompact.ts`:
- Replaces large tool results with `[Old tool result cleared]`
- Edits only within the dynamic section to preserve cache hits
- Avoids full session restarts that would forfeit cached prefixes

### Recommendation for luca-mastracode

**Priority: HIGH**

Introduce a cache boundary in instruction assembly:

```typescript
// In each mode's buildInstructions():
function buildInstructions(): string {
  const staticPrefix = loadModeInstructions(mode)  // Cacheable
    + HARD_CONSTRAINTS
    + ALWAYS_APPLY_RULES

  const dynamicSuffix = buildDynamicContext()       // Per-request
    + buildEnvironmentInfo()
    + buildGitStatus()

  return staticPrefix + '\n\n__CACHE_BOUNDARY__\n\n' + dynamicSuffix
}
```

This requires Mastra's API layer to support Anthropic's cache control headers, but the prompt-side preparation should happen now.

---

## 3. Behavioral Instruction Techniques

### Principles Over Procedures

Claude Code gives **behavioral intentions**, not step-by-step procedures:

```
# Claude Code approach (principles):
"Always understand existing code before modifying.
 Don't add features beyond what was asked.
 A bug fix doesn't need surrounding code cleaned up."

# Anti-pattern (procedures):
"Step 1: Read the file. Step 2: Identify the bug.
 Step 3: Write the fix. Step 4: Run tests."
```

**Why**: Principles generalize to unanticipated scenarios. Procedures fail when the situation doesn't match the script.

### Quantified Constraints Beat Qualitative Directives

The leaked source reveals A/B testing results:

> "Research shows ~1.2% output token reduction vs qualitative 'be concise.'"

Production Claude Code uses **explicit word counts**:
- "Keep text between tool calls to <=25 words"
- "Keep final responses to <=100 words"

### Bidirectional Constraints

Claude Code doesn't just say what TO do — it says what NOT to do:

```
"Do NOT use the Bash to run commands when a relevant dedicated tool
 is provided. Using dedicated tools allows the user to better understand
 and review your work."
```

Every positive instruction has a corresponding negative constraint. This eliminates ambiguity.

### Explain Why

```
"Avoid git amend because it may overwrite others' commits"
```

The "because" clause teaches the model to make correct edge-case decisions autonomously.

### Recommendation for luca-mastracode

**Priority: HIGH**

1. Audit all instruction `.md` files: replace procedural step lists with behavioral principles where possible
2. Add quantified constraints (word/token limits) to modes like `fast.md` and `triage.md`
3. Add bidirectional constraints to tool usage sections: "Use X for Y. Do NOT use Z for Y."
4. Add "because" clauses to every constraint that isn't self-evident

---

## 4. Tool Definition Patterns

### Each Tool Carries Its Own Prompt

Claude Code has 36+ tools, each with a detailed description that includes:
- **When to use** (and when NOT to use)
- **Priority ordering** vs alternative tools
- **Behavioral constraints** specific to that tool
- **Few-shot examples** of correct invocation

Example — the Bash tool prompt:
```
Do NOT use the Bash to run commands when a relevant dedicated tool
is provided:
 - File search: Use Glob (NOT find or ls)
 - Content search: Use Grep (NOT grep or rg)
 - Read files: Use Read (NOT cat/head/tail)
 - Edit files: Use Edit (NOT sed/awk)
 - Write files: Use Write (NOT echo >/cat <<EOF)
```

### Tool Selection Heuristics

Tools are listed in priority order with specific conditions:
1. Read local files first
2. Use cached data second
3. Web search for gaps only
4. LLM scoring calls cost money — batch them

### Security-First Tool Defaults

The bash security system spans **9,707 lines with 22 validators**. Philosophy: "When in doubt, ask the human." Tools default to requiring explicit user approval rather than assuming permission.

### What luca-mastracode Does Today

- Tool permissions defined in `mode-permissions.ts` manifest (good)
- `createScopedTool` wrapper enforces action restrictions (good)
- But tool definitions lack behavioral guidance, priority ordering, and negative examples
- Instructions reference tool names inline but don't explain when NOT to use them

### Recommendation for luca-mastracode

**Priority: MEDIUM**

1. Add behavioral descriptions to tool definitions in `build-mode-tools.ts` — not just the action schema, but when/why/why-not guidance
2. Add tool priority ordering in mode instruction files
3. Add negative examples ("Do NOT use workflowState for X, use Y instead")

---

## 5. Mid-Conversation Injection

### The `<system-reminder>` Pattern

Claude Code declares in its system prompt:

```
Tool results and user messages may include <system-reminder> or other
tags. Tags contain information from the system. They bear no direct
relation to the specific tool results or user messages in which they
appear.
```

Then mid-conversation, it injects reminders for:
- **Behavioral refresh**: Re-stating critical rules that degrade over long contexts
- **Mode switching**: Plan mode, readonly mode transitions
- **File change notifications**: Alerting the model to external changes
- **Dynamic context updates**: Git status, open files, task lists
- **Periodic rule refresh**: Because models "forget" planning and start coding

### Why This Matters: Context Rot

LLM instruction adherence degrades after ~80K tokens. By ~180K tokens, it's severely compromised. Mid-conversation injection combats this by re-asserting critical rules at the point where they matter most — the **recency** end of the attention curve.

### Why It Goes in Messages, Not System Prompt

Putting changing context in the message layer (not system prompt) **preserves cache validity**. The static system prompt stays cached while dynamic reminders flow through messages.

### What luca-mastracode Does Today

- Mode continuation messages inject context when switching modes (good)
- But no mid-conversation behavioral refresh
- No periodic rule re-injection during long sessions
- No mechanism to combat context rot

### Recommendation for luca-mastracode

**Priority: HIGH**

1. Define a `<luca-reminder>` tag convention in base instructions
2. Implement periodic behavioral refresh at tool-call boundaries (every N turns or every M tokens)
3. Re-inject critical constraints (hard constraints, mode boundaries) as conversation grows
4. Use message-layer injection, not system prompt modification, to preserve any future cache boundaries

---

## 6. Memory System Architecture

### Claude Code's Three-Layer Memory

1. **Index layer** (MEMORY.md, always loaded): ~150-character pointers per entry, max 200 lines
2. **Topic files** (on-demand): Actual knowledge content, loaded when referenced
3. **Transcripts** (grep-only): Never loaded into context directly

### Write Discipline

- If a fact can be re-derived from the codebase, it's NOT stored
- Topic files updated BEFORE index modifications
- Memory is treated as **hints requiring verification**, not authoritative truth

### autoDream Consolidation

A forked subagent with limited tool access runs "nightly" consolidation:
- Reorganizes knowledge
- Removes contradictions
- Prevents memory corruption through tool isolation
- Triple-gated: 24+ hours since last run, 5+ accumulated sessions, file-based advisory lock

### What luca-mastracode Does Today

- Uses MuninnDB (semantic graph memory) — more sophisticated than file-based memory
- Two-vault model (repo vault + default vault) with concept-prefix routing
- Session context via `session:*` engrams
- No autoDream-style consolidation

### Recommendation for luca-mastracode

**Priority: LOW** (already strong)

1. Consider adding a periodic consolidation step similar to autoDream — a background subagent that reviews and deduplicates MuninnDB entries
2. Add the "hints, not truth" framing to any instructions that reference recalled memories

---

## 7. Multi-Agent Coordination Prompts

### Claude Code's Subagent Models

Three execution models:
1. **Fork**: Subagent inherits parent context as byte-identical copy (cache-efficient)
2. **Teammate**: Collaborative execution with shared workspace
3. **Worktree**: Isolated working directory (git worktree)

### Coordinator Prompt Patterns

The multi-agent coordinator uses system prompt instructions like:
- "Do not rubber-stamp weak work"
- "Never hand off understanding to another worker"
- Four-phase workflow: Research -> Synthesis -> Implementation -> Verification

### Self-Distrust in Verification

The Verification Agent contains a hardcoded list of rationalizations to resist:

> "The implementer is an LLM. Verify independently."

This **explicit self-distrust** forces independent validation rather than trusting AI-generated output.

### Specialized Agent Personas

7 agent prompts with distinct personalities:
- **Explore Agent**: Read-only codebase search specialist with deny-lists of prohibited operations
- **Plan Agent**: Software architect role
- **Coordinator**: Four-phase workflow manager

### What luca-mastracode Does Today

- 9 subagent definitions with inline instructions
- Subagents have `allowedWorkspaceTools` and `maxSteps` constraints
- Researcher subagent explicitly states "Read-only: Do NOT modify any files"
- No explicit self-distrust patterns in verifier

### Recommendation for luca-mastracode

**Priority: MEDIUM**

1. Add explicit self-distrust to lu-verifier: "The implementer is an LLM. Do not trust the code is correct. Verify independently."
2. Add "Do not rubber-stamp weak work" to any review-stage subagents
3. Consider fork-style subagent spawning for cache efficiency (depends on Mastra support)

---

## 8. Context Management & Compaction

### Token Budgeting

Claude Code monitors context continuously:
- **Buffer**: 13,000 tokens reserved before triggering compaction
- **Warning threshold**: 20,000 tokens for UI warnings
- **Max summary size**: 20,000 tokens for compaction summaries

### Tiered Estimation

Three approaches, used in order of precision:
1. **API-based**: Anthropic Token Counting API (most precise)
2. **Haiku fallback**: Faster model call if primary fails
3. **Rough heuristic**: ~1 token per 4 characters (immediate UI feedback)

### Compaction Strategy

Chain-of-thought reasoning in `<analysis>` tags, then **strips the reasoning** before re-injecting results. This reduces token waste while maintaining reasoning quality.

Circuit breaker: `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` — prevents runaway compaction loops (added after observing 1,279 sessions with up to 3,272 consecutive failures).

### What luca-mastracode Does Today

- Context metrics tracked in `.context-metrics.json`
- Quality degradation curve documented (0-30% peak, 70%+ poor)
- Plans should complete within ~50% context
- No active compaction or micro-compaction

### Recommendation for luca-mastracode

**Priority: MEDIUM**

1. Implement a context budget monitor that tracks token usage per mode
2. Add compaction triggers at mode boundaries (not just session boundaries)
3. Strip chain-of-thought from intermediate results before re-injection
4. Add a circuit breaker for compaction failures

---

## 9. Attention Curve Exploitation

### U-Shaped Attention

LLMs show **U-shaped attention**: peak focus at the beginning and end, degradation in the middle. Claude Code exploits this deliberately:

```
System Prompt Structure:
  [START] Identity + Security (PEAK attention)
  [MIDDLE] Workflow, tools, domain knowledge (lower attention)
  [END] Repeat 2-3 critical rules (PEAK attention via recency)
```

### Practical Implications

- **First 3 lines**: Identity + NEVER constraints (strongest enforcement)
- **Middle**: Operational details that benefit from structured formatting (headers, bullets, XML tags)
- **Last section**: Repeat the most important safety/behavioral rules

### What luca-mastracode Does Today

- Instructions start with role/purpose (good)
- Behavioral guidelines in the middle of instruction files
- Hard constraints appended at the end (partially exploits recency)
- No deliberate repetition of critical rules

### Recommendation for luca-mastracode

**Priority: MEDIUM**

1. Move the 2-3 most critical constraints to BOTH the start and end of mode instructions
2. Restructure instruction files: identity -> safety -> workflow -> tools -> **repeat safety**
3. Use structured formatting (headers, bullets) more aggressively in the "middle zone" where attention is lowest

---

## 10. Security & Anti-Distillation

### Anti-Distillation (Fake Tools)

When `ANTI_DISTILLATION_CC` is enabled, Claude Code sends `anti_distillation: ['fake_tools']` in API requests. The server injects **decoy tool definitions** to poison training data from competitors recording API traffic.

### Undercover Mode

For external repository contributions:
- Strips internal codenames, Slack references, self-identification
- ON by default, no force-OFF option
- Commit messages appear human-authored

### Frustration Detection

Pattern-matching via regex in `userPromptKeywords.ts` detects user frustration ("wtf", "broken", etc.) to trigger behavioral modifications — faster than inference-based sentiment detection.

### Permission Critic Pattern

Instead of allowlists, Claude Code uses a **critic pattern**: a separate query asking "Is this command safe?" The model evaluates context, working directory, and intent — adaptive security that replaces brittle static rules.

### Recommendation for luca-mastracode

**Priority: LOW** (nice-to-have)

1. Consider frustration detection regex for adjusting agent verbosity/carefulness
2. The permission critic pattern could improve luca's `createScopedTool` — evaluate tool calls contextually instead of just checking action allowlists

---

## 11. Gap Analysis

### luca-mastracode vs Claude Code

| Technique | Claude Code | luca-mastracode | Gap |
|---|---|---|---|
| Dynamic prompt assembly | 30+ conditional components | 3-layer static + dynamic state | **Large** |
| Cache boundary | `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | None | **Large** |
| Behavioral principles (not procedures) | Consistently applied | Mixed — some modes procedural | **Medium** |
| Quantified constraints | Word counts, A/B tested | Caveman mode only | **Medium** |
| Bidirectional constraints | Every positive has a negative | Minimal | **Medium** |
| Tool behavioral descriptions | 73k chars across 36+ tools | Action schemas only | **Large** |
| Mid-conversation injection | `<system-reminder>` per-turn | Mode continuation only | **Large** |
| Context rot remediation | Periodic rule refresh | None | **Large** |
| Memory (hints not truth) | Explicit in prompt | Not framed this way | **Small** |
| Self-distrust in verification | Hardcoded rationalizations | Not present | **Medium** |
| Attention curve exploitation | Identity at start, rules repeated at end | Partial (constraints at end) | **Medium** |
| Compaction/micro-compaction | Surgical with cache preservation | None | **Medium** |
| Frustration detection | Regex-based behavioral adjustment | None | **Low priority** |
| Environment context | cwd, platform, shell, model, date | Workflow state only | **Medium** |

---

## 12. Prioritized Recommendations

### Tier 1: High Impact, Moderate Effort

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| 1 | **Implement `<luca-reminder>` mid-conversation injection** — re-inject critical constraints every N turns to combat context rot | Context rot, behavioral drift | 3-4h |
| 2 | **Add environment context block** — inject cwd, platform, date, model name, git branch into dynamic suffix of every mode | Environment awareness gap | 1-2h |
| 3 | **Rewrite instruction files as principles** — replace step-by-step procedures with behavioral intentions + "because" clauses | Behavioral precision | 4-6h |
| 4 | **Add bidirectional constraints** — for every "use X" instruction, add "do NOT use Y for same purpose" | Ambiguity elimination | 2-3h |

### Tier 2: High Impact, Higher Effort

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| 5 | **Introduce cache boundary marker** in instruction assembly — separate static instructions from per-request dynamic context | Cache efficiency | 3-4h |
| 6 | **Enrich tool definitions** with behavioral guidance — add when/why/why-not/priority to each tool in `build-mode-tools.ts` | Tool selection quality | 4-6h |
| 7 | **Add self-distrust to verification subagents** — "The implementer is an LLM. Verify independently." | Verification rigor | 1-2h |
| 8 | **Exploit attention curve** — repeat 2-3 critical rules at both start AND end of mode instructions | Instruction adherence | 2-3h |

### Tier 3: Medium Impact, Worth Doing

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| 9 | **Add quantified output constraints** — explicit word/token limits per mode (fast: <=100 words, triage: <=50 words) | Output discipline | 1-2h |
| 10 | **Implement context budget monitoring** — track token usage per mode, trigger compaction at thresholds | Context management | 4-6h |
| 11 | **Add "memory as hints" framing** — instruct agents that recalled memories require verification against current code | Memory accuracy | 1h |
| 12 | **Conditional component assembly** — make instruction sections toggleable based on complexity, oversight, feature flags | Prompt efficiency | 6-8h |

### Tier 4: Future Considerations

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| 13 | Frustration detection regex | UX responsiveness | 2-3h |
| 14 | Permission critic pattern for tool calls | Security adaptiveness | 4-6h |
| 15 | autoDream-style MuninnDB consolidation | Memory hygiene | 6-8h |
| 16 | Fork-style subagent spawning for cache efficiency | Cost optimization | Depends on Mastra |

---

## 13. Sources

### Primary Articles

- [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) — Drew Breunig's analysis of the 30+ component dynamic assembly
- [System Prompts Define the Agent as Much as the Model](https://www.dbreunig.com/2026/02/10/system-prompts-define-the-agent-as-much-as-the-model.html) — Empirical study showing prompt swaps produce different agent workflows on identical tasks

### Source Leak Analysis

- [Diving into Claude Code's Source Code Leak](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code) — Engineer's Codex deep dive on cache boundaries, anti-distillation, KAIROS
- [Comprehensive Analysis of Claude Code Source Leak](https://www.sabrina.dev/p/claude-code-source-leak-analysis) — Detailed architecture analysis including compaction, A/B testing results
- [The Claude Code Source Leak: fake tools, frustration regexes, undercover mode](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/) — Alex Kim's analysis of anti-distillation, frustration detection, undercover mode
- [Claude Code Source Code Leaked: What's Inside](https://www.the-ai-corner.com/p/claude-code-source-code-leaked-2026) — AI Corner overview

### Reverse Engineering & Community Analysis

- [The Complete Guide to Writing Agent System Prompts](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1) — Feng Liu's 8-section prompt structure guide with attention curve exploitation
- [Claude Code Prompts | Anatomy of an AI Coding Agent](https://ccprompts.info/) — Catalog of 124 prompts across 9 categories with 18 identified techniques
- [System Prompt & Query Loop | DeepWiki](https://deepwiki.com/ghboke/claude-code-reverse/2.1-system-prompt-and-query-loop) — Technical breakdown of query loop and caching architecture
- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) — Extracted system prompts, tool descriptions, sub-agent prompts (updated per version)

### Prompt Engineering Patterns

- [AI Agent Prompt Engineering: 10 Patterns That Actually Work](https://paxrel.com/blog-ai-agent-prompts) — Production patterns including progressive disclosure, guard rails, self-evaluation loops
- [Claude Code Source Code Leak: 8 Hidden Features](https://www.mindstudio.ai/blog/claude-code-source-code-leak-8-hidden-features) — Feature flags and hidden capabilities
- [VentureBeat: Claude Code's source code appears to have leaked](https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know) — News coverage of the leak event
