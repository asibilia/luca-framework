# Tool Definition Engineering: Behavioral Guidance as the Missing Layer

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How effective tool definitions combine schemas with behavioral guidance to steer agent tool selection and usage
**Series:** Prompt Architecture Research (03 of N)

---

## Executive Summary

Tool definitions are not API documentation -- they are active control surfaces that directly shape how AI agents reason about tool selection, invocation, and sequencing. Claude Code dedicates approximately 73,000 characters across 36+ tools to tool-specific prompts, with individual tools like Bash consuming over 1,200 tokens of behavioral guidance alone. Empirical evidence from Anthropic and the broader agent-building community demonstrates that even small refinements to tool descriptions yield dramatic improvements in agent performance. This document catalogs the anatomy of effective tool definitions, extracts patterns from production coding agents, and provides implementation recommendations for enriching luca-mastracode's tool layer.

---

## 1. Why Tool Descriptions Matter as Much as Tool Schemas

### The Schema-Description Gap

A tool schema defines what a tool *can* do: its parameters, types, and constraints. A tool description defines what a tool *should* do: when to use it, when not to, how it relates to other tools, and what pitfalls to avoid. The schema is a contract with the runtime; the description is a contract with the model.

Anthropic's official guidance states this explicitly: "Provide extremely detailed descriptions. This is by far the most important factor in tool performance." They recommend at minimum 3-4 sentences per tool description, more for complex tools, covering what the tool does, when it should be used, when it should not be used, what each parameter means, and any important caveats or limitations.

### Empirical Evidence

Anthropic reports that Claude Sonnet 3.5 achieved state-of-the-art performance on SWE-bench Verified specifically after "precise refinements to tool descriptions" -- not schema changes, not model improvements, but description engineering. The descriptions are serialized directly into the model's context window and function as what Augment Code calls "hidden prompts" that teach agents how to think about problems.

### Tool Descriptions as Steering Mechanisms

Augment Code's research identifies four layers of agent prompting infrastructure -- system prompts, tools, skills, and user messages -- with tool descriptions operating as the second layer. Their finding: "The more specific and directive your tool descriptions, the better the agent will understand when to use each tool." Tool descriptions should explain not just *what* a tool does, but *when* to invoke it, *what* it returns, and *why* those results matter for task planning.

A critical corollary: absent tools prompt as strongly as present ones. By removing a lower-fidelity tool (like raw `grep`), agents are forced toward more powerful alternatives. Tool availability itself becomes a prompting mechanism.

---

## 2. Claude Code's Tool Definition Anatomy

### Structure of a Claude Code Tool Prompt

Each of Claude Code's 36+ built-in tools carries a self-contained prompt that follows a consistent five-part structure, extracted from the Piebald-AI/claude-code-system-prompts repository (v2.1.104, April 2026):

1. **Purpose statement** -- What the tool does in 1-2 sentences
2. **Usage guidance** -- When and how to use it, with specific conditions
3. **Behavioral constraints** -- What NOT to do, with explicit reasoning
4. **Priority ordering** -- Preference over alternative tools for the same task
5. **Few-shot examples** -- Concrete invocation patterns for correct usage

### Token Allocation by Tool

The token investment varies significantly by tool complexity:

| Tool | Approximate Tokens | Notes |
|------|-------------------|-------|
| Bash | ~1,233 | Most elaborate; combines tool guidance with git safety, command preferences, and timeout policies |
| Read | ~690 | Multimodal support guidance, offset/limit patterns, PDF page limits |
| Edit | ~469 | Indentation preservation, uniqueness constraints, read-before-edit requirement |
| Grep | Implicit (shared) | Regex syntax, output modes, multiline matching flags |
| Glob | Implicit (shared) | Pattern syntax, modification-time sorting |
| Agent | Complex | Meta-prompting for sub-agent configuration |
| TodoWrite | ~200-300 | State machine semantics, single-in-progress constraint |

The total tool definition budget of ~73,000 characters represents roughly 79% of the combined system prompt + tool prompt token space (tool prompts are ~18,000 tokens vs ~4,750 tokens for the main system prompt). This ratio reveals a fundamental architectural insight: Claude Code invests far more in telling the model *how to use its tools* than in telling it *how to behave generally*.

### The Bash Tool: A Case Study in Behavioral Guidance

The Bash tool prompt is the most instructive example because it must simultaneously enable broad capability while preventing misuse. Its structure:

