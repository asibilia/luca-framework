# Agent Evaluation Frameworks: Domain Research

**Researched:** 2026-03-23
**Domain:** AI agent evaluation, LLM quality measurement, coding agent metrics
**Overall confidence:** MEDIUM-HIGH
**Prior art:** [Mastra Evaluation](../mastra-evaluation.md) decided against Mastra adoption; [Architectural Vision](../architectural-vision.md) proposes `src/eval/` as a new T1 core domain

---

## Executive Summary

The AI agent evaluation landscape in 2026 is mature and well-tooled. Several frameworks exist ranging from full-platform solutions (Braintrust, LangSmith, Confident AI/DeepEval) to open-source libraries (Promptfoo, Langfuse, EvalKit) to minimal patterns (Vitest + LLM-as-judge). All converge on similar architectural ideas: define test cases with inputs and expected behaviors, run agents against them, grade outputs with a mix of deterministic checks and LLM-based rubrics, and produce structured reports.

For Luca, the recommendation is **build a thin custom eval runner** (Bun-native, ~300-500 lines) that borrows design patterns from Promptfoo and Anthropic's published methodology, rather than adopting an external framework as a dependency. The reasoning:

1. Luca's agents are **prompt compiler outputs**, not runtime agents. No existing framework evaluates "does this markdown agent definition, when consumed by Claude Code, produce quality results?" The eval layer needs to call the Anthropic API directly with the compiled agent prompts.
2. External frameworks add dependency weight, version management, and conceptual overhead that conflicts with Luca's "no unnecessary dependencies" philosophy.
3. The eval surface is **small and well-scoped**: ~8 evaluable components (lu-router, cognitive pre-flight, convergence detector, 5 code reviewers). A custom runner can target these precisely.
4. Promptfoo was acquired by OpenAI (March 9, 2026). While still MIT-licensed, depending on an OpenAI-owned tool for evaluating Claude-based agents creates an awkward coupling.

---

## Framework Comparison

| Framework                   | Type                 | Language                | Open Source                         | Agent Eval             | CI/CD                 | Cost                          | Luca Fit                                       |
| --------------------------- | -------------------- | ----------------------- | ----------------------------------- | ---------------------- | --------------------- | ----------------------------- | ---------------------------------------------- |
| **Promptfoo**               | CLI + library        | TypeScript (96.6%)      | MIT                                 | Yes (custom providers) | Yes                   | Free (joined OpenAI)          | HIGH but vendor concern                        |
| **Braintrust**              | Platform + SDK       | TypeScript SDK          | Partial (SDK open, platform closed) | Yes (trace-based)      | GitHub Actions native | Free tier: 1M spans/mo        | MEDIUM -- platform dependency                  |
| **DeepEval / Confident AI** | Library + platform   | Python + TypeScript SDK | MIT (library)                       | Yes (50+ metrics)      | Yes                   | Free (library), paid platform | MEDIUM -- Python-primary                       |
| **Langfuse**                | Platform (self-host) | TypeScript              | MIT                                 | Yes (tracing + evals)  | Yes                   | Free (self-hosted)            | LOW -- observability focus, not eval           |
| **LangSmith**               | Platform             | Python + JS SDK         | Closed                              | Yes (trace evaluation) | Yes                   | Paid                          | LOW -- LangChain ecosystem lock-in             |
| **Mastra Evals**            | Built-in framework   | TypeScript              | MIT                                 | Yes (scorers)          | Yes                   | Free                          | LOW -- decided against Mastra adoption         |
| **EvalKit**                 | Library              | TypeScript (75%)        | Apache 2.0                          | Limited (9 metrics)    | Manual                | Free                          | LOW -- too early-stage (155 stars, 22 commits) |
| **Custom (Bun-native)**     | Library              | TypeScript              | N/A                                 | Full control           | Custom                | API costs only                | **HIGHEST**                                    |

### Detailed Framework Assessments

#### Promptfoo (HIGH relevance, vendor concern)

Promptfoo is the closest match to Luca's needs. It is TypeScript-native, provides a programmatic API for defining test cases, supports custom providers (so you could wrap Luca's compiled agent prompts as a provider), and produces structured JSON results.

**Strengths:**

- TypeScript-native with full programmatic API (`promptfoo.evaluate()`)
- Custom providers: define a `callApi()` function that wraps any LLM interaction
- Rich assertion types: exact match, substring, JSON schema, regex, LLM-graded rubrics, semantic similarity
- 300k+ developers, battle-tested
- MIT licensed

