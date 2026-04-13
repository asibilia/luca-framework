# Multi-Agent Prompt Coordination in AI Coding Systems

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How coordinator agents manage workers, how verification agents maintain independence, and how sub-agent prompts are structured -- with implementation guidance for luca-mastracode

---

## Executive Summary

Multi-agent coordination in AI coding systems has converged on a shared set of architectural patterns: coordinator-worker hierarchies, cache-efficient subagent spawning, and adversarial verification loops. Claude Code's leaked source (March 2026) provides the most detailed public record of these patterns, revealing that orchestration behavior is defined entirely in natural language prompts rather than branching code. This document catalogs the coordination patterns across Claude Code, Cursor, Codex, Devin, and academic research, then maps each to concrete recommendations for luca-mastracode's 9-subagent architecture.

---

## 1. Claude Code's Multi-Agent Architecture

### 1.1 Coordinator Mode

Claude Code's coordinator mode transforms a single agent into a lead that spawns, directs, and manages multiple worker agents in parallel. The orchestration is prompt-driven: `coordinatorMode.ts` implements multi-agent work as system prompt instructions, meaning behavior updates ship without code changes.

The coordinator's system prompt contains two foundational quality gates:

1. **"Do not rubber-stamp weak work."** -- Forces the coordinator to critically evaluate worker output rather than passively relaying it.
2. **"Never write 'based on your findings' -- these phrases delegate understanding to workers instead of doing it yourself."** -- Prevents the coordinator from becoming a passive relay. It must synthesize and own the conclusions.

The coordinator follows a four-phase workflow: **Research -> Synthesis -> Implementation -> Verification**. Workers operate in isolated contexts with restricted tool permissions and communicate via XML-structured task notifications. A shared scratchpad directory enables data exchange without polluting the coordinator's context.

### 1.2 Worker Instructions

Worker agents receive focused directives from the coordinator. The leaked `system-prompt-worker-instructions.md` reveals a five-step protocol:

1. **Simplify** -- invoke the simplify skill to clean up changes
2. **Run unit tests** -- execute the project's test suite
3. **Test end-to-end** -- follow the coordinator's e2e recipe
4. **Commit and push** -- create a PR with `gh pr create`
5. **Report** -- end with `PR: <url>` or `PR: none -- <reason>`

Workers compress their own results before returning them to the coordinator, preventing context bloat while maintaining information fidelity. This is a critical architectural insight: sub-agents handle their own summarization rather than dumping raw output upstream.

### 1.3 Agent Teams (Teammate Model)

Released February 2026, Agent Teams extend beyond single-session subagents to coordinate multiple independent Claude Code instances. One session acts as team lead; teammates work independently with their own context windows and communicate directly with each other via a `SendMessage` tool.

Key architectural components:

| Component     | Role                                                        |
|:------------- |:----------------------------------------------------------- |
| **Team lead** | Creates the team, spawns teammates, coordinates work        |
| **Teammates** | Separate Claude instances with independent context windows  |
| **Task list** | Shared work items with dependency tracking and file locking |
| **Mailbox**   | Message delivery system with broadcast capability           |

Teams use hooks for quality enforcement: `TeammateIdle` (runs when a teammate finishes), `TaskCreated`, and `TaskCompleted` can reject work with feedback, keeping teammates working until quality gates pass.

---

## 2. The Three Execution Models

Claude Code offers three distinct models for spawning sub-work, each with different trade-offs:

### 2.1 Fork

A forked subagent inherits the parent context as a byte-identical copy. This is the cache-efficient model -- because the API request prefix is identical, all forked workers share the same KV cache entry (90% cache discount on shared context). The leaked fork usage guidelines reveal:

- **"Don't peek"** -- never read a fork's output file mid-flight; wait for the completion notification
- **"Don't race"** -- never fabricate or predict fork results; if asked before notification arrives, acknowledge the fork is still running
- **Prompt focus** -- write directives about what to do, not background context (inherited automatically)
- **Cache preservation** -- omit the `model` parameter to preserve prefix sharing

Fork is ideal for open-ended research questions, parallel implementation work, and any task where intermediate tool output is not worth keeping in the parent's context. Claude Code's prompt reuse rate across forks is reported at 92%.

