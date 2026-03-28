# LLM Agent Step Reliability: Research Report

Research on how production AI agent frameworks handle step compliance and academic findings on LLM instruction-following failure modes.

## 1. How Production Frameworks Handle Step Reliability

### LangGraph: Graph-Based State Machines

LangGraph compiles workflows into DAGs where nodes only execute when reached via valid edges from predecessor nodes. Step skipping is structurally impossible because nodes cannot be invoked independently.

**Mechanism:** Typed state schemas (TypedDict) persist across all nodes. Edges must be explicitly declared via `add_edge()` or `add_conditional_edges()`. Every node execution produces a checkpoint, enabling replay and recovery.

**Source:** [LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/workflows-agents)

### Temporal: Durable Execution Engine

Temporal enforces a critical separation: **workflow code must be deterministic**, but the AI agent can make decisions based on non-deterministic LLM outcomes. LLM decisions are wrapped in Activities (non-deterministic execution units) called from within deterministic Workflow code. When failures occur, the workflow replays prior decisions from its Event History.

**Source:** [Temporal AI Agent Blog](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal)

### DSPy: Assertions and Computational Constraints

DSPy introduces `Assert` (hard constraints) and `Suggest` (soft constraints) as programmatic elements. When an assertion fails, the system retries with contextual feedback.

**Measured results:**

- QuizGen: JSON formatting compliance improved from 37.6% to 98.8%
- TweetGen: Quality improved from 2.0% to 73.0%
- Constraints passed "up to 164% more often" with assertion-driven optimization

