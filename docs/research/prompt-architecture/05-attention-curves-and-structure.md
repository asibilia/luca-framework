# Attention Curves, Positional Bias, and Prompt Structure Optimization

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How positional attention, formatting strategies, and structural ordering affect LLM instruction adherence, with implementation guidance for luca-mastracode

---

## Executive Summary

Transformer-based language models do not attend uniformly to their input. Research consistently demonstrates a **U-shaped attention distribution** -- peak focus at the beginning (primacy) and end (recency) of a prompt, with measurable degradation in the middle. This is not a bug but an artifact of causal masking and training data distributions. Claude Code exploits this pattern deliberately, placing identity and safety constraints at the start and repeating critical rules at the end. This document synthesizes the academic literature, reverse-engineered production practices, and formatting research into concrete structural recommendations for luca-mastracode's prompt architecture.

---

## 1. The "Lost in the Middle" Phenomenon

### The Foundational Paper

Liu et al. (2023) published the seminal study "Lost in the Middle: How Language Models Use Long Contexts," evaluating model performance on multi-document question answering and key-value retrieval as a function of where relevant information appeared in the input. The central finding: **performance is highest when relevant information occurs at the beginning or end of the input context, and significantly degrades when models must access information in the middle** -- even for models explicitly trained on long contexts.

The paper tested models across varying context lengths (4 to 2048 documents). The degradation was not subtle. In some configurations, middle-positioned relevant information caused performance to drop below a **closed-book baseline** -- meaning the long context actively hurt the model compared to having no context at all.

