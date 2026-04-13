# Prompt Architecture Research

Deep research into how Claude Code and other AI coding agents construct system prompts, manage context, and coordinate multi-agent workflows. Conducted to identify techniques that should be adopted in luca-mastracode.

**Research Date:** 2026-04-13

---

## Documents

| # | Document | Focus | Key Finding |
|---|---|---|---|
| 00 | [Overview](00-overview.md) | Full gap analysis: Claude Code vs luca-mastracode | 16 prioritized recommendations across 4 tiers |
| 01 | [Cache Boundary Design](01-cache-boundary-design.md) | SYSTEM_PROMPT_DYNAMIC_BOUNDARY, micro-compaction, Anthropic cache API | 85% latency reduction, 90% cost reduction; 5-level compression pipeline |
| 02 | [Context Rot & Injection](02-context-rot-and-injection.md) | system-reminder, behavioral refresh, "lost in the middle" | 29-60pp degradation at 32K tokens; 95% per-step reliability = 36% over 20 steps |
| 03 | [Tool Definition Engineering](03-tool-definition-engineering.md) | 73k chars of tool guidance, priority ordering, critic pattern | ~79% of Claude Code's prompt budget is tool definitions |
| 04 | [Multi-Agent Coordination](04-multi-agent-coordination.md) | Fork/teammate/worktree, self-distrust, coordinator prompts | 92% prompt reuse via fork model; academic debate research (ICML/ICLR/NeurIPS) |
| 05 | [Attention Curves & Structure](05-attention-curves-and-structure.md) | U-shaped attention, formatting impact, section ordering | Structural formatting has up to 40% impact; repetition wins 47/70 tasks |
| 06 | [Comparative Agent Analysis](06-comparative-agent-analysis.md) | 12 agents compared: Claude Code, Cursor, Codex, Gemini, Devin, etc. | SWE-Agent's constrained action space improved SWE-Bench by 10.7 points |
| 07 | [Context Compaction & Memory](07-context-compaction-and-memory.md) | 5 compaction strategies, autoDream, token budgeting | Observation masking outperforms LLM summarization (2.6% higher, 52% cheaper) |
| 08 | [Advanced Patterns & Hidden Systems](08-advanced-patterns-and-hidden-systems.md) | KAIROS daemon, ULTRAPLAN, Magic Docs, YOLO classifier, IPC, gamification | Magic Docs self-updating pattern; YOLO risk classifier replaces static allowlists |
| 09 | [Instruction Budget & Prompt Economics](09-instruction-budget-and-prompt-economics.md) | Token budgets, hooks vs instructions, CLAUDE.md optimization, MCP overhead | 5 MCP servers burn 60K tokens before first message; instructions are a finite budget |
| **10** | **[Final Actionable Review](10-final-actionable-review.md)** | **Synthesized action plan from 5 review agents** | **27 ranked changes across 5 sprints; zero self-distrust and zero anti-sycophancy found in current codebase** |

## Highest-Impact Findings

1. **Mid-conversation injection** is the single most impactful missing capability in luca-mastracode. Context rot degrades instruction adherence by 29-60 percentage points at 32K tokens (Adobe Research). Claude Code combats this with 37 system-reminders across 5 domains.

2. **Tool definitions ARE the prompt.** Claude Code allocates ~79% of its prompt token budget to tool descriptions. Our current tool definitions are action schemas only — no behavioral guidance, no priority ordering, no negative examples.

3. **Cache-aware prompt splitting** saves 85% latency and 90% cost. The static/dynamic boundary is not an optimization — it's a fundamental architectural decision that enables fork-model subagent spawning at near-zero marginal cost.

4. **Structural formatting matters more than emphasis markers.** Gao et al. found formatting structure (headers, XML tags) has up to 40% impact on task completion, while emphasis markers (IMPORTANT, CRITICAL) have inconsistent effects.

5. **Observation masking beats LLM summarization.** JetBrains Research found replacing old tool outputs with placeholders outperforms full summarization in 4/5 configurations — 2.6% higher solve rates and 52% cost reduction.

6. **Self-distrust in verification** is essential. Claude Code's verifier is explicitly instructed: "The implementer is an LLM. Verify independently." Without this, verification agents rubber-stamp AI-generated output.

7. **Magic Docs pattern** for self-updating documentation. Idle-triggered subagents scoped to a single file keep documentation current automatically. Directly applicable to `.planning/` artifact maintenance.

8. **YOLO risk classifier** replaces static permission allowlists with context-aware risk assessment. Operations are classified as LOW/MEDIUM/HIGH risk, with LOW getting automatic approval — adaptive security rather than brittle rules.

9. **Instructions are a finite budget, not a document.** 5 MCP servers consume ~60K tokens before the first user message. CLAUDE.md should be ~100 prescriptive constraints, not a 300-line doc. Deterministic rules should move to hooks (zero-token enforcement) and leave instructions for judgment-dependent guidance only.

10. **Quantified constraints outperform qualitative directives.** "Keep responses under 100 words" is more enforceable than "be concise." The phrasing hierarchy: quantified limits > hard constraints (NEVER) > bidirectional (Use X, NOT Y) > conditional > soft > principles.

## Source Count

~185 unique sources cited across all documents, including:
- 15+ academic papers (NeurIPS, ICML, ICLR, arXiv)
- Anthropic official documentation
- Claude Code source leak analysis (8+ independent analyses)
- Reverse-engineering projects (Piebald-AI, ccprompts.info, DeepWiki)
- Industry blog posts and technical write-ups
- Curated resource lists (awesome-claude-code-postleak-insights)