**Priority ordering (negative examples):**
```
IMPORTANT: Avoid using this tool to run `find`, `grep`, `cat`, `head`,
`tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed
or after you have verified that a dedicated tool cannot accomplish your
task. Instead, use the appropriate dedicated tool as this will provide
a much better experience for the user:
  - File search: Use Glob (NOT find or ls)
  - Content search: Use Grep (NOT grep or rg)
  - Read files: Use Read (NOT cat/head/tail)
  - Edit files: Use Edit (NOT sed/awk)
  - Write files: Use Write (NOT echo >/cat <<EOF)
  - Communication: Output text directly (NOT echo/printf)
```

This pattern is bidirectional: it specifies both what TO use and what NOT to use, eliminating ambiguity. The reasoning ("this will provide a much better experience for the user") teaches the model to make correct edge-case decisions autonomously.

**Operational constraints:**
- Always quote file paths containing spaces
- Prefer absolute paths; avoid `cd` between commands
- Timeout defaults (120s) with explicit override documentation
- Git safety protocol: never amend, never force-push, never skip hooks
- Background execution guidance with `run_in_background` parameter

**Few-shot examples:** The git commit section includes a complete HEREDOC example for commit message formatting, demonstrating the exact syntax the model should produce.

### The Read Tool: Defensive Guidance

The Read tool demonstrates how descriptions prevent common failure modes:

- "You MUST use your Read tool at least once in the conversation before editing" (Edit tool cross-reference)
- "By default, it reads up to 2000 lines starting from the beginning of the file"
- "When you already know which part of the file you need, only read that part"
- "For large PDFs (more than 10 pages), you MUST provide the pages parameter"
- "Do NOT re-read a file you just edited to verify" (prevents wasted tool calls)

Each constraint addresses a specific failure mode observed in production usage, not a theoretical concern.

### The Edit Tool: Cross-Tool Coordination

The Edit tool's description demonstrates inter-tool dependency management:

- "You must use your Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file."
- "The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replace_all."
- "ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required."

These are not schema constraints (the schema cannot enforce "read before edit") -- they are behavioral guidance that shapes the model's planning.

---

## 3. Tool Priority Ordering and Bidirectional Constraints

### The Anti-Redundancy Pattern

Claude Code's most distinctive tool engineering pattern is systematic anti-redundancy: for every capability available through multiple tools, the descriptions explicitly state which tool to prefer and which to avoid.

This is necessary because models are trained on vast corpora of shell usage. Without explicit guidance, Claude will default to `cat file.txt` over the Read tool, `grep -r pattern` over the Grep tool, and `find . -name "*.ts"` over Glob. The tool descriptions must fight these trained preferences.

This is a concrete example of "fighting the weights" -- a concept documented by Drew Breunig where prompt instructions conflict with a model's post-training. Recognition signals include the model repeating incorrect tool choices despite instructions, acknowledging the preferred approach but reverting to trained habits, and few-shot examples being ignored in favor of familiar patterns. The mitigation in Claude Code's case is not subtle: the Bash tool description includes explicit, repeated negative examples with the target tools named in ALL CAPS for emphasis.

### Reinforcement Across Layers

Claude Code reinforces tool preferences at three levels:

1. **System prompt** ("Using Your Tools" section): Global tool preference statement
2. **Individual tool descriptions**: Per-tool negative examples
3. **System reminders**: Mid-conversation re-injection when the model drifts

This multi-layer reinforcement is deliberate. Augment Code's research confirms: "Critical tools warrant coverage in multiple layers -- system prompt emphasis, detailed descriptions, and even concrete examples -- leveraging repetition to strengthen agent adherence."

---

## 4. The Critic Pattern for Tool Safety

### Permission Evaluation via Side-Query

Claude Code's bash security system spans approximately 9,700 lines with 22 validators. Rather than relying solely on static allowlists, it employs a "permission classification via side-query" pattern: the command is sent to the model as a separate evaluation query asking "Is this command safe?" The model evaluates context, working directory, and user intent to produce an adaptive, context-aware security assessment.

This critic pattern replaces brittle static rules with contextual evaluation. It can reason about intent (is this `rm -rf` targeting a build directory or the home directory?), assess blast radius (is this a single-file operation or recursive?), and consider session context (has the user been working on cleanup tasks?).

### Implications for Tool Description Design

The critic pattern demonstrates that tool descriptions serve dual audiences: the primary agent that selects and invokes tools, and the safety evaluator that assesses whether the invocation is appropriate. Tool descriptions must provide enough context for both audiences to reason correctly.

---

## 5. Comparison Across Coding Agents

### Gemini CLI: Progressive Tool Discovery

Gemini CLI (open-source, Google) takes a fundamentally different approach to tool definition management. Traditional tools are "eager" -- all definitions loaded into the system prompt at session start. Gemini CLI's Agent Skills system is "progressive" -- capabilities are discovered dynamically, with detailed instructions loaded only when the agent identifies a relevant task.

At session start, only tool names and brief descriptions are injected. Full tool schemas and behavioral guidance load on-demand. This reduces context saturation at the cost of requiring an extra reasoning step for tool discovery. The system prompt supports template variables (`${AvailableTools}`, `${AgentSkills}`, `${SubAgents}`) for dynamic composition.

### Codex CLI: Sandbox-First Security

OpenAI's Codex CLI uses OS-level sandboxing (Docker isolation) as its primary safety mechanism, with tool descriptions focused on capability rather than safety guidance. The tool layer includes multi-agent collaboration primitives (`spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`) that Claude Code handles through its Agent/Worktree tools instead.

Codex's tool descriptions are leaner than Claude Code's because the sandbox provides a safety floor that reduces the need for behavioral safety guidance in descriptions. The trade-off: less adaptive security (sandbox rules are static) but simpler tool definitions.

### Cursor: IDE-Integrated Tool Context

Cursor integrates tool definitions with IDE state (open files, cursor position, visible lines), providing implicit context that reduces the need for explicit behavioral guidance. Tools know what the user is looking at, reducing the description burden of explaining when to use file-reading tools.

### Comparative Summary

| Dimension | Claude Code | Gemini CLI | Codex CLI | Cursor |
|-----------|------------|------------|-----------|--------|
| Tool loading | Eager (all at start) | Progressive (on-demand) | Eager | Eager + IDE context |
| Description depth | Very deep (~1,200 tokens for Bash) | Shallow at start, deep on-demand | Moderate | Moderate + implicit context |
| Safety mechanism | Behavioral guidance + critic pattern | Permission prompts for mutators | Docker sandbox | IDE permissions |
| Cross-tool coordination | Extensive bidirectional constraints | Minimal | Minimal | Implicit via IDE |
| Few-shot examples | In tool descriptions | In skill definitions | Limited | In rules files |

---

## 6. Implementation Recommendations for luca-mastracode

### Current State

luca-mastracode's tools have functional descriptions (1-2 sentences) and well-designed action schemas with `createScopedTool` for per-mode permission narrowing. What is missing is behavioral guidance: when to use each tool, when NOT to, priority ordering vs alternatives, few-shot examples of correct invocation, and cross-tool coordination instructions.

### Recommendation 1: Enrich Tool Descriptions with Behavioral Guidance

For each of the 10 registered tools, expand the `description` field from a single sentence to a structured prompt following Claude Code's five-part anatomy: purpose, usage guidance, behavioral constraints, priority ordering, and examples. Prioritize the highest-traffic tools first:

- **workflowState**: Add guidance on when to use `read` vs other state-reading approaches, when mode transitions are appropriate, and what state fields are available.
- **manageTodos**: Add guidance on backlog scanning patterns, when to use `list` vs `read`, and how todo status flow works.
- **runChecks**: Add guidance on which checks to run when, timeout expectations, and how to interpret convergence tracking output.

### Recommendation 2: Add `input_examples` to Complex Tools

Anthropic's API now supports a dedicated `input_examples` field on tool definitions (schema-validated, ~20-50 tokens per simple example). For tools with complex action patterns like `workflowState` (11 actions) and `manageTodos` (6 actions), add 2-3 concrete input examples demonstrating common invocation patterns.

### Recommendation 3: Add Cross-Tool Coordination in Mode Instructions

Mode instruction files should include a "Tool Usage" section with bidirectional constraints specific to that mode. For example, in the execute mode: "Use `workflowState` with action `record-iteration` to log each execution pass. Do NOT use `sessionLedger` for tracking execution progress -- that tool is for finalization summaries only."

### Recommendation 4: Implement the Description-Enrichment Pattern Incrementally

Rather than rewriting all 10 tool descriptions at once, implement enrichment incrementally:

1. **Phase 1**: Enrich the 3 highest-traffic tools (workflowState, manageTodos, runChecks) with full behavioral guidance
2. **Phase 2**: Add `input_examples` to all action-based tools
3. **Phase 3**: Add cross-tool coordination to mode instruction files
4. **Phase 4**: Measure tool selection accuracy before and after enrichment

### Recommendation 5: Consider Progressive Tool Loading

For modes with many tools (like `luca:6-finalize` with 6 tools), consider Gemini CLI's progressive loading pattern: inject only tool names and brief descriptions initially, loading full schemas on first use. This would require Mastra framework support but could reduce context pressure in tool-heavy modes.

---

## 7. Key Principles

1. **Tool descriptions are prompts, not documentation.** They are serialized into the model's context and directly steer behavior. Write them as instructions, not reference material.

2. **Negative examples are as important as positive ones.** "Do NOT use X for Y" eliminates ambiguity that "Use Z for Y" alone leaves open.

3. **Fight the weights with repetition and emphasis.** When tool guidance contradicts trained model behavior (e.g., preferring Read over cat), reinforce at multiple layers and use strong language.

4. **Cross-tool coordination requires explicit instruction.** Models cannot infer tool relationships from schemas alone. State dependencies, ordering, and mutual exclusions explicitly.

5. **Tool descriptions serve dual audiences.** The invoking agent and any safety evaluator both need sufficient context to reason correctly.

6. **Measure the investment.** Claude Code allocates ~79% of its prompt token budget to tool definitions. Under-investing in tool descriptions is the single largest gap in most custom agent harnesses.

---

## Sources

### Anthropic Official

- [Writing Effective Tools for AI Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) -- Anthropic's canonical guide to tool description engineering, including naming, description structure, response design, and error handling
- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) -- Context engineering principles including tool design as a control surface
- [Define Tools - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) -- Official tool definition reference with `input_examples` specification and best practices
- [Making Claude Code More Secure and Autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing) -- Sandboxing architecture and permission reduction metrics

### Claude Code Analysis

- [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) -- Drew Breunig's analysis of dynamic prompt assembly including tool definition composition
- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) -- Extracted system prompts, 24 builtin tool descriptions, and sub-agent prompts updated per Claude Code release (v2.1.104)
- [Tools and System Prompt of Claude Code (Gist)](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) -- Complete tool descriptions and system prompt text extraction
- [Claude Code Prompts | Anatomy of an AI Coding Agent](https://ccprompts.info/) -- Catalog of 124 prompts across 9 categories with token counts per tool
- [Diving into Claude Code's Source Code](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code) -- Analysis of permission critic pattern, anti-distillation, and tool security architecture

### Agent Building Patterns

- [How to Build Your Agent: 11 Prompting Techniques](https://www.augmentcode.com/blog/how-to-build-your-agent-11-prompting-techniques-for-better-ai-agents) -- Augment Code's techniques including tool calling limitations, consistency across prompt components, and cache-aware structuring
- [Prompts Are Infrastructure: Building Agents That Actually Listen](https://www.augmentcode.com/blog/prompts-are-infrastructure-building-agents-that-actually-listen) -- Four-layer prompting architecture (system prompts, tools, skills, user messages) and tool descriptions as hidden prompts
- [AI Agent Prompt Engineering: 10 Patterns That Actually Work](https://paxrel.com/blog-ai-agent-prompts) -- Production patterns including progressive disclosure and guard rails

### Fighting the Weights

- [Don't Fight the Weights](https://www.dbreunig.com/2025/11/11/don-t-fight-the-weights.html) -- Drew Breunig on recognizing and mitigating conflicts between prompt instructions and model training data

### Competing Agent Architectures

- [Gemini CLI (GitHub)](https://github.com/google-gemini/gemini-cli) -- Open-source agent with progressive tool discovery and Agent Skills system
- [Gemini CLI Tools Reference](https://geminicli.com/docs/reference/tools/) -- Tool definition structure and schema documentation
- [Codex CLI Agent Approvals & Security](https://developers.openai.com/codex/agent-approvals-security) -- Sandbox-first security model and tool annotation system
- [Codex CLI Sandboxing](https://developers.openai.com/codex/concepts/sandboxing) -- Docker-based isolation as alternative to behavioral safety guidance