**Citation:** Liu, N.F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni, F., & Liang, P. (2024). Lost in the Middle: How Language Models Use Long Contexts. *Transactions of the Association for Computational Linguistics*, 12. [arXiv:2307.03172](https://arxiv.org/abs/2307.03172)

### Follow-Up: Found in the Middle

Hsieh et al. (2024) established the direct connection between the lost-in-the-middle phenomenon and intrinsic attention bias. Their calibration mechanism -- adjusting attention weights to compensate for positional bias -- improved retrieval-augmented generation performance by up to **15 percentage points** across tasks. This confirmed the problem is architectural, not prompt-engineering failure: the U-shaped attention distribution is baked into transformer attention patterns.

**Citation:** Hsieh, C.-Y., et al. (2024). Found in the Middle: Calibrating Positional Attention Bias Improves Long Context Utilization. *Findings of ACL 2024*. [arXiv:2406.16008](https://arxiv.org/abs/2406.16008)

---

## 2. The U-Shaped Attention Curve

### Primacy and Recency in LLMs

The U-shaped attention curve mirrors a well-studied phenomenon in human cognitive science -- the serial position effect -- but arises from different mechanisms in transformers. Luo et al. (2024) conducted a systematic study of serial position effects across encoder-decoder and decoder-only architectures. Key findings:

- **Primacy effects dominated**, appearing in 73 of 104 test instances across models and tasks
- **Recency effects** were more pronounced in summarization tasks but generally weaker than primacy
- As input length increases, attention concentrates toward the beginning, suggesting that **prompt length amplifies the primacy bias**
- GPT-4 showed variable behavior -- no serial position effects in label shuffling but significant effects in summarization
- Chain-of-thought prompting provided moderate mitigation but did not eliminate the effects

**Citation:** Luo, Z., et al. (2024). Serial Position Effects of Large Language Models. [arXiv:2406.15981](https://arxiv.org/html/2406.15981v1)

### Mechanistic Explanation

Janik (2023) drew parallels between LLM behavior and human memory research, arguing the U-shape arises from the interaction between two forces:

1. **Primacy from causal masking**: In autoregressive models, early tokens are attended to by all subsequent tokens. The first tokens accumulate the most aggregate attention across layers simply by virtue of being visible to every position.
2. **Recency from working memory analogy**: Recent tokens are in the model's "short-term" processing buffer -- the final layers process them with the freshest activation states.

Training data composition also matters. Models trained on tasks emphasizing end-of-sequence retrieval (running-span tasks) develop recency bias; those trained on uniform retrieval develop primacy bias. Joint training on both produces the canonical U-shape.

**Citation:** Janik, R.A. (2023). Aspects of Human Memory and Large Language Models. [arXiv:2311.03839](https://arxiv.org/html/2311.03839v3)

### Model-Specific Biases

Research shows the balance between primacy and recency varies by model:

| Model | Dominant Bias | Notes |
|-------|--------------|-------|
| GPT-3.5 / GPT-4 | Primacy dominant | Both effects present, primacy stronger |
| GPT-J | Recency dominant | Unusual recency-first pattern |
| Claude family | Balanced U-shape | Strong primacy + strong recency |
| T5 / Flan-T5 | Primacy dominant | Consistent across datasets |
| Llama 2 | Variable | Exhibits "middle effect" on some tasks |

---

## 3. Claude Code's Attention Curve Exploitation

### Structural Layout

Reverse-engineering of Claude Code's system prompt (via public source analysis and community research) reveals deliberate positional exploitation:

```
[START - PEAK PRIMACY]
  Identity (1-3 sentences: "You are Claude, made by Anthropic")
  Security / Safety constraints (NEVER rules)
  Permission framework (reversibility/blast radius)

[UPPER-MIDDLE - DECLINING ATTENTION]
  Coding philosophy and behavioral principles
  Tone and style directives
  Tool usage policy and priority ordering

[LOWER-MIDDLE - ATTENTION TROUGH]
  Tool definitions (~73k characters across 36+ tools)
  Domain knowledge (loaded on demand)

[END - PEAK RECENCY]
  Environment context (cwd, platform, date, model)
  CLAUDE.md / project rules
  system-reminder tags re-injecting critical constraints
```

This layout is not accidental. The identity anchoring at the start exploits primacy bias to establish behavioral grounding that persists throughout the conversation. The `<system-reminder>` mechanism at the end exploits recency bias -- re-asserting critical rules at the point closest to the model's next generation step.

### The system-reminder Mid-Conversation Pattern

Claude Code combats context rot (instruction adherence degrading after ~80K tokens) by injecting `<system-reminder>` tags into the message stream. These appear inside tool results and user messages, re-stating behavioral rules that have drifted out of the attention window. Critically, these go in the **message layer**, not the system prompt, to preserve prompt cache validity.

This is attention curve exploitation applied longitudinally: as the conversation grows, the model's "beginning" (system prompt) becomes proportionally more distant. system-reminders create synthetic recency anchors for critical constraints.

### Negative Constraint Framing

Claude Code's constraints are predominantly negative ("NEVER do X") rather than positive ("always do Y"). Analysis from Feng Liu's reverse-engineering study notes that negative constraints are **stronger than positive instructions** because they target specific observed failure modes. General positive instructions are ambiguous; specific negative instructions are actionable. This aligns with attention research: the model processes a tightly scoped prohibition more reliably than a broad aspiration, especially in the attention trough.

**Sources:** [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html); [The Complete Guide to Writing Agent System Prompts](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1); [Claude Code Prompts | ccprompts.info](https://ccprompts.info/)

---

## 4. Formatting Strategies Ranked by Effectiveness

### The Formatting Impact Hierarchy

Research on prompt formatting impact (Gao et al., 2024) tested multiple formats across GPT-3.5-turbo and GPT-4 models. The findings establish a clear hierarchy:

**Tier 1 -- Structural format (highest impact):** Changing the overall format (Markdown, JSON, YAML, plain text) produced performance variations of up to **40% on GPT-3.5-turbo** and up to 200% on specific code translation tasks. Larger models (GPT-4) are more robust to format changes but still show measurable differences.

**Tier 2 -- Structural elements (high impact):** Headings, lists, tables, and code blocks produced double-digit percentage point improvements on complex tasks by guiding the model through logical structure.

**Tier 3 -- Emphasis markers (low impact):** Bold, italics, UPPERCASE, and markers like "CRITICAL:" or "IMPORTANT:" had subtle and inconsistent effects. Models do not reliably interpret typographic emphasis as semantic priority.

**Citation:** Gao, Y., et al. (2024). Does Prompt Formatting Have Any Impact on LLM Performance? [arXiv:2411.10541](https://arxiv.org/html/2411.10541v1)

### Format-Specific Findings

| Format | Best For | Evidence |
|--------|----------|----------|
| **XML tags** | Section boundaries, data/instruction separation, Claude models | Anthropic's official recommendation; reduces misinterpretation in mixed-content prompts |
| **Markdown headers** | Hierarchical structure, human readability | GPT-4 shows preference; widely effective for section navigation |
| **Bullet lists** | Independent, testable rules | More parseable than prose; each bullet is a discrete constraint |
| **Tables** | Comparative information, decision matrices | Strong for lookup-style reference within prompts |
| **JSON/YAML** | Structured data, schema definitions | JSON showed 42% accuracy improvement over Markdown on MMLU for GPT-3.5 |
| **Plain text prose** | Simple instructions | Worst performer on most code generation tasks |

### Anthropic's Official Recommendations

Anthropic's prompt engineering documentation explicitly recommends XML tags for Claude models:

> "XML tags help Claude parse complex prompts unambiguously, especially when your prompt mixes instructions, context, examples, and variable inputs."

Key guidance from the official docs:
- Use consistent, descriptive tag names (e.g., `<instructions>`, `<context>`, `<example>`)
- Nest tags for natural hierarchies
- **Place longform data at the top**, queries at the bottom -- queries at the end improve response quality by up to **30%** on complex multi-document inputs
- Wrap examples in `<example>` tags; include 3-5 examples for best results
- There are no canonical "best" XML tags -- use names that match the content they surround

**Source:** [Anthropic Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices); [Use XML tags to structure your prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags)

### The UPPERCASE / "CRITICAL:" Question

Despite widespread use in production prompts (including Claude Code itself), the evidence for typographic emphasis markers is weak:

- Research shows models do not consistently interpret bold, italics, or UPPERCASE as increased priority
- Too much emphasis (excessive bolding, caps, nested markers) **dilutes** the impact of genuinely critical instructions
- Structural hierarchy (headers, XML tags) is a more reliable attention signal than inline emphasis
- Claude Code's own source reveals a shift in guidance for Claude 4.6: "Where you might have said 'CRITICAL: You MUST use this tool when...', you can use more normal prompting like 'Use this tool when...'" -- suggesting the newer, more capable model responds less to shouting and more to clear structure

---

## 5. Optimal Prompt Section Ordering

### The Recommended Architecture

Synthesizing the academic research and reverse-engineered production patterns, the optimal ordering for an agent system prompt is:

```
1. IDENTITY (1-3 sentences)                    [Primacy peak]
   - Role, creator, core purpose
   - Strongest behavioral anchor

2. SAFETY / HARD CONSTRAINTS                    [Primacy zone]
   - NEVER rules, security boundaries
   - Permission framework (reversibility)

3. TONE AND STYLE                               [Upper-middle]
   - Output format, verbosity constraints
   - Quantified limits (word counts)

4. CORE WORKFLOW / METHODOLOGY                  [Middle]
   - Behavioral principles (not procedures)
   - Decision-making framework
   - Use heavy structural formatting here

5. TOOL USAGE POLICY                            [Middle]
   - Priority ordering
   - Bidirectional constraints (use X, NOT Y)
   - Tool-specific behavioral descriptions

6. DOMAIN KNOWLEDGE / CONTEXT                   [Lower-middle]
   - Dynamically loaded, not pre-stuffed
   - Structured with XML tags for parseability

7. ENVIRONMENT INFO                             [Approaching end]
   - Runtime context (cwd, platform, date)
   - Session state, git status

8. REPEATED CRITICAL RULES                      [Recency peak]
   - 2-3 most important constraints restated
   - Safety rules echoed from section 2
```

### Why This Order Works

- **Sections 1-2** exploit primacy bias for identity anchoring and safety grounding
- **Sections 3-5** occupy the attention trough but use heavy structural formatting (headers, bullets, XML tags, tables) to compensate for reduced attention
- **Sections 6-7** place variable/dynamic content near the end where it benefits from recency and avoids polluting the cached static prefix
- **Section 8** exploits recency bias to reinforce the constraints most likely to drift during long conversations

---

## 6. When Repetition Helps vs. Wastes Tokens

### The Prompt Repetition Research

Leviathan et al. (2025) from Google Research conducted a systematic study of prompt repetition across seven models (Gemini, GPT, Claude, DeepSeek). Key findings:

- Repeating the input prompt won **47 out of 70 benchmark-model tests with 0 losses** when reasoning was disabled
- Benefits were significant for non-reasoning tasks (classification, retrieval, QA)
- When reasoning was enabled, the effect was mostly neutral to slightly positive
- A padding control (adding filler characters to match length) did **not** produce the same gains, confirming the benefit comes from repetition itself, not merely longer input

**Citation:** Leviathan, Y., et al. (2025). Prompt Repetition Improves Non-Reasoning LLMs. [arXiv:2512.14982](https://arxiv.org/abs/2512.14982)

### When Repetition Helps

- **Safety constraints**: Repeating the 2-3 most critical rules at the end of the system prompt reinforces them through recency bias. This is Claude Code's pattern.
- **Long conversations**: As context grows, early instructions become proportionally more distant. Mid-conversation re-injection (system-reminders) is a form of targeted repetition that combats context rot.
- **Non-reasoning tasks**: Classification, retrieval, and structured output tasks benefit most from repetition.

### When Repetition Wastes Tokens

- **Short prompts**: If the entire prompt fits in the primacy+recency attention window, repetition adds cost without benefit.
- **Reasoning-heavy tasks**: Models using chain-of-thought or extended thinking already attend to instructions more carefully; repetition yields diminishing returns.
- **Bulk repetition**: Repeating entire prompt sections (instead of targeted 2-3 critical rules) dilutes the signal-to-noise ratio and accelerates context window consumption.

### The Prompt Length Penalty

Research consistently shows diminishing returns with prompt length:
- Comprehension drops ~12% for every 100 words beyond 500 words
- Beyond ~3,000 tokens, reasoning performance begins degrading
- A well-structured 16K-token prompt with RAG outperformed a monolithic 128K-token prompt in both accuracy and relevance
- Hallucination rates increase with prompt length

**Implication:** Repetition should be surgical -- repeat only the highest-priority constraints, and only at structural boundaries (start and end of system prompt, periodic mid-conversation reminders). Do not repeat middle-tier instructions.

---

## 7. "Fighting the Weights"

### The Concept

Breunig (2025) coined the term "fighting the weights" to describe when prompt instructions contradict patterns deeply embedded in model training data. This is worse than the model lacking knowledge of a pattern because **what it knows is actively at odds with your goal**.

### Manifestations

| Scenario | What Happens | Why |
|----------|-------------|-----|
| **Format conflicts** | Model wraps JSON in explanatory text and markdown code blocks | Post-training teaches conversational responses |
| **Tool format mismatches** | Model fails to call tools correctly | RL-trained tool-calling format differs from your harness |
| **Tone resistance** | Model reverts to default tone despite instructions | RLHF politeness patterns override prompt directives |
| **Alignment overrides** | Model refuses legitimate tasks | Safety training triggers on superficial pattern matches |

### Recognition Signals

You are likely fighting the weights if:
- The model repeats the same errors despite instruction changes
- Few-shot examples appear to be ignored
- Tasks progress 90% then stall at the same point
- You resort to repetition, ALL CAPS, or pleading

### Mitigation Strategies

1. **Task decomposition**: Break the conflicting task into sub-steps that individually align with training
2. **Model switching**: Use a model whose training aligns with your requirements
3. **Longer context with examples**: Sufficient few-shot examples can "overwhelm the weights" for that session
4. **Structured output forcing**: Use tool calling or structured output schemas to bypass format resistance
5. **Accept the grain**: Work with the model's natural tendencies rather than against them

**Source:** [Don't Fight the Weights](https://www.dbreunig.com/2025/11/11/don-t-fight-the-weights.html) -- Drew Breunig

---

## 8. Few-Shot Examples vs. Instructions

Research consistently shows that **few-shot examples and instructions are complementary, not interchangeable**:

- Few-shot prompting outperforms zero-shot (instruction-only) for most tasks, especially complex ones
- Instructions alone are ambiguous; examples provide concrete grounding for what "correct" looks like
- Diminishing returns set in after 2-3 examples for most tasks
- Beyond ~20 examples, models struggle with long-context comprehension, producing single-class or random outputs
- The optimal approach: **explicit instructions supplemented by 3-5 carefully chosen examples**, wrapped in `<example>` tags

For agent system prompts specifically, few-shot examples are most valuable for:
- Tool invocation patterns (showing correct tool call formatting)
- Output format demonstration (showing exactly what the response should look like)
- Edge case handling (showing how to handle ambiguous situations)

---

## 9. Implementation Recommendations for luca-mastracode

### Structural Changes (High Priority)

1. **Reorder mode instruction files** to follow the 8-section architecture in Section 5. Move identity and safety constraints to the first 10 lines. Move the 2-3 most critical constraints to a repeated block at the end.

2. **Add `<luca-reminder>` mid-conversation injection** at tool-call boundaries (every N turns or every M tokens). Re-inject hard constraints and mode boundaries. Use the message layer, not system prompt modification, to preserve cache boundaries.

3. **Replace prose instructions with structural formatting** in the middle sections. Use markdown headers for section navigation, bullet lists for discrete rules, tables for reference data, and XML tags for data/instruction separation.

### Formatting Changes (Medium Priority)

4. **Replace UPPERCASE/CRITICAL markers with structural hierarchy.** Instead of "CRITICAL: Never do X," use a dedicated `## Hard Constraints` section with bullet points. The heading provides the priority signal more reliably than inline emphasis.

5. **Add bidirectional constraints** to all tool usage sections: "Use Read for file access. Do NOT use cat/head/tail via Bash for file reading."

6. **Add 2-3 few-shot examples** for tool invocation patterns in each mode, wrapped in `<example>` tags.

### Repetition Strategy (Medium Priority)

7. **Repeat only the top 2-3 constraints** at both start and end of system prompt. Do not repeat operational details.

8. **Implement periodic rule refresh** (every ~20 tool calls or ~40K tokens) via message-layer injection. Target only safety constraints and mode boundaries -- not the full instruction set.

### Anti-Pattern Avoidance

9. **Do not fight the weights.** If a mode instruction consistently fails to produce desired behavior despite clear prompting, investigate whether the instruction contradicts training data. Consider task decomposition or working with the model's natural tendencies.

10. **Do not exceed ~500 words of prose instructions per section.** Use structured formatting to increase information density without increasing word count. A table or bullet list conveys more than an equivalent paragraph.

---

## 10. Sources

### Academic Papers

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) -- Liu, N.F., et al. (2024). *TACL*, 12.
- [Found in the Middle: Calibrating Positional Attention Bias Improves Long Context Utilization](https://arxiv.org/abs/2406.16008) -- Hsieh, C.-Y., et al. (2024). *Findings of ACL 2024*.
- [Serial Position Effects of Large Language Models](https://arxiv.org/html/2406.15981v1) -- Luo, Z., et al. (2024).
- [Aspects of Human Memory and Large Language Models](https://arxiv.org/html/2311.03839v3) -- Janik, R.A. (2023).
- [Does Prompt Formatting Have Any Impact on LLM Performance?](https://arxiv.org/html/2411.10541v1) -- Gao, Y., et al. (2024).
- [Prompt Repetition Improves Non-Reasoning LLMs](https://arxiv.org/abs/2512.14982) -- Leviathan, Y., et al. (2025).
- [Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models](https://arxiv.org/html/2408.02442v1) -- (2024).
- [Exploiting Primacy Effect To Improve Large Language Models](https://arxiv.org/html/2507.13949) -- (2025).
- [Insights into LLM Long-Context Failures: When Transformers Know but Don't Tell](https://arxiv.org/html/2406.14673v1) -- (2024).

### Anthropic Official Documentation

- [Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) -- Claude API Docs
- [Use XML Tags to Structure Your Prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags) -- Claude API Docs

### Reverse Engineering and Industry Analysis

- [How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) -- Drew Breunig
- [Don't Fight the Weights](https://www.dbreunig.com/2025/11/11/don-t-fight-the-weights.html) -- Drew Breunig
- [The Complete Guide to Writing Agent System Prompts](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1) -- Feng Liu
- [Claude Code Prompts | Anatomy of an AI Coding Agent](https://ccprompts.info/) -- Community catalog
- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) -- Extracted system prompts
- [Diving into Claude Code's Source Code](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code) -- Engineer's Codex
- [Claude Code Feels Dumber? The System Prompt Architecture Trap](https://support.tools/claude-code-system-prompt-behavior-claude-md-optimization-guide/) -- Support Tools
- [The Impact of Prompt Bloat on LLM Output Quality](https://mlops.community/the-impact-of-prompt-bloat-on-llm-output-quality/) -- MLOps Community
- [Disadvantage of Long Prompt for LLM](https://blog.promptlayer.com/disadvantage-of-long-prompt-for-llm/) -- PromptLayer
- [Markdown vs. XML in LLM Prompts: A Comparative Analysis](https://www.robertodiasduarte.com.br/en/markdown-vs-xml-em-prompts-para-llms-uma-analise-comparativa/)
- [Long LLM Prompts: Hidden Drawbacks & Smarter Strategies](https://www.augmentcode.com/guides/long-llm-prompts-hidden-drawbacks-and-smarter-strategies) -- Augment Code