### 2.2 Teammate

Teammates are fully independent Claude Code sessions with their own context windows. Unlike forks, teammates can message each other directly without going through the lead. They share a task list with file-locking for safe concurrent claiming.

Teammates are appropriate when workers need to share findings, challenge each other's conclusions, and self-coordinate. The cost is higher -- each teammate consumes tokens independently -- but the communication model enables patterns like adversarial debugging where teammates actively try to disprove each other's theories.

### 2.3 Worktree

Worktrees provide file-system isolation via `git worktree`. Each worker gets its own branch, files, and git index, eliminating merge conflicts entirely. This model is best for parallel implementation on the same codebase where workers would otherwise overwrite each other's changes.

### Trade-off Summary

| Dimension            | Fork              | Teammate           | Worktree           |
|:-------------------- |:----------------- |:------------------- |:------------------ |
| Context isolation    | Shared prefix     | Fully independent   | Fully independent  |
| Communication        | Return to parent  | Direct messaging    | Return to parent   |
| File-system conflict | Shared filesystem | Shared filesystem   | Isolated branches  |
| Cache efficiency     | Highest (90% hit) | None (independent)  | None (independent) |
| Token cost           | Lowest            | Highest             | Medium             |
| Best for             | Research, search  | Debate, review      | Parallel impl.     |

---

## 3. Self-Distrust and Anti-Sycophancy Patterns

### 3.1 The Verification Specialist

Claude Code's `agent-prompt-verification-specialist.md` (2,938 tokens) defines an adversarial verification agent that tests implementations by running builds, test suites, linters, and adversarial probes, then issues a PASS/FAIL/PARTIAL verdict.

The core principle is **structural self-distrust**: the system assumes that the agent that built something has blind spots about its own work. A fresh agent with the explicit directive "find problems with this" catches what the builder missed. Testing asks "does it work?" -- adversarial verification asks "how can I break it?"

Key prompt patterns from the verification specialist:

- **Mandatory evidence**: "A check without a Command run block is not a PASS." Verdicts without tool execution are labeled as guesses.
- **Self-awareness of failure modes**: The prompt explicitly enumerates common LLM failure patterns -- reading code instead of running it, trusting self-reports, hedging instead of declaring failure.
- **Independence requirement**: "When non-trivial implementation happens on your turn, independent adversarial verification must happen before you report completion." Non-trivial is defined as 3+ file edits, backend/API changes, or infrastructure changes.

### 3.2 The Adversarial Review Pattern

The `ng/adversarial-review` Claude Code plugin implements a dual-agent pattern:

- **Optimizer**: Deploys Sonnet and Opus teammates to independently identify issues, then merges and deduplicates findings
- **Skeptic**: Challenges the Optimizer's discoveries and catches overlooked problems using cross-model consensus

The Skeptic requires mandatory evidence fields -- no evidence means the verdict is labeled as a guess. The system explicitly names rubber-stamping as a failure mode in the Skeptic prompt, requiring substantive objections backed by external validation rather than forced disagreement. Findings are capped at 50 words per Problem field and 30 words per suggested fix, enforcing precision.

### 3.3 The "Skeptical Memory" Pattern

Agents treat their own recollections as hints requiring verification against ground truth. Before acting on remembered information, the agent must check the actual codebase. This pattern extends to the coordinator: the directive "Never write 'based on your findings'" forces the coordinator to actively verify worker output rather than trusting it at face value.

---

## 4. Coordinator Prompt Design Principles

Synthesizing across Claude Code's leaked source, community analysis, and production systems, five principles emerge for coordinator prompt design:

### P1: Active Synthesis Over Passive Relay

The coordinator must understand findings before directing follow-up work. Phrases like "based on your findings" or "as reported by the worker" are banned because they signal that the coordinator is delegating understanding rather than owning it.

### P2: Parallelism as Default

"Parallelism is your superpower. Workers are async. Launch independent workers concurrently whenever possible." The coordinator should bias toward parallel execution unless there are genuine sequential dependencies.

### P3: Structured Communication

