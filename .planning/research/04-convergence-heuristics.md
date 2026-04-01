# Research: Convergence Detection, Heuristic Complexity Classification & Structured Verification

**Date**: 2026-03-31
**Purpose**: Validate existing Luca patterns against current best practices; gather reference material for workflow redesign.

---

## 1. Heuristic Complexity Classification (Without LLM Calls)

### 1.1 Current Best Practices

**DCAM Framework (Decompose, Classify, Assign, Measure)**
The most relevant industry pattern for agentic task complexity routing. Published by Crewdle AI (2025), it matches model capability to task complexity at every step of an agentic workflow. Key finding: in a typical 20-call agent session, only 2-4 calls genuinely require high-tier reasoning; the rest are routing, parsing, validation, and extraction.

Steps:

1. **Decompose** -- Map every LLM call in the pipeline
2. **Classify** -- Categorize each call as Low / Medium / High / Critical
3. **Assign** -- Route each call to the cheapest model that meets quality bar
4. **Measure** -- Track quality, cost, latency, and failure rate per step

Source: [Crewdle AI - Model Right-Sizing Framework](https://crewdle.com/blog/right-sizing-models-agentic-workflows/)

**IBM Agentic Reasoning Heuristics**
IBM documents that agentic reasoning can apply conditional logic or heuristics (not just LLM inference) for decision-making, including task classification. This validates Luca's approach of rule-based complexity classification before LLM routing.

Source: [IBM - What Is Agentic Reasoning?](https://www.ibm.com/think/topics/agentic-reasoning)

**Amazon Task Decomposition Research**
Amazon Science demonstrates that task decomposition + smaller LLMs can match larger model performance while reducing cost by 50-90%. The pattern: a lightweight heuristic classifies task complexity, then routes to the cheapest sufficient model.

Source: [Amazon Science - Task Decomposition and Smaller LLMs](https://www.amazon.science/blog/how-task-decomposition-and-smaller-llms-can-make-ai-more-affordable)

### 1.2 Text-Based Complexity Scoring Patterns

**Keyword-Weighted Scoring (YAKE Pattern)**
YAKE (Yet Another Keyword Extractor) defines 5 features for scoring and heuristically combines them into a single score per keyword. Applicable to task description analysis:

- Term frequency within the description
- Position in text (early mentions weighted higher)
- Co-occurrence statistics
- Term specificity (inverse document frequency analog)
- Surface features (capitalization, length)

For Luca's complexity classification from task descriptions, a weighted sum approach using similar features is well-validated.

**Cognitive Complexity Scoring**
SonarSource's Cognitive Complexity metric assigns weights to programming constructs and nesting levels. Analogous approach for task complexity:

- Simple constructs (single file change, known pattern) = low weight
- Nested/cross-cutting concerns = escalating weight
- Unknown territory = high weight

Source: [Sonar - Cyclomatic Complexity Guide](https://www.sonarsource.com/resources/library/cyclomatic-complexity/)

**Stanford Text Complexity Features (CS 229)**
Feature extraction for complexity classification:

- Part-of-speech distribution
- Average sentence length
- Vocabulary richness
- Entity count and diversity

Source: [Stanford CS 229 - Text Complexity](https://cs229.stanford.edu/proj2018/report/185.pdf)

### 1.3 Weighted Sum Approach for Luca

A practical heuristic classifier for task descriptions, without LLM calls:

```typescript
// Conceptual pattern -- weighted feature scoring
interface ComplexityFeatures {
  keyword_score: number; // Weighted match against complexity keywords
  file_scope_estimate: number; // Estimated file count from description
  cross_cutting_score: number; // References to multiple packages/domains
  risk_indicators: number; // "breaking change", "migration", "refactor"
  novelty_score: number; // Unknown patterns, no prior memory matches
}

// Weighted sum -> threshold -> level
function classifyComplexity(features: ComplexityFeatures): ComplexityLevel {
  const score =
    features.keyword_score * 0.2 +
    features.file_scope_estimate * 0.3 +
    features.cross_cutting_score * 0.2 +
    features.risk_indicators * 0.15 +
    features.novelty_score * 0.15;

  if (score < 0.2) return "TRIVIAL";
  if (score < 0.4) return "SIMPLE";
  if (score < 0.6) return "MODERATE";
  if (score < 0.8) return "COMPLEX";
  return "CRITICAL";
}
```

**Keyword dictionaries** for the `keyword_score` feature:

- LOW: "fix typo", "update comment", "rename", "bump version"
- MEDIUM: "add feature", "refactor", "update tests"
- HIGH: "migration", "breaking change", "cross-package", "architecture", "security"
- CRITICAL: "database schema", "auth system", "deployment pipeline", "core API change"

### 1.4 Luca's Existing Patterns (Assessment)

Luca already has:

- `src/complexity/__schemas/complexity.schemas.ts` -- 5-level classification with file count ranges, scope, risk
- `src/complexity/__helpers/reassessment.ts` -- Mid-execution promotion based on observed signals (files touched, budget ratio, stall detection, error count)
- `src/complexity/__helpers/self-tuning.ts` -- Prediction accuracy tracking and threshold recommendation
- `src/complexity/__helpers/model-routing.ts` -- 7 named routing presets mapping complexity to model tiers

**Gap**: The current system relies on `lu-router` (an LLM call) for initial classification. A heuristic pre-classifier could skip the LLM call for obvious TRIVIAL/SIMPLE tasks, reducing latency and cost.

### 1.5 Relevant Libraries

| Library                                                | Purpose                                           | Version | Notes                                            |
| ------------------------------------------------------ | ------------------------------------------------- | ------- | ------------------------------------------------ |
| [YAKE](https://github.com/LIAAD/yake)                  | Keyword extraction (Python, no TS port)           | 0.4.8   | Pattern reference only; reimplement in TS        |
| [natural](https://www.npmjs.com/package/natural)       | NLP toolkit for Node/Bun (tokenizer, TF-IDF)      | 8.0.1   | TF-IDF, tokenization, stemming                   |
| [wink-nlp](https://www.npmjs.com/package/wink-nlp)     | Lightweight NLP for JS                            | 2.3.0   | Faster than natural, good for keyword extraction |
| [compromise](https://www.npmjs.com/package/compromise) | Lightweight NLP (POS tagging, entity recognition) | 14.14.3 | Good for description parsing                     |

**Recommendation**: For Luca's use case, a custom keyword-weighted scorer is simpler and more maintainable than pulling in an NLP library. The keyword dictionaries + weighted sum pattern requires zero dependencies.

---

## 2. Convergence Detection Patterns

### 2.1 Current Best Practices

**Multi-Signal Stall Detection**
The industry consensus for convergence detection in iterative loops uses multiple orthogonal signals evaluated together:

| Signal                | What it measures          | Stale when              |
| --------------------- | ------------------------- | ----------------------- |
| Error count delta     | Net progress              | >= 0 (no improvement)   |
| Fingerprint overlap   | Error identity stability  | >= 0.8 (same errors)    |
| Artifact change delta | Code churn                | === 0 (no file changes) |
| Semantic overlap      | Message content stability | >= 0.9 (same content)   |

**Luca already implements this exact pattern** in `src/iteration/__helpers/convergence.ts` with the composite stale rule (2-of-N signals stale = stalled).

**Decentralized Convergence Detection (Bahi et al., 2009)**
For distributed iterative algorithms, decentralized convergence detection uses local residual checking: each node checks whether its local state has changed below a threshold, and global convergence is detected when all nodes report stability. Relevant for multi-agent verification where multiple reviewers need to reach consensus.

Source: [Springer - Decentralized Convergence Detection](https://link.springer.com/article/10.1007/s11227-009-0293-6)

### 2.2 Sliding Window Analysis

**Pattern**: Instead of comparing only consecutive iterations, maintain a sliding window of the last N iteration results and check for trends.

```typescript
interface SlidingWindowConfig {
  window_size: number; // Default 3
  trend_threshold: number; // Minimum error delta trend to detect improvement
}

function detectTrend(
  window: IterationRecord[],
): "improving" | "flat" | "degrading" {
  if (window.length < 2) return "flat";

  const deltas = [];
  for (let i = 1; i < window.length; i++) {
    deltas.push(window[i].error_count - window[i - 1].error_count);
  }

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avgDelta < -threshold) return "improving";
  if (avgDelta > threshold) return "degrading";
  return "flat";
}
```

**Current Luca approach** uses consecutive stale counting (binary: stale or not per iteration). A sliding window would add trend detection for cases where errors oscillate without net improvement.

### 2.3 Error Classification (Permanent vs Transient)

**Industry Standard Three-Tier Classification:**

| Category    | Retry?            | Examples                                                    | Action                       |
| ----------- | ----------------- | ----------------------------------------------------------- | ---------------------------- |
| Transient   | Yes, automatic    | Network timeout, ECONNREFUSED, build race                   | Retry without context change |
| Correctable | Yes, with context | Type error, test failure, lint violation                    | Retry with error context     |
| Permanent   | No                | Circular dependency, missing module, architectural mismatch | Skip and report              |

Source: [Moments Log - Retry Pattern](https://www.momentslog.com/development/design-pattern/retry-pattern-handling-transient-errors-without-backoff)

**Luca's existing classifier** (`src/iteration/__helpers/classifier.ts`) already implements this exact taxonomy with:

- Source-based defaults (test/typecheck -> correctable, build -> transient)
- Pattern-based overrides (PERMANENT_PATTERNS, TRANSIENT_PATTERNS)
- Promotion: correctable -> permanent after N iterations

**Validation**: Luca's approach is well-aligned with industry patterns. The promotion mechanism (correctable -> permanent after threshold) is a Luca innovation not commonly seen in retry literature, which typically uses only the two-tier transient/permanent split.

### 2.4 Jaccard Similarity for Error Set Comparison

Jaccard index: |A intersection B| / |A union B|

- 0.0 = completely disjoint sets (all new errors)
- 1.0 = identical sets (no change)

**Luca's implementation** in `computeFingerprintOverlap()` is textbook-correct. The fingerprinting approach (SHA-256 of normalized file:line:code:message) is a well-established technique for deduplication.

**Enhancement opportunity**: MinHash for approximate Jaccard when error sets grow large (>1000 errors). For Luca's typical use case (<100 errors per iteration), exact Jaccard is appropriate and preferred.

Source: [Stanford - Finding Similar Items (Ch. 3)](http://infolab.stanford.edu/~ullman/mmds/ch3.pdf)

### 2.5 Cosine Similarity for Semantic Overlap

Luca's `computeSemanticOverlap()` uses TF vectors of error message terms with cosine similarity. This is a lightweight approximation of TF-IDF that avoids needing an IDF corpus.

**Assessment**: The current approach (raw term frequency, no IDF) is appropriate for comparing error messages across two adjacent iterations. Full TF-IDF would require maintaining a document corpus, which adds complexity without proportional benefit in this narrow use case.

**Alternative considered**: Levenshtein/edit distance on concatenated error messages. Rejected because it's sensitive to error ordering, while TF cosine similarity is order-independent.

### 2.6 Stall Detection in Agentic Systems

**Agent Patterns (agentpatterns.tech) -- Four Loop Stall Patterns:**

1. **Tool replay** -- Same tool called with identical args (dedupe by tool+args hash)
2. **Minimal variation** -- Same action with trivially different args (check for "did anything new appear")
3. **Retry storm** -- Failed tool retries multiply across layers (single retry policy needed)
4. **Phantom progress** -- Agent rephrases plans or re-summarizes without advancing (progress signal check)

Source: [Agent Patterns - Infinite Loop](https://www.agentpatterns.tech/en/failures/infinite-loop)

**Microsoft Agentic AI Failure Modes (April 2025):**
Microsoft's taxonomy identifies loop-related failures as a primary failure mode category. Recommended safeguards:

- `max_steps` / `timeout` / `max_tool_calls` / `max_tokens` hard limits
- Tool+args deduplication
- No-progress rule: stop after N steps without a new signal
- Single retry policy (gateway level, not per-agent)

Source: [Microsoft Security Blog - Failure Modes in AI Agents](https://www.microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/)

**Luca's approach vs. industry:**

| Mechanism                    | Luca                                                  | Industry best practice          | Status                           |
| ---------------------------- | ----------------------------------------------------- | ------------------------------- | -------------------------------- |
| Hard iteration limits        | Yes (budget.ts, ComplexityGate)                       | Yes                             | Aligned                          |
| Convergence-based halt       | Yes (2-of-N stale signals)                            | Yes (various)                   | Aligned, Luca more sophisticated |
| Stall debate (retry vs halt) | Yes (stall-debate.ts)                                 | Emerging (Microsoft recommends) | Ahead of curve                   |
| Token budget tracking        | Yes (optional in BudgetState)                         | Recommended                     | Aligned                          |
| Tool deduplication           | No (not applicable -- Luca invokes agents, not tools) | Yes for tool-calling agents     | N/A                              |
| Sliding window trend         | No (consecutive count only)                           | Emerging                        | Potential enhancement            |

### 2.7 Concentrix 12 Failure Patterns (2025)

Relevant patterns for convergence:

- Multi-agent dialogues need hard limits (rounds, wall-clock, cumulative token/cost budgets) and soft stop rules (no-new-information, fixed-point detection, repeated proposals)
- Platform-specific failures (e.g., memory bugs causing 5 consecutive stalls) -- loop review must look at meta-patterns, not just individual iteration signals

Source: [Concentrix - 12 Failure Patterns of Agentic AI Systems](https://www.concentrix.com/insights/blog/12-failure-patterns-of-agentic-ai-systems/)

---

## 3. Structured Verification in Agentic Systems

### 3.1 Current Best Practices

**Two-Layer Verification (Deterministic + Agentic)**
The 2026 consensus pattern uses two verification layers:

1. **Deterministic gates** -- Linters, type checkers, test suites, schema validation. Fast, reliable, no LLM cost.
2. **Agentic validation** -- A dedicated critic agent validates output against the definition of done, returning pass/fail with explanation.

If either layer rejects the output, the producing agent iterates until passing both.

Source: [PromptEngineering.org - 2026 Playbook for Agentic Workflows](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)

**Reflection Pattern**
The simplest agentic verification loop: generate output, evaluate against criteria, accept or revise. The agent becomes its own reviewer.

Source: [SitePoint - Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)

### 3.2 JSON-Based Verification Output Formats

**Industry pattern for structured verification output:**

```json
{
  "verification_id": "phase-91-wave-01",
  "timestamp": "2026-03-31T10:00:00Z",
  "overall_status": "partial_pass",
  "criteria": [
    {
      "id": "C1",
      "description": "All TypeScript types compile without errors",
      "status": "pass",
      "evidence": "tsc --noEmit exited 0",
      "automated": true
    },
    {
      "id": "C2",
      "description": "New function has JSDoc with examples",
      "status": "fail",
      "evidence": "Missing @example tag on processTemplate()",
      "automated": false,
      "reviewer": "dx-advocate"
    }
  ],
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "skipped": 0
  }
}
```

**Key properties of well-designed verification schemas:**

- Criterion-level granularity (not just overall pass/fail)
- Evidence field for each criterion (what was checked, what was found)
- Automated vs manual distinction
- Reviewer attribution for agentic checks
- Aggregation-friendly summary block

### 3.3 Criterion-Level Pass/Fail Tracking

**McKinsey's Agentic Workflow Pattern (2026):**
Production agent outputs (CSV, JSON, code) go through:

1. Schema validation (structural correctness)
2. Sanity checks (range checks, consistency)
3. Spot checks against ground truth
4. Agentic evaluation against acceptance criteria

Each check produces a structured pass/fail result that feeds into an aggregation layer.

Source: [McKinsey/QuantumBlack - Agentic Workflows for Software Development](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)

### 3.4 Aggregation Patterns for Milestone-Level Validation

**Pattern: Hierarchical Aggregation**

```
Milestone (v3.3.0)
  |-- Phase 1: { passed: 12, failed: 0, skipped: 0 } -> PASS
  |-- Phase 2: { passed: 10, failed: 2, skipped: 1 } -> PARTIAL
  |-- Phase 3: { passed: 8, failed: 0, skipped: 0 }  -> PASS
  |
  Total: { passed: 30, failed: 2, skipped: 1 }
  Status: PARTIAL (97% pass rate, 2 failures in Phase 2)
```

**Aggregation rules:**

- ALL phases pass -> milestone PASS
- ANY phase has failures -> milestone PARTIAL (with identification of failing phases)
- Critical failures block milestone completion regardless of pass rate
- Skipped criteria do not count toward pass rate

### 3.5 Luca's Current Verification Architecture

Luca already implements a sophisticated verification pipeline:

| Component            | Location                                       | Role                                                |
| -------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Harness runner       | `src/harness/`                                 | Deterministic checks (test, typecheck, lint, build) |
| Error classifier     | `src/iteration/__helpers/classifier.ts`        | Categorize errors by recoverability                 |
| Convergence detector | `src/iteration/__helpers/convergence.ts`       | Multi-signal stall detection                        |
| Stall debate         | `src/iteration/__helpers/stall-debate.ts`      | Retry vs halt decision                              |
| Budget tracker       | `src/iteration/__helpers/budget.ts`            | Iteration/token cost enforcement                    |
| Metrics collector    | `src/iteration/__helpers/metrics-collector.ts` | Structured metrics persistence                      |
| Checkpoint system    | `src/iteration/__helpers/checkpoint.ts`        | Git tag-based rollback points                       |

**Gap**: The harness produces structured JSON output (`CheckResult[]` with `ParsedError[]`), but the verification layer (lu-verifier) produces Markdown-based assessment rather than structured JSON. Standardizing verifier output to JSON would enable milestone-level aggregation.

### 3.6 Guardrails and Safety Patterns (2026)

**Authority Partners AI Agent Guardrails Guide:**
Production guardrails for agentic systems in 2026:

- Input validation (schema enforcement before agent invocation)
- Output validation (structured output adherence)
- Behavioral guardrails (loop limits, cost caps, scope boundaries)
- Monitoring guardrails (anomaly detection across action sequences)

Source: [Authority Partners - AI Agent Guardrails Production Guide 2026](https://authoritypartners.com/insights/ai-agent-guardrails-production-guide-for-2026/)

---

## 4. Patterns to Adopt

### 4.1 High-Value Additions

1. **Heuristic pre-classifier**: Keyword-weighted scorer for task descriptions to skip LLM calls on obvious TRIVIAL/SIMPLE tasks. Zero-dependency, pure TypeScript implementation.

2. **Sliding window trend detection**: Complement the existing consecutive stale counter with a 3-iteration sliding window for trend analysis. Catches oscillating error patterns that the current binary stale/not-stale misses.

3. **Structured verifier output**: Migrate lu-verifier from Markdown to JSON criterion-level output, enabling milestone-level aggregation and programmatic threshold decisions.

### 4.2 Validations (Already Aligned)

1. **Multi-signal convergence** -- Luca's 2-of-N composite stale rule with Jaccard fingerprint overlap and cosine semantic overlap is ahead of most agentic frameworks.

2. **Three-tier error classification** -- transient/correctable/permanent with promotion is more nuanced than the industry-standard two-tier (transient/permanent) pattern.

3. **Stall debate with heuristic strategies** -- The retry_with_context_promotion / retry_with_error_focus / retry_with_rollback strategy selection is a Luca innovation aligned with Microsoft's emerging recommendations.

4. **Budget enforcement** -- Iteration-based with optional token tracking matches the "hard limits + soft stop" pattern recommended across all major agentic frameworks.

### 4.3 Low-Priority / Not Needed

1. **MinHash approximate Jaccard** -- Only needed for >1000 errors per iteration; Luca's exact computation is correct for typical workloads.
2. **Full TF-IDF for semantic overlap** -- Would require maintaining an IDF corpus; raw TF cosine is sufficient for adjacent-iteration comparison.
3. **Tool deduplication** -- Relevant for tool-calling agents, not for Luca's agent-invocation model.

---

## 5. References

### Agentic Frameworks and Failure Modes

- [Crewdle AI - Model Right-Sizing Framework (DCAM)](https://crewdle.com/blog/right-sizing-models-agentic-workflows/)
- [IBM - What Is Agentic Reasoning?](https://www.ibm.com/think/topics/agentic-reasoning)
- [Amazon Science - Task Decomposition and Smaller LLMs](https://www.amazon.science/blog/how-task-decomposition-and-smaller-llms-can-make-ai-more-affordable)
- [Microsoft Security Blog - Failure Modes in AI Agents](https://www.microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/)
- [Microsoft Whitepaper (PDF)](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/Taxonomy-of-Failure-Mode-in-Agentic-AI-Systems-Whitepaper.pdf)
- [Agent Patterns - Infinite Loop](https://www.agentpatterns.tech/en/failures/infinite-loop)
- [Concentrix - 12 Failure Patterns of Agentic AI Systems](https://www.concentrix.com/insights/blog/12-failure-patterns-of-agentic-ai-systems/)

### Convergence and Similarity

- [Springer - Decentralized Convergence Detection for Async Iterative Algorithms](https://link.springer.com/article/10.1007/s11227-009-0293-6)
- [Stanford - Finding Similar Items (MinHash, Jaccard)](http://infolab.stanford.edu/~ullman/mmds/ch3.pdf)
- [Wikipedia - Jaccard Index](https://en.wikipedia.org/wiki/Jaccard_index)
- [Sonar - Cyclomatic Complexity Guide](https://www.sonarsource.com/resources/library/cyclomatic-complexity/)

### Complexity Scoring and NLP

- [Stanford CS 229 - Text Complexity](https://cs229.stanford.edu/proj2018/report/185.pdf)
- [MDPI - Automatic Classification of Text Complexity](https://www.mdpi.com/2076-3417/10/20/7285)
- [YAKE Keyword Extraction](https://github.com/LIAAD/yake)

### Verification and Structured Output

- [PromptEngineering.org - 2026 Playbook for Agentic Workflows](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/)
- [SitePoint - Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)
- [McKinsey/QuantumBlack - Agentic Workflows for Software Development](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [Authority Partners - AI Agent Guardrails 2026](https://authoritypartners.com/insights/ai-agent-guardrails-production-guide-for-2026/)

### Error Classification and Retry Patterns

- [Moments Log - Retry Pattern](https://www.momentslog.com/development/design-pattern/retry-pattern-handling-transient-errors-without-backoff)
- [GeeksforGeeks - Retry Pattern in Microservices](https://www.geeksforgeeks.org/system-design/retry-pattern-in-microservices/)

### Framework Comparisons (2025-2026)

- [LangGraph vs CrewAI vs AutoGen (DataCamp)](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [LangGraph vs CrewAI Performance (Markaicode)](https://markaicode.com/vs/langgraph-vs-crewai-multi-agent-production/)
