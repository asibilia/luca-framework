# Comparative Analysis of AI Coding Agent System Prompts

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How major AI coding agents structure their system prompts and what luca-mastracode should learn from each

---

## Executive Summary

A February 2026 study by Drew Breunig demonstrated that swapping Claude Code's system prompt with Codex's on identical Opus 4.5 infrastructure produced dramatically different agent workflows on the same SWE-Bench Pro problems --- despite the model being identical. The Claude prompt produced an iterative "try, observe, fix" workflow; the Codex prompt produced a methodical "understand fully, then implement once" approach. Both reached correct answers through entirely different paths. This proves that **system prompts define agent behavior as much as the underlying model**.

This document compares the system prompt architecture of 12+ major coding agents, catalogs common patterns and unique innovations, and maps findings to concrete recommendations for luca-mastracode.

---

## Table of Contents

1. [The SWE-Bench Prompt Swap Experiment](#1-the-swe-bench-prompt-swap-experiment)
2. [Agent Comparison Table](#2-agent-comparison-table)
3. [Per-Agent Analysis](#3-per-agent-analysis)
4. [Common Patterns Across Agents](#4-common-patterns-across-agents)
5. [Fighting the Weights](#5-fighting-the-weights)
6. [Unique Innovations Worth Adopting](#6-unique-innovations-worth-adopting)
7. [What luca-mastracode Should Learn](#7-what-luca-mastracode-should-learn)
8. [Sources](#8-sources)

---

## 1. The SWE-Bench Prompt Swap Experiment

Drew Breunig's study used **OpenCode** as the agent harness with **Opus 4.5** as the model. Two agents ran in parallel on SWE-Bench Pro problems: one with Claude Code's system prompt, the other with Codex's instructions. Both correctly answered the same subset of problems but exhibited fundamentally different behavior:

| Agent Prompt | Workflow Style | Characteristic |
|---|---|---|
| Claude Code | Iterative | Try something, observe what breaks, fix it |
| Codex | Methodical | Understand fully, document the plan, implement once |

This pattern was consistent across many problems. The study also examined six CLI coding agents (Claude Code, Cursor, Gemini CLI, Codex CLI, OpenHands, and Kimi CLI) and found that while all perform the same basic function --- gathering information, understanding the codebase, writing code, tracking progress, running commands --- their system prompts differ dramatically in length, focus distribution, and philosophy.

The key insight: a model sets the theoretical ceiling of performance, but the system prompt determines whether that ceiling is reached. System prompts serve two functions: **model calibration** (smoothing quirks and biases) and **UX definition** (establishing tone, autonomy level, and interaction style).

---

## 2. Agent Comparison Table

| Agent | Relative Prompt Length | Primary Philosophy | Unique Feature | Model Flexibility |
|---|---|---|---|---|
| **Claude Code** | Medium | Iterative, principle-based | 30+ conditional components, cache boundary, mid-conversation `<system-reminder>` injection | Claude models only |
| **Cursor** | Medium-Long | Personality-heavy, surgical edits | >33% tokens on personality/steering; dual-model sketch+apply architecture | Multi-model (Claude, GPT-5, Gemini) |
| **GitHub Copilot** | Medium | Layered autonomy, action-first | 3-layer architecture (system/workspace/user); 8-step behavioral workflow | Multi-model |
| **Codex CLI** | Long | Methodical, documentation-first | Git-centric (commit everything, clean worktree); evidence before implementation | OpenAI models |
| **Gemini CLI** | Long | ReAct-loop, skill-based | 1M token context window; agent skills discovery system; open source | Gemini models |
| **Devin** | Long | Autonomous, evidence-based | Mandatory `<cite>` tags with file:line citations; full Agile-style subtask planning | Multi-model |
| **SWE-Agent** | Short (by design) | ACI-first, guardrailed | Custom Agent-Computer Interface replacing raw shell; simplified action space | Model-agnostic |
| **OpenHands** | Medium | CodeAct framework, composable | Event-sourced architecture; Jinja2 templated prompts; Torvalds-inspired engineering philosophy | Model-agnostic |
| **Kimi CLI** | Short (minimal) | Declarative, skill-discovery | Near-zero workflow guidance; AI decides which skill docs to read at runtime | Kimi/Moonshot models |
| **Aider** | Medium | Format-innovative, edit-focused | Multiple pluggable edit formats (unified diff, search/replace, patch); anti-laziness design | Model-agnostic |
| **Windsurf/Cascade** | Medium-Long | Flow paradigm, transparent | 11+ iterative tool waves; `toolSummary` for UX feedback on every function call | Codeium models |
| **Cline** | Medium | Permission-gated, VS Code native | Every action requires user permission; open-source prompt visible in repo | Model-agnostic |

---

## 3. Per-Agent Analysis

### Claude Code

Claude Code's system prompt is dynamically assembled from 30+ conditional components totaling ~124 distinct prompts across 9 categories. The architecture uses a **cache boundary** (`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`) splitting static instructions (1-hour TTL) from dynamic session context (5-minute TTL). Critical constraints are placed at both the start and end of the prompt to exploit U-shaped attention curves.

Key techniques: quantified output constraints ("keep text between tool calls to <=25 words"), bidirectional constraints (every "use X" has a "do NOT use Y"), and `<system-reminder>` tags for mid-conversation behavioral refresh to combat context rot. The multi-agent system includes explicit self-distrust in verification: "The implementer is an LLM. Verify independently."

### Cursor

Cursor dedicates over one-third of its token budget to personality and steering instructions --- the highest ratio observed among the agents studied. It uses **model-specific prompts**, with different versions for Claude, GPT-5, and other backends. The editing philosophy centers on "lazy edits" using markers like `// ... existing code ...` to denote unmodified sections, minimizing token waste.

A distinctive two-stage architecture: the primary LLM generates edit "sketches" describing intended changes, then a separate custom-trained "Apply" model integrates those modifications into existing code. This decouples reasoning from mechanical application.

### GitHub Copilot Agent Mode

Copilot uses a three-layer prompt architecture: Layer 1 (universal system rules), Layer 2 (workspace context including OS, repo structure, active file), and Layer 3 (user request with metadata). The system enforces an 8-step behavioral workflow: understand, investigate, plan, implement, debug root causes, test, iterate, verify.

The prompt emphasizes action-oriented autonomy: "You take action when possible... Don't ask unnecessary questions about the details if you can simply DO something." Communication style is "warm, professional, approachable" with explicit permission for "light humor when appropriate."

### Codex CLI

Codex's system prompt is among the longest, emphasizing a documentation-first, understand-before-acting philosophy. It is deeply Git-centric: the agent must commit changes, fix pre-commit issues, check git status, leave the worktree clean, and evaluate only committed code. It does not create new branches.

The prompt produces what Breunig's study characterized as a "methodical" workflow --- understand the full problem space before writing any code. This contrasts sharply with Claude Code's iterative approach.

### Gemini CLI

Gemini CLI is open source with a ReAct (reason and act) loop architecture. Its prompt is among the longest, roughly double the length of Claude Code's. A distinctive feature is the agent skills discovery system: at startup, Gemini discovers all available skills and injects their names and descriptions into the system prompt. The AI then decides at runtime whether to load specific skill documentation.

The 1M token context window enables whole-monorepo comprehension. The prompt takes a relatively mild approach to "fighting the weights" --- single-line suggestions rather than all-caps enforcement.

### Devin

Devin implements the most elaborate autonomy loop among the agents studied. Its prompt structures work as Agile sprint notes: define SUBTASKS, mark STATUS, communicate findings at logical checkpoints. A unique innovation is **mandatory citation discipline** --- every claim requires file-level citations with line numbers using `<cite>` tags (max 5 lines per citation). The prompt explicitly states "DO NOT MAKE UP ANSWERS."

Devin's DeepWiki integration points to investment in structured knowledge retrieval over raw code generation. Tool invocations include a full Linux shell, browser automation, and filesystem I/O. Security research revealed that Devin's tool set includes the ability to expose local ports to the public internet, a capability that became an attack surface.

### SWE-Agent

SWE-Agent's key contribution is the **Agent-Computer Interface (ACI)** --- a custom abstraction layer between the LM and the computer that replaces the raw Linux shell. Instead of the shell's granular, highly configurable action space, the ACI offers a small set of simple actions for viewing, searching, and editing files, with guardrails to prevent common mistakes and concise feedback at every turn.

This design improved SWE-Bench performance by 10.7 percentage points over the baseline shell agent without modifying the model. The insight: constraining the action space through prompt and tool design can matter more than the model itself.

### OpenHands (formerly OpenDevin)

OpenHands uses the CodeAct framework where each step is either natural language conversation or code execution (bash, Python, or browser commands). The system prompt is a Jinja2 template (`system_prompt.j2`) with pluggable sections including a "Linus Torvalds-inspired engineering philosophy."

The architecture follows EXPLORATION -> ANALYSIS -> IMPLEMENTATION -> VERIFICATION. The V1 platform comprises nine interlocking components including event-sourced state management, context window management, and a security/confirmation layer. OpenHands and Claude Code share the distinction of being relatively concise --- both less than half the length of Codex and Gemini prompts.

### Kimi CLI

Kimi CLI represents the minimalist extreme. Breunig's analysis found it contains "zero workflow guidance, barely hints at personality instructions" --- the shortest prompt among the six agents studied. Instead of upfront instructions, Kimi uses a **declarative skill-discovery** approach: the system discovers available skills at startup and injects only names and descriptions. The AI decides autonomously which detailed guidance documents to consult based on the current task.

This "minimal prompt, maximum agent autonomy" philosophy is a bet that models are capable enough to self-direct given the right tool access.

### Aider

Aider's primary innovation is its **pluggable edit format** system. It supports multiple formats --- unified diff, search/replace blocks (EditBlock), OpenAI patch format, whole-file replacement, and editor-specific modes. The unified diff format specifically addresses model laziness: it raised GPT-4 Turbo's benchmark score to 61%, reducing lazy code generation by 3X.

The system prompt instructs the model to write changes as `diff -U0` output with `@@ ... @@` hunks. This format was chosen because it is familiar to models from training data, simple (no escaping or syntactic overhead), and encourages editing at the level of substantive code blocks rather than individual lines.

### Windsurf/Cascade

Windsurf (by Codeium) operates on what it calls the "AI Flow paradigm" --- both independent and collaborative work. The system prompt has gone through 11+ iterative "tool waves," indicating aggressive refinement based on production failures. Each tool call includes a `toolSummary` parameter for transparent UX feedback.

The prompt emphasizes brevity ("conciseness is critical") and mandates that code changes use edit tools rather than output to the user. For general knowledge queries, the agent responds directly without tool calls.

### Cline

Cline is notable for its **permission-gated** approach: every action requires explicit user approval. The system prompt and full tool definitions are open source in the repository. Security research uncovered that Cline's prompts can become attack surfaces --- malicious instructions planted in Python docstrings or Markdown files can be executed when the agent analyzes infected repositories. The February 2026 "Clinejection" supply chain attack demonstrated how a compromised issue-triage bot published an unauthorized npm package.

---

## 4. Common Patterns Across Agents

### Universal Architecture

Every agent studied follows the same high-level structure:

1. **Identity definition** ("You are X, built by Y")
2. **Tool schemas** (typed function signatures with behavioral guidance)
3. **One-tool-per-step iteration** (observe results before next action)
4. **Lazy output** (avoid full file rewrites when possible)
5. **Language adaptation** (respond in the user's language)

### Shared Behavioral Constraints

- **Read before edit**: All agents are instructed to understand existing code before modifying it
- **Minimal changes**: Avoid adding features or cleanups beyond what was requested
- **Test after change**: Run tests to verify modifications
- **Avoid hallucination**: Multiple agents include explicit "do not make up" directives

### Edit Format Convergence

Successful edit formats across all agents share two properties: they avoid line numbers and they clearly separate before/after code. Whether using unified diffs (Aider), search/replace blocks (Cline, RooCode), sketches (Cursor), or structured patches (Codex), the principle is consistent.

---

## 5. Fighting the Weights

"Fighting the weights" describes the practice of using forceful, repeated instructions to override behaviors ingrained during model training. Two primary biases have been identified across all agents:

### Code Comments

Models over-generate comments because training data is dominated by tutorials, notebooks, and competitive coding (all comment-heavy sources). Every major agent fights this:

| Agent | Instruction |
|---|---|
| Cursor | "Do not add comments for trivial or obvious code" |
| Claude Code | No comments "unless the user asks you to" |
| Codex | "Add succinct code comments that explain what is going on if code is not self-explanatory" |
| Gemini CLI | "Add code comments sparingly... NEVER talk to the user through comments" |

### Serial Tool Execution

Models default to sequential tool calls despite the efficiency benefits of parallelism. This likely stems from RL environments not rewarding parallel execution and from verbose chain-of-thought training:

| Agent | Approach |
|---|---|
| Claude Code | Repeats "You can call multiple tools in a single response" **seven times** in its prompt |
| Cursor | "CRITICAL INSTRUCTION: involve all relevant tools concurrently... DEFAULT TO PARALLEL" (all caps) |
| Gemini CLI | Single-line suggestion (mildest approach) |
| Codex (v5.2+) | Removed parallelism instructions entirely, suggesting model improvements reduced the need |

### Verbosity

Models trained for verbose reasoning carry that verbosity into code generation and explanations. Claude Code uses quantified constraints ("<=25 words between tool calls"), while others use qualitative directives ("be concise", "brevity is critical").

---

## 6. Unique Innovations Worth Adopting

### From Claude Code: Mid-Conversation Injection

The `<system-reminder>` pattern re-injects critical behavioral rules mid-conversation to combat context rot (instruction adherence degrades after ~80K tokens). This is the most effective technique for maintaining quality in long sessions.

### From SWE-Agent: Constrained Action Space

Replacing the raw shell with a simplified ACI improved benchmark performance by 10.7 percentage points. The insight: constraining what the agent CAN do is as important as instructing what it SHOULD do.

### From Cursor: Dual-Model Architecture

Separating reasoning (primary LLM generates edit sketches) from mechanical application (custom Apply model) allows each model to be optimized for its role. This is a form of plan-and-execute decomposition at the edit level.

### From Devin: Citation Discipline

Requiring file:line citations for every claim forces evidence-based reasoning and makes hallucination immediately detectable. This is especially valuable for autonomous agents working without human oversight.

### From Aider: Edit Format Engineering

Aider's discovery that unified diffs reduce GPT-4 Turbo laziness by 3X demonstrates that the format in which you ask for output profoundly affects output quality. Format choice is a prompt engineering lever most agents underutilize.

### From Kimi CLI: Minimal Prompt, Maximum Discovery

Kimi's near-zero upfront instructions with runtime skill discovery represents the opposite extreme from Claude Code's 124-prompt assembly. If models become capable enough to self-direct, this approach minimizes prompt overhead and maximizes flexibility.

### From OpenHands: Templated Prompt Assembly

Using Jinja2 templates for system prompt construction enables conditional sections, variable injection, and modular composition without string concatenation complexity.

### From Windsurf: Tool Wave Iteration

Windsurf's progression through 11+ tool waves demonstrates that tool definitions need aggressive, production-informed iteration. The initial tool schema is never right.

---

## 7. What luca-mastracode Should Learn

### High Priority

| Innovation | Source Agent | Applicability |
|---|---|---|
| Mid-conversation behavioral refresh | Claude Code | Implement `<luca-reminder>` injection every N turns to combat context rot |
| Quantified output constraints | Claude Code | Add explicit word/token limits per mode |
| Citation discipline for verification | Devin | Add to lu-verifier: require file:line evidence for every claim |
| Constrained action space per mode | SWE-Agent | Restrict tool availability per mode more aggressively than current permissions |

### Medium Priority

| Innovation | Source Agent | Applicability |
|---|---|---|
| Dual-model edit architecture | Cursor | Consider separating plan generation from edit application in executor modes |
| Templated prompt assembly | OpenHands | Migrate from string concatenation to template-based instruction building |
| Parallel tool enforcement | Claude Code, Cursor | Add explicit parallel tool instructions (models default to serial) |
| Edit format optimization | Aider | Test whether unified diff instructions reduce lazy output in executor modes |

### Worth Monitoring

| Innovation | Source Agent | Applicability |
|---|---|---|
| Minimal prompt + skill discovery | Kimi CLI | As models improve, reduce prompt overhead by moving guidance to on-demand skill docs |
| Tool wave iteration | Windsurf | Track production failures to iteratively refine tool definitions |
| Model-specific prompt variants | Cursor | If luca-mastracode supports multiple models, tailor prompts per backend |

### Anti-Patterns to Avoid

- **Kimi's extreme minimalism** is premature for a framework orchestrating complex multi-phase workflows --- luca-mastracode needs explicit behavioral guidance
- **Devin's full autonomy loop** without permission gates creates security risk (the port-exposure vulnerability)
- **Cline's prompt-as-attack-surface** vulnerability shows that system prompts in user-accessible files must be treated as security-sensitive

---

## 8. Sources

### Primary Comparative Studies

- [How System Prompts Define Agent Behavior](https://www.dbreunig.com/2026/02/10/system-prompts-define-the-agent-as-much-as-the-model.html) --- Drew Breunig's SWE-Bench prompt swap experiment and six-agent comparison
- [How System Prompts Define Agent Behaviour (nilenso)](https://blog.nilenso.com/blog/2026/02/10/how-system-prompts-define-agent-behaviiour/) --- Extended analysis of the Breunig study with per-agent breakdowns
- [How System Prompts Reveal Model Biases (nilenso)](https://blog.nilenso.com/blog/2026/02/12/how-system-prompts-reveal-model-biases/) --- "Fighting the weights" analysis: code comments and tool parallelism biases

### System Prompt Repositories

- [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks) --- Extracted prompts from ChatGPT, Claude, Gemini, Grok, Codex, and 20+ others (updated regularly)
- [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) --- Full prompts for Augment Code, Claude Code, Cursor, Devin AI, Windsurf, and 25+ others
- [EliFuzz/awesome-system-prompts](https://github.com/EliFuzz/awesome-system-prompts) --- Collection including Aider, Cursor, Devin, VSCode Agent, Gemini, Codex

### Per-Agent Deep Dives

- [A Deep Dive into GitHub Copilot Agent Mode's Prompt Structure](https://dev.to/seiwan-maikuma/a-deep-dive-into-github-copilot-agent-modes-prompt-structure-2i4g) --- Three-layer architecture, 8-step workflow, tool definitions
- [Leaked System Prompts of AI Vibe-Coding Tools (Quasa)](https://quasa.io/media/leaked-system-prompts-of-ai-vibe-coding-tools-a-deep-dive-into-cursor-bolt-lovable-and-manus) --- Cursor, Bolt, Lovable, Manus prompt analysis
- [Inside the Black Box: Leaked AI System Prompts](https://hoangyell.com/system-prompts-ai-tools-leaked-explained/) --- Manus, Cursor, Devin, v0, Windsurf comparison with pattern table
- [Leaked System Prompts for 28+ AI Coding Tools (Augment Code)](https://www.augmentcode.com/learn/leaked-ai-system-prompts-github) --- Overview of the leak ecosystem and security implications
- [Code Surgery: How AI Assistants Make Precise Edits](https://fabianhertwig.com/blog/coding-assistants-file-edits/) --- Edit format comparison across Aider, Cursor, Codex, RooCode
- [Cursor System Prompt Revealed (Substack)](https://patmcguinness.substack.com/p/cursor-system-prompt-revealed) --- Cursor's personality-heavy prompt structure
- [Unified Diffs Make GPT-4 Turbo 3X Less Lazy (Aider)](https://aider.chat/docs/unified-diffs.html) --- Edit format impact on model laziness

### Academic Papers

- [SWE-Agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793) --- ACI design, NeurIPS 2024
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/abs/2407.16741) --- CodeAct framework, ICLR 2025
- [The OpenHands Software Agent SDK](https://arxiv.org/html/2511.03690v1) --- V1 composable architecture

### Agent Repositories & Documentation

- [Gemini CLI (GitHub)](https://github.com/google-gemini/gemini-cli) --- Open-source agent with ReAct loop and skill discovery
- [Cline (GitHub)](https://github.com/cline/cline) --- Open-source permission-gated agent for VS Code
- [SWE-Agent (GitHub)](https://github.com/SWE-agent/SWE-agent) --- Princeton/Stanford ACI-based agent
- [OpenHands CodeAct System Prompt](https://github.com/All-Hands-AI/OpenHands/blob/main/openhands/agenthub/codeact_agent/prompts/system_prompt.j2) --- Jinja2 templated prompt source

### Security & Vulnerability Research

- [Clinejection: Compromising Cline's Production Releases (Adnan Khan)](https://adnanthekhan.com/posts/clinejection/) --- Supply chain attack via issue triage bot
- [AI Kill Chain: Devin AI Exposes Ports (Embrace The Red)](https://embracethered.com/blog/posts/2025/devin-ai-kill-chain-exposing-ports/) --- Devin's tool-as-attack-surface vulnerability
- [Prompt Injection Attacks on Agentic Coding Assistants (arXiv)](https://arxiv.org/html/2601.17548v1) --- Systematic analysis finding >85% attack success rates