**Concerns:**

- Acquired by OpenAI (March 9, 2026). Still MIT-licensed but future direction uncertain.
- Evaluating Claude-based agents through an OpenAI-owned tool creates an odd dynamic.
- Heavy dependency for what Luca needs (Promptfoo does red-teaming, security scanning, multi-provider comparison -- Luca needs none of this).

**Confidence:** HIGH (verified via official docs and GitHub)

#### Braintrust (MEDIUM relevance)

**Strengths:**

- TypeScript SDK with trace-driven evaluation
- Native GitHub Actions CI/CD integration with PR comments showing regressions
- Free tier (1M trace spans, 10K eval scores/month)
- Supports both deterministic and LLM-as-judge scoring

**Concerns:**

- Platform dependency (SDK is open, but the platform is the value)
- Designed for runtime agents, not compiler-output agents
- Overkill for Luca's current scope

**Confidence:** MEDIUM (verified via docs and articles)

#### DeepEval / Confident AI (MEDIUM relevance)

**Strengths:**

- 50+ research-backed metrics including agent-specific ones (tool selection accuracy, planning quality)
- Multi-turn agent simulation
- Component-level evaluation (isolate individual steps)

**Concerns:**

- Python-primary (TypeScript SDK exists but is secondary)
- Luca is Bun-native; DeepEval is pip-install-native
- Platform coupling for advanced features

**Confidence:** MEDIUM (verified via GitHub and docs)

---

## Evaluation Methodology: What to Measure

### Anthropic's Recommended Approach (HIGH confidence)

Anthropic published authoritative guidance on agent evaluation that directly applies to Luca. Key principles:

1. **Multi-layered strategy**: Combine automated evals with human review
2. **Start small**: "20-50 simple tasks drawn from real failures is a great start"
3. **Three grader types**:

| Grader Type | Examples                                                    | Best For                         |
| ----------- | ----------------------------------------------------------- | -------------------------------- |
| Code-based  | String matching, JSON schema validation, state verification | Objective, reproducible checks   |
| Model-based | LLM rubrics, pairwise comparison                            | Open-ended quality assessment    |
| Human       | Expert review, calibration                                  | Subjective quality, ground truth |

4. **Key metrics**:
   - **pass@k**: Probability of at least 1 success across k attempts (measures capability)
   - **pass^k**: Probability ALL k attempts succeed (measures reliability)
   - Track latency, token usage, cost per task, error rates as baseline

5. **Critical pitfalls to avoid**:
   - Overly rigid grading (penalizing valid alternative solutions)
   - Ambiguous task specs (0% pass rate usually means broken task, not broken agent)
   - Saturation blindness (100% scores lose signal for improvement)
   - Single-run assessments (agents vary between runs; run multiple trials)

