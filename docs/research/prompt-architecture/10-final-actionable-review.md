# Final Actionable Review: Prompt Architecture Improvements for luca-mastracode

**Research Date:** 2026-04-13
**Status:** Complete — Ready for Implementation
**Input:** 10 research documents, 5 specialized review agents, full codebase audit

---

## Executive Summary

Five review agents independently audited the luca-mastracode codebase against 10 research documents covering Claude Code's prompt architecture. They found **zero self-distrust in verification**, **zero anti-sycophancy directives**, a **16-33x deficit in tool description depth**, **critical constraints buried in the attention trough**, and **no defense against context rot**. This document consolidates all findings into a prioritized action plan.

The math is stark: a typical MODERATE pipeline spans ~25 agent turns. At 95% per-step reliability, that yields only ~28% combined success. Every improvement below targets that per-step reliability number.

---

## Table of Contents

1. [Priority Matrix](#1-priority-matrix)
2. [Sprint 1: Immediate Wins (1-2 days)](#2-sprint-1-immediate-wins)
3. [Sprint 2: Instruction Overhaul (2-3 days)](#3-sprint-2-instruction-overhaul)
4. [Sprint 3: Tool Enrichment (2-3 days)](#4-sprint-3-tool-enrichment)
5. [Sprint 4: Infrastructure (5-8 days)](#5-sprint-4-infrastructure)
6. [Sprint 5: Advanced Architecture (8-12 days)](#6-sprint-5-advanced-architecture)
7. [Full Change Registry](#7-full-change-registry)

---

## 1. Priority Matrix

Every recommendation from all 5 review agents, deduplicated and ranked:

| Rank | Change | Category | Effort | Impact | Sprint |
|------|--------|----------|--------|--------|--------|
| 1 | Add self-distrust to verifier | Subagent | 1h | CRITICAL | 1 |
| 2 | Add anti-sycophancy to reviewer | Subagent | 1h | CRITICAL | 1 |
| 3 | Move critical constraints to primacy zone | Instructions | 2h | HIGH | 1 |
| 4 | Add recency-zone `## Reminder` to all files | Instructions | 2h | HIGH | 1 |
| 5 | Dual-inject HARD_CONSTRAINTS (start + end) | Instructions | 1h | HIGH | 1 |
| 6 | Add "because" clauses to HARD_CONSTRAINTS | Instructions | 1h | HIGH | 1 |
| 7 | Add active synthesis directives to orchestrators | Instructions | 1h | HIGH | 1 |
| 8 | Add quantified output constraints to all modes | Instructions | 2h | HIGH | 2 |
| 9 | Add bidirectional tool constraints to all modes | Instructions | 2h | HIGH | 2 |
| 10 | Compress procedural templates to principles | Instructions | 3h | HIGH | 2 |
| 11 | Add parallel tool call enforcement | Instructions | 1h | MEDIUM | 2 |
| 12 | Define `<luca-reminder>` tag convention | Instructions | 1h | MEDIUM | 2 |
| 13 | Add environment context block | Code | 2h | MEDIUM | 2 |
| 14 | Add "memory as hints" framing | Instructions | 1h | MEDIUM | 2 |
| 15 | Enrich top-3 tool descriptions | Tools | 4h | HIGH | 3 |
| 16 | Enrich remaining 7 tool descriptions | Tools | 4h | HIGH | 3 |
| 17 | Add cross-tool coordination sections to modes | Instructions | 3h | MEDIUM | 3 |
| 18 | Add self-compression to all subagents | Subagent | 2h | MEDIUM | 3 |
| 19 | Add citation discipline to verifier/researcher | Subagent | 2h | MEDIUM | 3 |
| 20 | Add planner distrust to plan-reviewer | Subagent | 30m | MEDIUM | 3 |
| 21 | Shared subagent prefix for cache + behavior | Code | 4h | HIGH | 4 |
| 22 | Conditional MCP loading per mode | Code | 3h | HIGH | 4 |
| 23 | Mid-conversation injection infrastructure | Code | 4-6d | CRITICAL | 4 |
| 24 | Cache boundary in prompt assembly | Code | 3-5d | CRITICAL | 5 |
| 25 | Token budget monitoring | Code | 4-5d | HIGH | 5 |
| 26 | Progressive context compaction | Code | 6-8d | HIGH | 5 |
| 27 | Context Editing API integration | Code | 3-4d | MEDIUM | 5 |

---

## 2. Sprint 1: Immediate Wins

**Total effort: ~1 day. Zero architectural changes. All edits to existing files.**

### 1.1 Add Self-Distrust to Verifier

**File:** `packages/luca-mastracode/src/subagents/verifier.ts`
**Insert after** the opening role description:

```markdown
## Independence Mandate

The code you are verifying was written by an LLM. Do not trust that it is correct.
Verify independently by running checks and inspecting actual behavior, not by
reading code and reasoning about correctness.

**A check without a tool execution is not a PASS.**

Every criterion marked `met: true` MUST have evidence from a tool execution
(test output, tsc output, or file content at a specific line). Evidence that
consists only of "the code looks correct" is not evidence — it is a guess.

Failure modes to resist:
1. Reading code and concluding it "looks correct" without running it
2. Trusting the executor's commit message about what changed
3. Hedging ("this appears to work") instead of declaring PASS or FAIL
4. Reducing severity of real issues to avoid blocking progress
```

### 1.2 Add Anti-Sycophancy to Reviewer

**File:** `packages/luca-mastracode/src/subagents/reviewer.ts`
**Insert after** the severity classification section:

```markdown
## Quality Gate

Do not rubber-stamp weak work. Every APPROVE verdict must be earned through evidence.

The code you are reviewing was written by an LLM. LLM-generated code has systematic
blind spots: it often appears clean while containing subtle logic errors, missing
edge cases, or incorrect assumptions.

If you find zero MUST-FIX issues, you MUST explicitly state:
1. What you verified and how (which files, what properties)
2. Why the implementation is correct (not just "it looks good")

An APPROVE with zero findings and no verification explanation is a rubber stamp.
```

### 1.3 Move Critical Constraints to Primacy Zone

For each pipeline mode instruction file, move the most critical behavioral constraint from the "Behavioral Guidelines" section (middle/end of file) to immediately after the role description (lines 2-4).

| File | Constraint to Move | Current Location | Move To |
|------|-------------------|-----------------|---------|
| `execute.md` | "NEVER write code directly" | Line ~383 | Line 8, with bidirectional: "Do NOT use string_replace_lsp or write_file yourself" |
| `review.md` | "NEVER edit files" | Line ~267 | Line 7, with bidirectional: "Do NOT use string_replace_lsp, write_file, or execute_command" |
| `research.md` | "Read-only" | Line ~190 | Line 9, with bidirectional: "Do NOT use string_replace_lsp, write_file, or execute_command for code modifications" |
| `architect.md` | "Discussion is never skipped" | Line ~302 | Line 10 |
| `finalize.md` | "Be thorough in gap detection" | Line ~304 | Line 8, quantified: "Check every task in PLAN.md. Report exact completed/total ratio." |

### 1.4 Add Recency-Zone Reminders

Add a `## Reminder` section at the very end of every instruction file. Each reminder repeats the 2-3 most critical constraints for that mode. Examples:

**triage.md:**
```markdown
## Reminder
You MUST call `workflowState(action: "switch-mode")` before your turn ends. Do NOT create tasks, modify files, or run commands.
```

**execute.md:**
```markdown
## Reminder
NEVER write code directly — delegate to subagents. Run checks after every wave. If convergence stalls, stop. One commit per task.
```

**review.md:**
```markdown
## Reminder
NEVER edit files. Maximum 5 MUST-FIX items. Review against the plan, not personal preferences.
```

(Similar for all 10 files — see instruction audit for per-file text.)

### 1.5 Dual-Inject HARD_CONSTRAINTS

**File:** `packages/luca-mastracode/src/index.ts`

Currently HARD_CONSTRAINTS are only appended at the end via `getAgentConstraints()`. Change to **prepend AND append** — exploiting both primacy and recency peaks.

### 1.6 Add "Because" Clauses to HARD_CONSTRAINTS

**File:** `packages/luca-mastracode/src/index.ts` (lines 160-163)

```markdown
- **Never use temp files as an edit workaround** because it bypasses the harness's change
  tracking and makes modifications invisible to the review and verification pipeline.
- **Never shell out for file edits** because execute_command output is not tracked by
  edit tools, so changes cannot be verified, reviewed, or rolled back.
- **Respect mode boundaries** because mode restrictions separate concerns — a read-only
  mode that secretly writes files corrupts the verification guarantee of subsequent phases.
```

### 1.7 Add Active Synthesis Directives to Orchestrators

**File:** `packages/luca-mastracode/src/instructions/execute.md` — add to Behavioral Guidelines:
```markdown
- **Synthesize, don't relay.** When subagents return results, YOU must understand them.
  Never write "based on the reviewer's findings." Resolve conflicts between subagents.
  If two reviewers contradict, investigate — don't average.
```

**File:** `packages/luca-mastracode/src/instructions/review.md` — add to Behavioral Guidelines:
```markdown
- **Own the verdict.** You are the decision-maker, not a relay. If all 4 reviewers
  approve but you see an issue, flag it. Never defer understanding to subagents.
```

---

## 3. Sprint 2: Instruction Overhaul

**Total effort: ~2-3 days. Instruction file edits only.**

### 2.1 Quantify All Qualitative Directives

| File | Current (qualitative) | Proposed (quantified) |
|------|----------------------|----------------------|
| `fast.md` | "Under 200 words" | "Under 100 words. <=25 words between tool calls." |
| `triage.md` | "Be concise" | "<=75 words. Classification + 1-sentence rationale + next mode." |
| `architect.md` | "Be thorough but not verbose" | "<=3 sentences per task. <=150 lines total PLAN.md." |
| `execute.md` | "Fail fast, fix fast" | "Run checks within 1 tool call of wave completion. Stalled for 2+ iterations = stop." |
| `research.md` | "Don't over-research" | "MODERATE: <=10 tool calls. COMPLEX: <=20. CRITICAL: <=30." |
| `research.md` | "Time-box" | "Synthesis <=200 lines for RESEARCH.md." |
| `review.md` | "Don't nitpick" | "Maximum 5 MUST-FIX items. MUST-FIX = correctness bugs, security, missing requirements ONLY." |
| `discuss.md` | "Keep responses focused" | "Under 300 words per turn. <=2 clarifying questions per response." |
| `finalize.md` | "Be thorough in gap detection" | "Check every task in PLAN.md. Report exact completed/total ratio." |

### 2.2 Add Bidirectional Tool Constraints

Add a `## Tool Discipline` section to each pipeline mode instruction file. Pattern:

```markdown
## Tool Discipline
- Use `runChecks` for all automated checks. Do NOT run tsc/eslint/tests directly.
- Use `workflowState` for all state reads. Do NOT read luca-state.json directly.
- Use `manageTodos` for backlog operations. Do NOT create todo files directly.
```

Triage and research modes need explicit mutation-tool blocklists:
```markdown
Do NOT use `manageTodos(action: "add")`, `writePlanningFile`, `string_replace_lsp`,
`write_file`, or `execute_command`. The only mutation tools permitted are
`workflowState`, `classifyComplexity`, and `pipelineLock`.
```

### 2.3 Compress Procedural Templates to Principles

Compress across all pipeline instruction files. Key targets:

| File | Section | Current Lines | Compressed To | Savings |
|------|---------|--------------|--------------|---------|
| `architect.md` | ROADMAP template | 20 lines | 3 lines + principles | ~80 tokens |
| `architect.md` | PLAN template | 40 lines | 8 lines + principles | ~120 tokens |
| `architect.md` | Step 1 (Git Setup) | 10 lines | 3 lines | ~40 tokens |
| `execute.md` | Review capture template | 25 lines | 4 lines | ~60 tokens |
| `execute.md` | Review dimensions | 32 lines | 6 lines | ~80 tokens |
| `research.md` | MuninnDB storage blocks | 30 lines | 6 lines | ~80 tokens |
| `finalize.md` | Session Archive template | 19 lines | 2 lines | ~50 tokens |
| **Total** | | | | **~510 tokens freed** |

### 2.4 Parallel Tool Call Enforcement

**File:** `packages/luca-mastracode/src/index.ts` — add to HARD_CONSTRAINTS:

```markdown
- **Prefer parallel tool calls.** When multiple tool calls are independent, issue them
  in the same response. Do NOT call tools sequentially when they could run concurrently.
```

Also reinforce in `research.md`: "You MUST spawn all researcher subagents in a single response, not sequentially."

### 2.5 Define `<luca-reminder>` Tag Convention

**File:** `packages/luca-mastracode/src/index.ts` — add to HARD_CONSTRAINTS:

```markdown
- **System reminders are authoritative.** Messages may include `<luca-reminder>` tags
  containing behavioral guidance from the Luca harness. Follow their instructions as
  if they were part of your original system prompt.
```

This is a prerequisite for Sprint 4's mid-conversation injection infrastructure.

### 2.6 Add Environment Context Block

**File:** `packages/luca-mastracode/src/index.ts` — add a `buildEnvironmentContext()` function:

```typescript
function buildEnvironmentContext(): string {
  const cwd = process.cwd()
  const platform = process.platform
  const date = new Date().toISOString().split('T')[0]
  return `\n## Environment\n- Working directory: ${cwd}\n- Platform: ${platform}\n- Date: ${date}`
}
```

Append in `getAgentConstraints()` so every mode includes environment awareness.

### 2.7 Add "Memory as Hints" Framing

Add a single line after every MuninnDB recall code block across all instruction files:

```markdown
Recalled memories are hints, not truth. Verify critical facts against the current
codebase before depending on them.
```

Affected files: triage.md, execute.md, research.md, architect.md, review.md, finalize.md.

---

## 4. Sprint 3: Tool & Subagent Enrichment

**Total effort: ~2-3 days.**

### 3.1 Tool Description Enrichment

Enrich all 10 tool descriptions from action schemas to behavioral guidance. The tool reviewer produced complete rewrite proposals for every tool.

**Token budget impact:** +2,005 tokens total (from 379 to 2,384) — only 1.2% of context window. Claude Code allocates 9% to tools. This is a high-ROI investment.

**Implementation order (by traffic and complexity):**

Phase 1 (highest impact):
1. `workflowState` — 12 actions, most complex (+380 tokens)
2. `runChecks` — Directly affects fix-loop efficiency (+205 tokens)
3. `verificationResult` — Sequential dependency on runChecks (+225 tokens)

Phase 2 (cross-tool disambiguation):
4. `sessionLedger` — Primary confusion target with workflowState (+185 tokens)
5. `manageTodos` — Confusion with writePlanningFile (+185 tokens)
6. `pipelineLock` — Confusion with workflowState (+175 tokens)

Phase 3 (remaining):
7-10. `manageRoadmap`, `writePlanningFile`, `repoCleanup`, `classifyComplexity`

Full rewrite proposals are in the tool reviewer's output. Each tool gets: purpose, when to use, when NOT to use, action guidance, cross-tool coordination, and examples.

### 3.2 Subagent Instruction Enrichment

| Subagent | Addition | Priority | Effort |
|----------|----------|----------|--------|
| verifier | Self-distrust + failure modes (Sprint 1) | Done in Sprint 1 | — |
| reviewer | Anti-sycophancy + evidence requirement (Sprint 1) | Done in Sprint 1 | — |
| executor | Self-compression + verification awareness | MEDIUM | 30m |
| plan-reviewer | Planner distrust | MEDIUM | 30m |
| researcher | Self-compression + skeptical recall + citation format | MEDIUM | 30m |
| discussion | Skeptical memory for MuninnDB | LOW | 15m |
| learner | Self-skepticism | LOW | 15m |
| shadow-scanner | No changes needed | — | — |
| planner | No changes needed (well-constrained by design) | — | — |

### 3.3 Cross-Tool Coordination Sections

Add a `## Tool Usage Priority` section to each pipeline mode instruction file listing tools in order of typical usage, with explicit disambiguation:

```markdown
## Tool Usage Priority (Execute Mode)
1. workflowState("read") — Always first
2. workflowState("start-phase") — Once per phase
3. runChecks — After each code change
4. workflowState("record-iteration") — After each fix-check cycle
5. verificationResult("write") — After final check
6. workflowState("complete-phase") — To finalize

Do NOT use sessionLedger during execute. Do NOT use manageTodos("add") during execute.
```

---

## 5. Sprint 4: Infrastructure

**Total effort: ~5-8 days. Requires code changes to index.ts and new modules.**

### 4.1 Shared Subagent Prefix

**File:** New `packages/luca-mastracode/src/subagents/shared-prefix.ts`

Extract a shared behavioral prefix (~300-400 tokens) prepended to all 9 subagents. Contains: universal constraints, self-distrust, anti-sycophancy, citation requirements, self-compression directive. This is also the foundation for subagent cache sharing.

### 4.2 Conditional MCP Loading

**File:** `packages/luca-mastracode/src/index.ts` (line ~271)

Only inject MuninnDB tools into modes that use memory:

```typescript
const MEMORY_MODES = new Set(['luca:4-execute', 'luca:6-finalize', 'luca:discuss', 'build'])
const mcpTools = MEMORY_MODES.has(currentModeId)
  ? (mcpManagerRef.current?.getTools() ?? {})
  : {}
```

**Savings:** ~15,000+ tokens per turn in non-memory modes (fast, triage, plan, research, architect, review).

### 4.3 Mid-Conversation Injection Infrastructure

**Files:** New `packages/luca-mastracode/src/context-refresher.ts`

Implement a `ContextRefresher` that evaluates conditions at harness lifecycle events and injects `<luca-reminder>` behavioral reminders into the message stream:

- **Turn-counter trigger**: Every 15 tool calls, inject critical-tier constraints (~200 tokens)
- **Token-threshold trigger**: At 30K estimated tokens, inject mode-specific behavioral rules
- **Post-compaction trigger**: Full behavioral refresh after any context compression
- **Phase-boundary trigger**: Re-inject at every mode transition (extends existing continuation messages)

Content tiers:
1. **Critical** (always inject): HARD_CONSTRAINTS, mode boundaries
2. **Mode-specific** (inject when mode-relevant): Core behavioral rules for current mode
3. **Tool guidance** (inject when tool-relevant): Priority ordering reminders

---

## 6. Sprint 5: Advanced Architecture

**Total effort: ~8-12 days. Major architectural changes.**

### 5.1 Cache Boundary in Prompt Assembly

Split prompt assembly into two blocks with explicit cache breakpoints:

```
BLOCK 1 — Static Prefix (cacheable, 1-hour TTL)
├── Mode instruction .md
├── HARD_CONSTRAINTS
├── AlwaysApply rules
└── cache_control: { type: "ephemeral" }

BLOCK 2 — Dynamic Suffix (per-request, 5-minute TTL)
├── Workflow state context
├── Environment info
├── MCP server instructions
└── cache_control: { type: "ephemeral" }
```

Requires understanding Mastra's internals for how `instructions` maps to the Anthropic `system` parameter. Start with Phase A (pure code separation of static vs dynamic) which has value regardless of API support.

### 5.2 Token Budget Monitoring

New `packages/luca-mastracode/src/token-budget.ts` with threshold-based interventions:

| Threshold | % of Context | Action |
|-----------|-------------|--------|
| INJECT_REMINDERS | 30% | Start context rot remediation |
| OBSERVATION_MASK | 50% | Replace old tool results with placeholders |
| WARNING | 65% | Alert user, suggest mode boundary |
| COMPACTION | 80% | Trigger LLM summarization |
| BLOCK | 90% | Block new tool calls |

### 5.3 Progressive Context Compaction

3-level compression pipeline:

1. **Tool Result Budgeting** (zero cost): Cap tool results at 50K chars, persist full output to disk, keep 2KB preview in context
2. **Observation Masking** (zero cost): Replace older tool results with `[Result cleared]`. JetBrains research shows this outperforms LLM summarization in 4/5 configurations — 2.6% higher solve rates, 52% cheaper
3. **LLM Summarization** (expensive, last resort): Fork Haiku subagent, chain-of-thought then strip reasoning, circuit breaker at 3 consecutive failures

---

## 7. Full Change Registry

Every file touched across all sprints:

| File | Sprint | Changes |
|------|--------|---------|
| `src/index.ts` | 1,2,4 | Dual HARD_CONSTRAINTS injection, "because" clauses, parallel enforcement, luca-reminder convention, environment context, conditional MCP loading |
| `src/subagents/verifier.ts` | 1 | Self-distrust + failure modes |
| `src/subagents/reviewer.ts` | 1 | Anti-sycophancy + evidence requirement |
| `src/subagents/executor.ts` | 3 | Self-compression + verification awareness |
| `src/subagents/plan-reviewer.ts` | 3 | Planner distrust |
| `src/subagents/researcher.ts` | 3 | Self-compression + skeptical recall |
| `src/subagents/discussion.ts` | 3 | Skeptical memory |
| `src/subagents/learner.ts` | 3 | Self-skepticism |
| `src/instructions/triage.md` | 1,2 | Primacy move, recency reminder, quantified output, bidirectional tools, template compression |
| `src/instructions/execute.md` | 1,2,3 | Primacy move, recency reminder, quantified constraints, bidirectional tools, synthesis directive, template compression, tool priority |
| `src/instructions/review.md` | 1,2,3 | Primacy move, recency reminder, quantified nitpick limit, bidirectional tools, synthesis directive, tool priority |
| `src/instructions/architect.md` | 1,2 | Primacy move, recency reminder, quantified plan limits, template compression |
| `src/instructions/research.md` | 1,2 | Primacy move, recency reminder, quantified depth, template compression, memory-as-hints |
| `src/instructions/finalize.md` | 1,2 | Primacy move, recency reminder, quantified gap detection, template compression |
| `src/instructions/build.md` | 2 | Quantified output, bidirectional tools, recency reminder |
| `src/instructions/fast.md` | 2 | Inter-tool verbosity limit, recency reminder |
| `src/instructions/plan.md` | 2 | Quantified plan output, recency reminder |
| `src/instructions/discuss.md` | 2 | Quantified response length, recency reminder |
| `rules/caveman.md` | — | No changes needed |
| `rules/pr-title-format.md` | 2 | "Because" clause |
| `src/tools/*.ts` (10 files) | 3 | Full description enrichment |
| `src/subagents/shared-prefix.ts` | 4 | New file: shared behavioral prefix |
| `src/context-refresher.ts` | 4 | New file: mid-conversation injection |
| `src/token-budget.ts` | 5 | New file: token monitoring |
| `src/context-pipeline.ts` | 5 | New file: compaction pipeline |

---

## Measurement Plan

To validate these changes, track:

1. **Per-step reliability**: Does the verifier catch more issues? Does the reviewer produce fewer rubber-stamp approvals?
2. **Tool selection accuracy**: After tool enrichment, do agents use the correct tool on the first attempt more often?
3. **Context utilization**: After conditional MCP loading and compaction, how much context is available for conversation?
4. **Token efficiency**: After template compression and instruction trimming, what is the per-mode instruction token count?
5. **Pipeline completion rate**: After all sprints, does the end-to-end pipeline complete successfully more often?

---

## Sources

This document synthesizes findings from:
- 10 research documents in `docs/research/prompt-architecture/` (00-09)
- 5 independent review agents auditing: quick wins, architecture, instruction files, tool definitions, subagent patterns
- ~185 unique sources including academic papers, Anthropic documentation, Claude Code source analysis, and community reverse-engineering