Workers communicate via XML-structured task notifications. The coordinator uses structured output formats (not prose) for task assignment, status updates, and result collection. This reduces ambiguity and enables programmatic parsing.

### P4: Worker Self-Compression

Sub-agents compress their own work before returning results. The coordinator never receives raw tool output from workers. This prevents context bloat and forces workers to distill findings into actionable summaries.

### P5: Quality Gates, Not Trust

The coordinator maintains explicit quality gates rather than trusting worker output. Every major deliverable passes through adversarial verification. The coordinator's prompt includes specific criteria for when to reject work and request revision.

---

## 5. Comparison Across Multi-Agent Coding Systems

### 5.1 Cursor (FastRender Architecture)

Cursor's January 2026 demonstration built a browser in a week using hierarchical agent orchestration with three roles:

- **Planners**: Continuously explore the codebase and create tasks
- **Workers**: Execute assigned tasks without coordinating with each other; push changes when done
- **Judges**: Determine whether to continue at each cycle end

This is a simpler coordination model than Claude Code's -- no inter-worker communication, no adversarial verification. Quality comes from the Judge role, which evaluates worker output without being influenced by the implementation process.

### 5.2 OpenAI Codex

Codex runs on specialized GPT-5 family models optimized for software engineering. Its multi-agent capability shipped February 2026 alongside every other major tool. The architecture spans cloud agents, terminal CLI, IDE extensions, and desktop apps. Codex emphasizes context engineering over prompt engineering -- ensuring models see the right information at the right time.

### 5.3 Devin

Devin aims to function as a full software engineer rather than an assistant. Teams run multiple Devins simultaneously on different tasks. The coordination model is task-based (assign a Devin to a ticket) rather than role-based (no internal sub-specialization visible to users).

### 5.4 Convergence Pattern

All major systems converged on multi-agent shipping in the same two-week window of February 2026: Grok Build (8 agents), Windsurf (5 parallel agents), Claude Code Agent Teams, Codex CLI, Devin parallel sessions. The shared pattern is coordinator-worker with isolated context windows, but they diverge on inter-worker communication, quality gates, and cost optimization.

---

## 6. Academic Research on Multi-Agent LLM Coordination

### 6.1 Multi-Agent Debate (MAD)

The seminal paper "Improving Factuality and Reasoning in Language Models through Multiagent Debate" (Du et al., ICML 2024) demonstrated that multiple LLM agents proposing answers and critiquing each other's reasoning significantly improves mathematical reasoning and reduces factual hallucinations. Adaptive Heterogeneous Multi-Agent Debate (A-HMAD) achieves 4-6% absolute accuracy gains over standard debate and reduces factual errors by over 30%.

However, the ICLR 2025 study "Multi-LLM-Agents Debate: Performance, Efficiency, and Scaling Challenges" found that current MAD methods fail to consistently outperform simpler single-agent strategies even with increased computational resources. A NeurIPS 2025 study further found that Majority Voting alone accounts for most performance gains typically attributed to debate.

### 6.2 Heterogeneous Agent Benefits

Research on agent diversity shows that heterogeneous agents with differing model architectures, training data, and inductive biases explore a broader solution space and mitigate shared failure modes. This directly supports luca-mastracode's model routing table, which assigns different model tiers (fast/balanced/capable) to different subagents.

### 6.3 Role Specialization

The PRISM framework (2026) found that expert personas improve LLM alignment but can damage accuracy -- a warning against uncritical persona adoption. The effective pattern is constrained specialization: define the domain, enforce boundaries, but don't embellish with personality traits that distort reasoning. Studies on 162 roles found no reliable benefit from generic persona assignment; benefits appear only when roles are tightly coupled to the task domain.

### 6.4 Anti-Sycophancy Research

Personality traits like sycophancy are encoded in LLM activations as SAE features. They can be amplified or suppressed through prompt design. Structural approaches (adversarial roles, mandatory evidence requirements) are more reliable than instructional approaches ("be honest") for reducing sycophantic behavior.

---

## 7. Implementation Recommendations for luca-mastracode

### 7.1 Add Self-Distrust to the Verifier