**Source:** [DSPy Assertions Paper](https://arxiv.org/html/2312.13382v2)

### Strands Agents SDK: Steering Hooks

Steering hooks achieved **100% task completion accuracy** where simple prompts (82.5%), graph workflows (80.8%), and no guidance (15.7%) all failed. Hooks operate through just-in-time guidance at two critical decision points: before tool calls and after model responses.

**Measured results (600 runs, 100 per scenario):**

| Approach                | Pass Rate | Tokens Used |
| ----------------------- | --------- | ----------- |
| Steering hooks          | 100.0%    | 3,346       |
| SOPs (detailed prompts) | 99.8%     | 9,879       |
| Simple instructions     | 82.5%     | 2,329       |
| Graph workflows         | 80.8%     | 3,116       |
| No guidance             | 15.7%     | 1,870       |

**Source:** [Strands Steering Hooks](https://strandsagents.com/blog/steering-accuracy-beats-prompts-workflows/)

### GraphBit: Deterministic Execution Engine

GraphBit inverts the traditional model: **Workflow Graph -> Deterministic Execution Engine -> Agents Plug In**. Agents do not control the workflow; the engine does.

**Source:** [GraphBit Overview](https://www.marktechpost.com/2025/12/27/how-to-build-production-grade-agentic-workflows-with-graphbit-using-deterministic-tools-validated-execution-graphs-and-optional-llm-orchestration/)

### Blueprint First, Model Second

Codify the operational procedure into a source code-based Execution Blueprint executed by a deterministic engine. The LLM is invoked as a specialized tool for bounded sub-tasks, but **never decides the workflow's path**.

**Measured results on tau-bench:**

- 10.1 percentage point accuracy improvement over best baseline
- 81.8% reduction in tool calls
- 66.7% reduction in conversational turns

**Source:** [Blueprint First, Model Second](https://arxiv.org/html/2508.02721v1)

## 2. Why LLMs Skip Steps

### The "Lost in the Middle" Effect

LLMs exhibit a U-shaped attention curve where they attend most to information at the beginning and end of context, with **30%+ accuracy degradation** for information positioned in the middle of long inputs. This is a positional bias hardwired into the transformer attention architecture.

For Luca: steps 4-6 of an 8-step workflow fall in the worst possible position for attention. Code execution (early, visible) and git push (late, visible) work; verification and learning capture (middle, invisible) get dropped.

**Source:** [Lost in the Middle](https://arxiv.org/abs/2307.03172) (Liu et al., Stanford/Meta, ACL 2024)

### Cognitive Load / Finite Focus

LLMs have a finite focus analogous to Miller's Law (7 +/- 2 items). When LLMs allocate attention to secondary tasks, "other things fall out of focus much like how we forget where we placed our keys when distracted."

**Source:** [Feathers, "Recency Bias or Cognitive Load?"](https://michaelfeathers.substack.com/p/recency-bias-or-cognitive-load)

### InFoBench: Decomposed Requirement Compliance

Even GPT-4 fails to fulfill over 10% of decomposed requirements. When instructions are decomposed into individual constraints, LLMs show consistent weakness in "Number" and "Linguistic" constraints.

**Source:** [InFoBench, ACL 2024](https://aclanthology.org/2024.findings-acl.772/)

### Optimization Bias

LLMs are optimized to be helpful and aligned with perceived user intent. When a workflow has a clear "main goal" (write code, fix a bug), the LLM optimizes for that goal and treats auxiliary steps as optional overhead.

**Source:** [USC AI Beat: Cognitive Bias Patterns in LLMs](https://libguides.usc.edu/blogs/USC-AI-Beat/bias-patterns-llms)

## 3. Known Failure Modes (MASFT Taxonomy)

From 150+ execution traces across 5 frameworks, the MASFT taxonomy identifies these directly relevant failure modes:

- **FM-1.1: Disobeying task specifications** -- agents ignore explicit instructions
- **FM-1.5: Unawareness of termination conditions** -- agents stop before all steps complete
- **FM-3.1: Premature task termination** -- agents declare success prematurely
- **FM-3.2: Absent or incomplete verification** -- verification steps get skipped
- **FM-3.3: Incorrect verification processes** -- when verification runs, it runs incorrectly

**Critical statistic:** Tactical fixes (prompt improvements, topology redesign) yielded only **+14% improvement**. Structural system redesigns are necessary.

**Source:** [MASFT, arXiv 2503.13657](https://arxiv.org/html/2503.13657v1)

## 4. Techniques for Enforcing Workflow Structure

### Technique 1: Deterministic Code Wrapping LLM Calls

Each workflow step becomes a function in a TypeScript execution blueprint. The blueprint calls the LLM for each step's content but controls progression programmatically.

### Technique 2: Step Completion Ledger with Hook Validation

Maintain a JSON ledger of completed steps. Before allowing completion, a post-execution hook validates that all required steps have entries. If learning capture is missing, the hook blocks completion.

### Technique 3: Pre-Step Context Isolation

Instead of loading the entire skill markdown, load only the current step's specification plus minimal context. Prevents "lost in the middle" attention degradation.

### Technique 4: Assertion-Style Output Validation

After each step, validate output meets minimum criteria. If learning capture produces no content, retry rather than accepting empty result.

### Technique 5: JSON Over Markdown for Workflow State

Anthropic found that "the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files."

**Source:** [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## 5. The Mathematical Reality

With 90% per-step compliance and a 15-step workflow:

- P(all complete) = 0.9^15 = **20.6%**
- At 95%: 0.95^15 = **46.3%**
- At 99%: 0.99^15 = **86.0%**
- At 99.9%: 0.999^15 = **98.5%**

Only at 99.9% per-step compliance does a 15-step workflow reach 98.5% full completion. Prompt engineering alone cannot achieve 99.9%. Structural enforcement is required.

## Sources

- [LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Temporal: Building Dynamic AI Agents](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal)
- [DSPy Assertions](https://arxiv.org/html/2312.13382v2)
- [Strands Agents Steering Hooks](https://strandsagents.com/blog/steering-accuracy-beats-prompts-workflows/)
- [Blueprint First, Model Second](https://arxiv.org/html/2508.02721v1)
- [AgentSpec (ICSE 2026)](https://arxiv.org/html/2503.18666)
- [AWS AI Agent Guardrails](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d)
- [FlowAgent](https://arxiv.org/html/2502.14345)
- [Anthropic: Effective Harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic: Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [MASFT Taxonomy](https://arxiv.org/html/2503.13657v1)
- [Galileo Failure Modes](https://galileo.ai/blog/agent-failure-modes-guide)
- [AgentErrorTaxonomy](https://arxiv.org/abs/2509.25370)
- [Lost in the Middle](https://arxiv.org/abs/2307.03172)
- [InFoBench (ACL 2024)](https://aclanthology.org/2024.findings-acl.772/)
- [GraphBit](https://www.marktechpost.com/2025/12/27/how-to-build-production-grade-agentic-workflows-with-graphbit-using-deterministic-tools-validated-execution-graphs-and-optional-llm-orchestration/)
- [StateFlow](https://arxiv.org/html/2403.11322v1)