**Source:** [Anthropic Engineering: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Metrics Mapped to Luca Components

| Luca Component                             | Eval Type          | Primary Metric                                         | Grader Type                                 |
| ------------------------------------------ | ------------------ | ------------------------------------------------------ | ------------------------------------------- |
| **lu-router** (complexity classification)  | Deterministic      | Accuracy against labeled dataset                       | Code-based (exact match)                    |
| **Cognitive pre-flight** (context loading) | A/B comparison     | Quality improvement with/without                       | LLM-as-judge (rubric)                       |
| **Convergence detector** (halt timing)     | Deterministic      | True positive/negative rate                            | Code-based (threshold)                      |
| **Code reviewers** (5 agents)              | Quality assessment | Signal-to-noise ratio (real issues vs false positives) | LLM-as-judge + human calibration            |
| **lu-planner** (plan generation)           | Quality assessment | Plan completeness, task ordering quality               | LLM-as-judge (rubric)                       |
| **lu-executor** (task execution)           | End-to-end         | Task completion rate, code quality                     | Code-based (typecheck, lint) + LLM-as-judge |
| **Model routing** (tier selection)         | Deterministic      | Cost/quality tradeoff accuracy                         | Code-based (cost tracking)                  |
| **State machine** (transitions)            | Deterministic      | Transition correctness                                 | Code-based (state validation)               |

### SWE-bench Learnings (MEDIUM confidence)

SWE-bench research reveals important evaluation quality issues relevant to Luca:

- **Weak test problem**: 47.93% of "resolved" instances in SWE-bench have incorrect/incomplete patches that pass tests anyway. Lesson: Luca's evals must test beyond surface-level pass/fail.
- **Solution leakage**: 60.83% of SWE-bench issues contained hints or solutions in descriptions. Lesson: Eval inputs must not leak expected outputs.
- **pass@1 vs pass@3**: Reporting both capability (pass@k) and reliability (pass^k) gives a fuller picture.

**Source:** [SWE-bench Verified Technical Report](https://www.verdent.ai/blog/swe-bench-verified-technical-report)

---

## Recommended Approach: Custom Bun-Native Eval Runner

### Why Custom Over Library

| Factor                   | Custom         | Promptfoo                    | Braintrust                  |
| ------------------------ | -------------- | ---------------------------- | --------------------------- |
| Dependency weight        | Zero           | Medium (~50 transitive deps) | Medium                      |
| Bun-native               | Yes            | Node-optimized               | Node-optimized              |
| Luca-specific eval types | Built-in       | Requires custom providers    | Requires custom integration |
| Vendor independence      | Full           | OpenAI-owned                 | Platform-dependent          |
| Maintenance burden       | ~300-500 lines | External updates             | External updates            |
| Time to implement        | 2-3 days       | 1 day + ongoing config       | 1 day + ongoing config      |

### Architecture: `src/eval/`

Following the architectural vision's proposal for `src/eval/` as a T1 core domain:

```
src/eval/
├── __schemas/
│   └── eval.schemas.ts          # EvalCase, EvalResult, EvalReport Zod schemas
├── __helpers/
│   ├── eval-runner.ts           # Core: runs eval cases, collects results
│   ├── eval-reporter.ts         # Formats results as JSON/markdown reports
│   ├── eval-comparator.ts       # A/B comparison between runs
│   ├── graders/
│   │   ├── code-grader.ts       # Deterministic graders (exact match, regex, schema)
│   │   ├── llm-grader.ts        # LLM-as-judge grader (rubric-based)
│   │   └── composite-grader.ts  # Combines multiple graders with weights
│   └── providers/
│       └── anthropic-provider.ts # Calls Anthropic API with compiled agent prompts
└── index.ts                     # Barrel exports
```

### Eval Case Schema (Conceptual)

```typescript
const EvalCaseSchema = z.object({
  id: z.string(), // Unique identifier
  component: z.string(), // Which Luca component (lu-router, etc.)
  description: z.string(), // Human-readable description
  input: z.record(z.unknown()), // Input to the component
  expected: z.record(z.unknown()).optional(), // Expected output (for deterministic)
  rubric: z.string().optional(), // Rubric for LLM-as-judge grading
  grader: z.enum(["code", "llm", "composite"]), // Which grader to use
  tags: z.array(z.string()).default([]), // For filtering/grouping
  trials: z.number().default(3), // Number of runs (for reliability)
});

const EvalResultSchema = z.object({
  case_id: z.string(),
  trial: z.number(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  grader_output: z.record(z.unknown()),
  latency_ms: z.number(),
  token_usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
  cost_usd: z.number(),
  timestamp: z.string().datetime(),
});

const EvalReportSchema = z.object({
  run_id: z.string(),
  timestamp: z.string().datetime(),
  component: z.string(),
  total_cases: z.number(),
  pass_at_1: z.number(), // Capability: >= 1 pass across trials
  pass_at_k: z.number(), // Reliability: all trials pass
  avg_score: z.number(),
  total_cost_usd: z.number(),
  total_latency_ms: z.number(),
  results: z.array(EvalResultSchema),
});
```

### LLM-as-Judge Strategy

For subjective evaluations (code review quality, plan quality, cognitive pre-flight effectiveness), use a smaller/cheaper model as the judge:

| Judge Model      | Cost (per 1M tokens)       | Quality                        | Use For                                                 |
| ---------------- | -------------------------- | ------------------------------ | ------------------------------------------------------- |
| Claude Haiku 3.5 | $0.80 input / $4.00 output | Good for structured rubrics    | Code review signal/noise, plan completeness             |
| Claude Sonnet 4  | $3 input / $15 output      | Excellent for nuanced judgment | A/B comparisons, reasoning quality                      |
| Claude Opus 4    | $15 input / $75 output     | Best                           | Calibration runs only (to validate Haiku/Sonnet judges) |

**Recommended pattern**: Use Haiku for routine eval runs, Sonnet for weekly deep evals, Opus for quarterly calibration of the judge models themselves.

**Confidence:** HIGH (pricing verified against official Anthropic pricing page, 2026-03-23)

---

## Cost Optimization Strategies

### 1. Tiered Evaluation Cadence

| Tier            | Frequency       | Scope                                                            | Estimated Cost     |
| --------------- | --------------- | ---------------------------------------------------------------- | ------------------ |
| **Smoke**       | Every PR (CI)   | 5-10 cases per component, 1 trial, code graders only             | ~$0 (no LLM calls) |
| **Standard**    | Nightly/weekly  | Full case suite, 3 trials, LLM graders with Haiku                | ~$2-5 per run      |
| **Deep**        | Monthly/release | Full suite, 5 trials, Sonnet grader, A/B comparisons             | ~$20-50 per run    |
| **Calibration** | Quarterly       | Sample of cases with Opus grader to validate Haiku/Sonnet judges | ~$50-100 per run   |

### 2. Response Caching

Cache LLM responses for deterministic inputs. If the agent prompt and input haven't changed, reuse the cached response. This eliminates redundant API calls during iterative development.

### 3. Deterministic-First Grading

For lu-router (complexity classification), convergence detection, and state machine transitions, **code-based graders cost zero** -- no LLM calls needed. Only invoke LLM graders for subjective quality assessments.

### 4. Smaller Judge Models

LLM-as-judge research shows that well-structured rubrics enable smaller models to achieve 80%+ agreement with human preferences. Use Haiku with detailed rubrics for routine evaluation, reserving Sonnet/Opus for cases where Haiku's judgment is uncertain.

### 5. Synthetic Input Generation

Rather than manually crafting every eval case, generate synthetic inputs programmatically. For lu-router eval: generate task descriptions with known complexity characteristics. For code reviewers: use known-buggy code snippets from real projects.

### 6. Sample-Based Evaluation

For high-volume components, evaluate a statistical sample rather than every invocation. Braintrust and Mastra both support sampling rates (e.g., evaluate 10-20% of production traces). Luca's eval runner should support a `sampling` parameter.

### Overall Cost Estimate

With the tiered approach, routine eval costs would be **$10-30/month** for a development team running nightly standard evals and weekly deep evals. This is negligible compared to the LLM API spend during actual development.

---

## Patterns Borrowed From Existing Frameworks

### From Promptfoo

- **YAML/TypeScript dual config**: Define eval cases in YAML for simple cases, TypeScript for programmatic generation
- **Custom providers**: The `callApi()` pattern for wrapping any LLM interaction
- **Assertion composability**: Multiple assertions per test case with AND/OR logic
- **Watch mode**: Re-run evals as eval case files change during development

### From Anthropic's Methodology

- **Eval-driven development**: Define evals before building the feature, iterate until targets met
- **Environment isolation**: Each eval trial starts from clean state
- **Outcome over path**: Grade final results, not intermediate steps (avoid penalizing valid alternatives)
- **Partial credit**: Recognize intermediate successes as meaningful progress
- **Transcript review**: Always make raw agent outputs available for human inspection

### From Braintrust

- **GitHub Actions integration**: Post eval results as PR comments showing regressions
- **Regression gates**: Block merges that reduce quality below thresholds
- **Trace snapshots**: Record full traces for debugging failures

### From Mastra

- **Scorer sampling**: Control evaluation frequency with a rate parameter
- **Database persistence**: Store eval results for trend analysis over time
- **Experiment tracking**: Run the same eval dataset under different configurations (model, temperature, prompt variant) and compare

---

## Implementation Roadmap Implications

### Phase Ordering Rationale

1. **Eval schemas + code graders first** -- Zero LLM cost, covers lu-router, convergence detector, state machine. Immediate value for CI.
2. **LLM grader (Haiku) second** -- Enables code review quality evaluation, the highest-value subjective eval.
3. **Eval reporter + CI integration third** -- Makes evals visible in PRs and dashboards.
4. **A/B comparator fourth** -- Enables measuring whether changes improve agent quality.
5. **Eval dataset curation ongoing** -- Start with 20-50 cases (Anthropic's recommendation), grow organically from real failures.

### Dependencies

- Requires the **API adapter** from the adapter architecture to call Anthropic directly (not through Claude Code)
- Eval schemas should be defined in `src/eval/__schemas/` following existing domain patterns
- Reporter output should integrate with Luca Studio (when built)

### What NOT to Build

- **No web UI for eval management** -- Use YAML/TypeScript files in the repo, visualize in Luca Studio later
- **No multi-provider comparison** -- Luca targets Anthropic only; multi-provider comparison is Promptfoo's domain
- **No red-teaming/security scanning** -- Out of scope for agent quality evaluation
- **No real-time production monitoring** -- This is observability, not evaluation. Different concern.

---

## Open Questions

1. **How to eval compiled agents without Claude Code?** The API adapter is a prerequisite. The eval runner needs to send the compiled agent markdown as a system prompt to the Anthropic API, then evaluate the response. This is conceptually straightforward but requires the adapter to be built first.

2. **Ground truth for subjective evals?** For lu-router, ground truth is a labeled dataset of (task description -> complexity level) pairs. For code review quality, ground truth is harder -- need human-labeled "this is a real issue" / "this is noise" dataset. Start small (20-50 cases) and grow.

3. **Eval stability across model versions?** When Anthropic releases new Claude versions, eval results will shift. Need a strategy for re-baselining. Recommendation: version-tag eval baselines with the model version used.

4. **Multi-step workflow evaluation?** Evaluating the full lu workflow (router -> cognition -> plan -> execute -> review -> verify) end-to-end is expensive and slow. Start with component-level evals; add integration evals later when the DAG engine provides structured step boundaries.

---

## Sources

### Primary (HIGH confidence)

- [Anthropic Engineering: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Promptfoo Documentation](https://www.promptfoo.dev/docs/intro/)
- [Promptfoo Node Package API](https://www.promptfoo.dev/docs/usage/node-package/)
- [Promptfoo Custom Providers](https://www.promptfoo.dev/docs/providers/custom-api/)
- [Mastra Scorers Overview](https://mastra.ai/docs/evals/overview)
- [Braintrust Agent Evaluation Framework](https://www.braintrust.dev/articles/ai-agent-evaluation-framework)

### Secondary (MEDIUM confidence)

- [DeepEval Agent Evaluation Guide](https://deepeval.com/guides/guides-ai-agent-evaluation)
- [Confident AI: Best LLM Evaluation Tools for AI Agents in 2026](https://www.confident-ai.com/knowledge-base/best-llm-evaluation-tools-for-ai-agents)
- [SWE-bench Verified Technical Report](https://www.verdent.ai/blog/swe-bench-verified-technical-report)
- [CodeAnt: Evaluating LLM Agents in Multi-Step Workflows](https://www.codeant.ai/blogs/evaluate-llm-agentic-workflows)
- [Braintrust JavaScript SDK](https://github.com/braintrustdata/braintrust-sdk)
- [EvalKit GitHub](https://github.com/evalkit/evalkit)
- [Langfuse Evaluation Overview](https://langfuse.com/docs/evaluation/overview)

### Tertiary (LOW confidence -- informational only)

- [AI Agent Cost Optimization Guide 2026](https://moltbook-ai.com/posts/ai-agent-cost-optimization-2026)
- [LLM Evals with Vercel AI and Vitest](https://xata.io/blog/llm-evals-with-vercel-ai-and-vitest)
- [LLM-as-a-Judge Guide (Evidently AI)](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [Amazon: Evaluating AI Agents](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/)
- [OpenAI: Testing Agent Skills with Evals](https://developers.openai.com/blog/eval-skills)

---

## Pre-Grooming Notes (Tooling Validation)

**Validated:** 2026-03-23
**Validator:** tooling-validator

### Verified Claims

- **Promptfoo acquired by OpenAI** -- Verified. Announcement date was **March 9, 2026** (not "March 16" as stated in line 52; corrected in-place). Promptfoo remains MIT-licensed. Source: [OpenAI announcement](https://openai.com/index/openai-to-acquire-promptfoo/), [TechCrunch](https://techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/), [CNBC](https://www.cnbc.com/2026/03/09/open-ai-cybersecurity-promptfoo-ai-agents.html)
- **Braintrust free tier: 1M spans, 10K eval scores/month** -- Verified. Also includes 1GB/month processed data, 14-day retention, unlimited users. Pro tier is $249/month (unlimited spans/scores). Source: [Braintrust Pricing](https://www.braintrust.dev/pricing)
- **Braintrust native GitHub Actions integration with PR comments** -- Verified. The `braintrust-eval` action posts experiment results as PR comments. Source: [GitHub Marketplace](https://github.com/marketplace/actions/braintrust-eval)
- **DeepEval: Python-primary with TypeScript SDK as secondary** -- Verified. TypeScript SDK (`deepeval-ts`) exists for tracing via `observe()` wrapper functions, but the core library and most documentation remain Python-first. 50+ metrics claim is consistent with their documentation. Source: [DeepEval Docs](https://deepeval.com/docs/getting-started), [Confident AI TS SDK](https://documentation.confident-ai.com/llm-observability/integrations/typescript)
- **Langfuse: MIT-licensed, self-hosted, observability focus** -- Verified. Core platform is MIT-licensed and self-hostable. However, model-based evaluations within Langfuse UI require Enterprise license ($500/month). SDK-based evals remain free. Source: [Langfuse Self-Hosting](https://langfuse.com/self-hosting), [GitHub Discussion #3393](https://github.com/orgs/langfuse/discussions/3393)
- **EvalKit: 155 stars, 22 commits, Apache 2.0, TypeScript 75%** -- Verified exactly as stated. Source: [EvalKit GitHub](https://github.com/evalkit/evalkit)
- **Anthropic eval methodology (pass@k, pass^k, 20-50 starting cases, three grader types)** -- Verified against the actual blog post. All claims match. The blog post also uses Claude Code as a case study. Source: [Anthropic Engineering Blog](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- **SWE-bench weak test problem: 47.93% incorrect/incomplete patches** -- Verified. From SWE-Bench+ research paper. Additionally, 31.08% of passed patches are "suspicious" due to weak tests. Source: [arXiv:2503.15223](https://arxiv.org/html/2503.15223v1)
- **Mastra scorers: sampling rate parameter, database persistence, experiment tracking** -- Verified. Mastra supports `sampling.rate` (0-1) for controlling eval frequency. Source: [Mastra Scorers Overview](https://mastra.ai/docs/scorers/overview), [Mastra Evals Overview](https://mastra.ai/docs/evals/overview)

### Corrections

- **Promptfoo acquisition date: "March 16, 2026" was incorrect** -- CORRECTED in-place to March 9, 2026. The original text at line 52 said "March 16, 2026" while the executive summary (line 19) said "March 2026" (correct but imprecise). Both now corrected. Source: [TechCrunch](https://techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/)
- **Claude Haiku 3.5 pricing was wrong** -- CORRECTED in-place. Document stated "$0.25 input / $1.25 output" which is the pricing for **Claude Haiku 3** (the older, deprecated model). Actual Haiku 3.5 pricing: **$0.80 input / $4.00 output** per 1M tokens. This is a 3.2x difference on input, which materially affects the cost estimates. Source: [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- **Braintrust free tier: "10K eval scores/month"** -- The document says "10K" which is correct. However, it omits the 14-day retention limit and 1GB/month data cap, which could matter for ongoing eval storage. Minor omission, not a factual error.
- **Langfuse characterization as "LOW -- observability focus, not eval"** -- PARTIALLY INCORRECT. Langfuse does have evaluation features (LLM-as-judge, annotation queues, datasets, experiments). However, the self-hosted model-based eval feature requires Enterprise license ($500/month). The "LOW" Luca fit rating is still reasonable for different reasons: it is primarily an observability platform, and the eval features are secondary/gated. Source: [Langfuse Evaluation Overview](https://langfuse.com/docs/evaluation/overview)

### Unverified Claims

- **Promptfoo "300k+ developers"** -- Could not independently verify this specific number. Promptfoo's blog mentions usage by "25% of Fortune 500 companies" per the acquisition coverage, but "300k+ developers" is not cited in official sources. Recommend: Treat as approximate; the directional claim (large user base) is supported.
- **Promptfoo "~50 transitive deps"** -- Could not verify the exact dependency count without installing the package. Recommend: Run `bun add promptfoo && bun pm ls` to verify if this comparison point is important for the build-vs-buy decision.
- **Cost estimate "$10-30/month for tiered eval cadence"** -- The Haiku pricing correction ($0.80 vs $0.25 input) means the LLM-graded eval costs in the "Standard" and "Deep" tiers are **~3x higher than originally estimated**. The $10-30/month figure likely underestimates. Revised estimate: $20-60/month for nightly standard + weekly deep evals. See Cost Analysis Notes below.
- **Braintrust: "SDK is open, platform is closed"** -- The Braintrust SDK is open source ([GitHub](https://github.com/braintrustdata/braintrust-sdk)), but the exact licensing terms were not verified. The directional claim is supported.

### Tooling Pitfalls

- **Haiku 3.5 vs Haiku 3 confusion**: The document's original pricing matched Claude Haiku 3 (the older, cheaper model). If the eval runner is implemented with Haiku 3 pricing assumptions, the actual costs with Haiku 3.5 will be 3.2x higher on input. Ensure the runner uses the correct model identifier (`claude-3-5-haiku-20241022` or latest). Consider using Haiku 4.5 ($1/$5 per MTok) for better quality at modest cost increase.
- **Promptfoo post-acquisition risk**: While Promptfoo remains MIT-licensed today, OpenAI could relicense future versions or sunset maintenance. The custom-build recommendation is sound for this reason alone. Monitor the [Promptfoo GitHub](https://github.com/promptfoo/promptfoo) for license changes.
- **Model version drift**: The pricing table references specific model versions (Haiku 3.5, Sonnet 4, Opus 4). Anthropic now has Haiku 4.5, Sonnet 4.5/4.6, and Opus 4.5/4.6. The eval runner should use model aliases or a config-driven model selection to avoid hardcoding deprecated model versions.

### Cost Analysis Notes

- **Corrected Haiku 3.5 pricing impact**: With $0.80/$4.00 per MTok (not $0.25/$1.25), a typical LLM-graded eval case using ~2K input tokens + ~500 output tokens costs ~$0.0036 per trial (was ~$0.001). For a "Standard" tier run (50 cases x 3 trials x Haiku grader), cost is ~$0.54/run (was ~$0.15). For weekly runs, ~$2.16/month on the grader alone.
- **Consider Haiku 4.5 ($1/$5 per MTok)**: Only 25% more expensive than Haiku 3.5 but significantly more capable. At these per-case costs, the quality difference likely justifies the marginal cost increase.
- **Opus 4 vs Opus 4.1/4.5/4.6 pricing divergence**: Opus 4 and Opus 4.1 are $15/$75. Opus 4.5 and 4.6 are $5/$25 -- actually **cheaper** than Opus 4. If calibration runs use newer Opus models, they cost 3x less than the document estimates. This significantly changes the "Calibration" tier economics.
- **Batch API discount**: The Anthropic Batch API offers 50% off both input and output. If eval runs are non-urgent (nightly/weekly), using the Batch API could halve all LLM grading costs. The document does not mention this optimization.

### Grooming Recommendations

1. **Update model references to current lineup**: Replace "Claude Haiku 3.5" with "Claude Haiku 4.5" as the recommended judge model ($1/$5 per MTok, better quality). Replace "Claude Opus 4" calibration model with "Claude Opus 4.6" ($5/$25, cheaper and better than Opus 4's $15/$75).
2. **Add Batch API as cost optimization strategy**: For non-real-time eval runs (nightly/weekly/monthly), the Batch API provides 50% discount. This should be strategy #7 in the Cost Optimization section.
3. **Revise cost estimates**: The $10-30/month estimate is based on stale Haiku 3 pricing. With corrected pricing and the Batch API discount factored in, revised estimate is $15-40/month (or $8-20/month with Batch API).
4. **Build-vs-buy recommendation remains sound**: The custom-build approach is still the right call. Promptfoo's OpenAI acquisition adds real vendor risk. Braintrust's platform dependency conflicts with Luca's philosophy. The eval surface is small enough (~8 components) that a custom runner is tractable. No existing tool changes this calculus.
5. **Consider adding prompt caching to cost strategy**: Anthropic's prompt caching (cache reads at 0.1x base input price) could dramatically reduce costs for eval runs that use the same system prompts repeatedly. After 2 cache hits, the 5-minute cache write (1.25x) pays for itself.
6. **Flag for grooming discussion**: The Langfuse characterization should be softened -- it does have eval features, just gated behind Enterprise pricing for self-hosted. If the team ever needs a tracing/observability layer alongside evals, Langfuse could serve both roles.