The current `verifierSubagent` performs goal-backward verification but lacks explicit self-distrust patterns. Add to its instructions:

```
## Independence Mandate
The implementer is an LLM. Do not trust that the code is correct.
Verify independently by running checks, not by reading code and reasoning
about correctness. A check without a tool execution is not a PASS.

Common failure modes to resist:
- Reading code and concluding it "looks correct" without running it
- Trusting the executor's commit message about what changed
- Hedging ("this appears to work") instead of declaring PASS or FAIL
- Reducing severity of real issues to avoid blocking
```

**Priority: HIGH. Effort: 1-2 hours.**

### 7.2 Add Anti-Sycophancy to the Reviewer

The current `reviewerSubagent` has severity classification but no explicit anti-sycophancy. Add:

```
## Quality Gate
Do not rubber-stamp weak work. Every APPROVE verdict must be earned
through evidence, not granted by default. If you find zero MUST-FIX
issues, explicitly state what you verified and how, not just that
"everything looks good."
```

**Priority: HIGH. Effort: 1 hour.**

### 7.3 Implement Worker Self-Compression

Following Claude Code's pattern, subagents should compress their own output before returning to the orchestrator. The current architecture returns full structured output; add a compression directive:

```
## Output Compression
Before returning results, compress your findings to essential information only.
Strip intermediate reasoning, tool output, and exploration paths.
The orchestrator reads your structured result, not your process.
```

**Priority: MEDIUM. Effort: 2-3 hours across all subagents.**

### 7.4 Add Coordinator Synthesis Directives

In the orchestrator modes (build, execute), add directives that prevent passive relay:

```
## Synthesis Requirement
When sub-agents return results, YOU must synthesize them.
Never write "based on the reviewer's findings" or "as the verifier reported."
Understand the findings yourself, resolve conflicts between sub-agents,
and present a unified assessment.
```

**Priority: MEDIUM. Effort: 2 hours.**

### 7.5 Introduce Adversarial Verification for COMPLEX+

For COMPLEX and CRITICAL complexity levels, spawn a second verification pass with an explicitly adversarial mandate. This maps to the debate pattern opportunity already identified in the project's memory (phase-execute code review, rated 5/5).

**Priority: MEDIUM. Effort: 4-6 hours.**

### 7.6 Explore Fork-Style Cache Efficiency

luca-mastracode's subagents currently run with fully independent contexts. If Mastra's API layer supports Anthropic's prompt caching, restructure subagent spawning so that all subagents in a wave share a common instruction prefix (mode instructions + hard constraints + always-apply rules), diverging only at the task-specific directive. This could reduce token costs by up to 90% for the shared prefix.

**Priority: MEDIUM. Effort: Depends on Mastra support.**

### 7.7 Heterogeneous Model Assignment

The current model routing table already assigns different tiers per complexity level. Extend this to exploit the academic finding on heterogeneous agents: for the parallel reviewer subagents (code-architect, dx-advocate, security-auditor, code-simplifier), consider routing to different model families when available, not just different tiers. Different models have distinct blind spots; diversity in the reviewer pool improves coverage.

**Priority: LOW. Effort: 2-3 hours.**

### 7.8 Structured Inter-Subagent Communication

The current architecture has subagents report back to the orchestrator only. For COMPLEX+ work, consider adding a lightweight messaging mechanism (shared JSON file in `.planning/`) so that the verifier can read reviewer findings and vice versa, without routing through the orchestrator. This mirrors Claude Code's teammate model without the full overhead.

**Priority: LOW. Effort: 6-8 hours.**

---

## 8. Sources

### Official Documentation

- [Create custom subagents -- Claude Code Docs](https://code.claude.com/docs/en/sub-agents) -- Subagent architecture, built-in agents, configuration
- [Orchestrate teams of Claude Code sessions -- Claude Code Docs](https://code.claude.com/docs/en/agent-teams) -- Agent Teams architecture, teammate model, task coordination
- [Plan in the cloud with ultraplan -- Claude Code Docs](https://code.claude.com/docs/en/ultraplan) -- Remote planning with cloud Opus sessions

### Source Leak Analysis

- [Claude Code Source Leak: What's Worth Learning for AI Agents](https://thoughts.jock.pl/p/claude-code-source-leak-what-to-learn-ai-agents-2026) -- Coordinator patterns, adversarial verification, skeptical memory
- [Claude Code architecture Deep Dive: What the Leaked Source Reveals](https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/) -- Mailbox system, atomic claim mechanism, coordinator prompt
- [Production AI Agent Architecture: Lessons from Claude Code](https://artinoid.com/blog/production-ai-agent-architecture-claude-code-lessons) -- Coordinator directive text, sub-agent compression, model routing
- [Diving into Claude Code's Source Code Leak](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code) -- Cache boundaries, anti-distillation, compaction
- [Claude Code Leaked Source: BUDDY, KAIROS & Every Hidden Feature](https://wavespeed.ai/blog/posts/claude-code-leaked-source-hidden-features/) -- Feature flags, hidden capabilities
- [Claude Code's Hidden Multi-Agent System](https://paddo.dev/blog/claude-code-hidden-swarm/) -- TeammateTool operations, role taxonomy, early access analysis

### Prompt Engineering & System Prompts

- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) -- Extracted system prompts updated per Claude Code version (280 files)
- [repowise-dev/claude-code-prompts](https://github.com/repowise-dev/claude-code-prompts) -- Community-authored prompt templates informed by Claude Code study
- [ng/adversarial-review](https://github.com/ng/adversarial-review) -- Optimizer/Skeptic dual-agent code review plugin
- [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) -- 30+ component dynamic assembly analysis
- [How Prompt Caching Actually Works in Claude Code](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code) -- Cache sharing across forks, 92% reuse rate

### Multi-Agent Coordination Guides

- [Shipyard: Multi-agent orchestration for Claude Code](https://shipyard.build/blog/claude-code-multi-agent/) -- Practical orchestration patterns
- [Claude Code Agent Teams: Setup & Usage Guide](https://claudefa.st/blog/guide/agents/agent-teams) -- Configuration and deployment guide
- [AI Coding Agents in 2026: Coherence Through Orchestration](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- Context engineering as the critical discipline
- [The State of AI Coding Agents (2026)](https://medium.com/@dave-patten/the-state-of-ai-coding-agents-2026-from-pair-programming-to-autonomous-ai-teams-b11f2b39232a) -- February 2026 multi-agent convergence across vendors

### Academic Research

- [Improving Factuality and Reasoning through Multiagent Debate](https://arxiv.org/abs/2305.14325) (Du et al., ICML 2024) -- Foundational MAD paper
- [Multi-LLM-Agents Debate: Performance, Efficiency, and Scaling Challenges](https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/) (ICLR 2025) -- MAD limitations analysis
- [Debate or Vote: Which Yields Better Decisions in Multi-Agent LLMs?](https://openreview.net/forum?id=iUjGNJzrF1) (NeurIPS 2025) -- Majority voting vs debate
- [Adaptive Heterogeneous Multi-Agent Debate](https://link.springer.com/article/10.1007/s44443-025-00353-3) (2025) -- A-HMAD with 4-6% accuracy gains
- [Expert Personas Improve LLM Alignment but Damage Accuracy: PRISM](https://arxiv.org/html/2603.18507v1) (2026) -- Persona effectiveness warning
- [Courtroom-Style Multi-Agent Debate with Progressive RAG](https://arxiv.org/html/2603.28488v1) (2026) -- Structured deliberation for claim verification

### Role Specialization

- [Agentic Engineering Part 3: Role-Based Agent Personas](https://www.sagarmandal.com/2026/03/15/agentic-engineering-part-3-role-based-agent-personas-why-specialization-beats-generalization/) -- 10-persona coherence cascade, evidence for specialization
- [How To Define an AI Agent Persona](https://thenewstack.io/how-to-define-an-ai-agent-persona-by-tweaking-llm-prompts/) -- Practical persona design framework
- [The Persona Pattern: Unlocking Modular Intelligence](https://towardsai.net/p/artificial-intelligence/the-persona-pattern-unlocking-modular-intelligence-in-ai-agents) -- Pattern language for agent personas
