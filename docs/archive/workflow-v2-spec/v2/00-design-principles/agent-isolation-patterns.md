# Agent Isolation Patterns

> Fresh agents catch what existing agents miss. Isolation is not a luxury for expensive tasks --
> it is a structural requirement for honest review. An agent reviewing its own work (or work produced
> in its context) has systematic blind spots that no amount of prompting can eliminate.

---

## Why Fresh Agents Catch More Errors

### Confirmation Bias in AI Agents

When an agent produces output, it develops implicit assumptions. These assumptions are not stored as explicit beliefs -- they are embedded in the conversation context. The model's attention mechanism naturally reinforces patterns it has already generated. When the same agent reviews its own output, it literally cannot see its mistakes the same way a fresh agent can, because the same context that produced the error also shapes its evaluation of the error.

This is analogous to the well-documented human confirmation bias, but it operates at the architectural level:

```
Same Agent Reviews Own Work:
+--------------------------------------------------------------+
| Context: [task] + [reasoning] + [assumptions] + [output]     |
|                                                               |
| When reviewing, the model re-reads its own reasoning.        |
| The assumptions feel "obvious" because they're in context.    |
| The model is literally incapable of questioning them --       |
| they are part of its attention distribution.                  |
+--------------------------------------------------------------+
Result: Finds surface errors (typos, syntax). Misses logic errors.

Fresh Agent Reviews Same Work:
+--------------------------------------------------------------+
| Context: [task] + [output only]                              |
|                                                               |
| The model has NO access to the original reasoning.           |
| Assumptions are NOT in context. The output must stand alone.  |
| The model evaluates what was written, not what was intended.  |
+--------------------------------------------------------------+
Result: Finds logic errors, missing edge cases, wrong assumptions.
```

### Context Poisoning

Context poisoning occurs when incorrect information in the conversation history influences all subsequent model output. Once a model has "decided" something (even incorrectly), that decision becomes part of its context and biases all future reasoning.

Example:

```
Agent A (Researcher):
  "Bun.serve() supports route groups via the groupRoutes() helper."
  (This is wrong -- no such helper exists.)

Agent A later (Reviewer):
  Reviews the research file.
  The file says "route groups via groupRoutes()."
  The model's context already contains the reasoning that led to
  this conclusion. It reads the file as confirming what it "knows."
  Review result: PASS.

Agent B (Cold Reviewer):
  Reads only the research file.
  "Claims groupRoutes() helper exists. Let me verify..."
  Checks Context7: no such function in Bun docs.
  Review result: FAIL -- hallucinated API.
```

Context poisoning is invisible to the poisoned agent. The only reliable defense is isolation: an agent that never shared the poisoned context.

### The Empirical Case

The following ranges are approximate estimates from informal observation of Luca v1 sessions, not controlled experiments. Sample sizes are small and methodology was not rigorous. We present them as design assumptions that motivate cold isolation, not as precise measurements:

| Review Type                                | Estimated Error Detection Rate | Typical Errors Found                                                            |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| Same agent self-review                     | ~20-30%                        | Syntax errors, missing imports, obvious type mismatches                         |
| Warm agent review (shared partial context) | ~40-50%                        | Above + some logic errors, missed edge cases                                    |
| Cold agent review (no shared context)      | ~65-80%                        | Above + wrong assumptions, hallucinated APIs, incorrect patterns, context drift |

The gap between warm and cold review is not incremental -- it is categorical. Cold reviewers find **classes of errors** that warm reviewers cannot detect, because warm reviewers share the assumptions that created the errors.

---

## Three Isolation Levels

V2 defines three isolation levels. Each is appropriate for different pipeline steps.

### Cold Isolation

```
+-------------------+        +-------------------+
| Producer Agent    |        | Reviewer Agent    |
|                   |        |                   |
| Has: Full context |   +--->| Has: Output only  |
| Produced: Output  |---+    | No: Reasoning     |
| + reasoning       |        | No: Conversation  |
| + assumptions     |        | No: Assumptions   |
| + sources checked |        |                   |
+-------------------+        +-------------------+
```

**What the reviewer receives**: The producer's output artifact (research file, plan section, code change) and any reference materials (task description, relevant research files).

**What the reviewer does NOT receive**: The producer's conversation history, reasoning chain, intermediate attempts, sources checked and rejected, or any context that shaped the output.

**When to use cold isolation**: All review steps by default. Research review, plan review, implementation review. This is the v2 default for any step where one agent evaluates another's work.

**Why the reviewer must NOT see reasoning**: The reasoning is where assumptions live. If a researcher wrote "I checked Context7 and found groupRoutes() in the Bun docs," a warm reviewer might accept this because the reasoning sounds thorough. A cold reviewer who only sees the claim "Bun supports groupRoutes()" will verify it independently.

### Warm Isolation

```
+-------------------+        +-------------------+
| Producer Agent    |        | Reviewer Agent    |
|                   |        |                   |
| Has: Full context |   +--->| Has: Output       |
| Produced: Output  |---+    | Has: Task context |
| + reasoning       |   +--->| Has: Research refs|
| + assumptions     |        | No: Reasoning     |
| + sources checked |        | No: Conversation  |
+-------------------+        +-------------------+
```

**What the reviewer receives**: The output, plus selected context that helps the reviewer understand the problem space. This might include the task description, relevant MuninnDB engrams, and project conventions.

**What the reviewer does NOT receive**: The producer's conversation history or reasoning.

**When to use warm isolation**: When the reviewer needs domain context to evaluate the work, but should not inherit the producer's assumptions. For example, a plan reviewer who needs to understand the project's architecture to evaluate whether the plan is feasible, but should not know why the planner chose a particular approach.

### No Isolation (Full Context)

```
+-------------------+        +-------------------+
| Producer Agent    |        | Continuation      |
|                   |        |                   |
| Has: Full context |------->| Has: Everything   |
| Produced: Output  |        | Inherits all      |
|                   |        | context            |
+-------------------+        +-------------------+
```

**What the agent receives**: Everything. Full conversation history, reasoning, assumptions, all prior context.

**When to use no isolation**: Only when the "reviewer" is actually a continuation of the same work, not an independent evaluation. For example, an executor that needs to continue from where it left off after a context-monitor warning. Or a researcher who needs to deepen a finding (not review it).

**When NOT to use no isolation**: Any step labeled "review" in the pipeline. Review without isolation is not review -- it is continuation with a different prompt.

---

## Isolation in the v2 Pipeline

Each pipeline step has a deliberate isolation level. For the canonical step definitions, see [`01-workflow-steps/`](../01-workflow-steps/README.md).

| Step                        | Isolation Level | Rationale                                                                                                                                                                                   |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Ideate                   | None            | Single agent, no prior context to isolate from. If the user provides extensive prior context, the ideation agent inherits it -- this is acceptable because ideation is scoping, not review. |
| 2. Research (per topic)     | Cold            | Each researcher starts fresh; no cross-contamination between topics                                                                                                                         |
| 3. Discuss + Pre-mortem     | Warm            | Discussion agent loads ideation output + research briefs, not full researcher context                                                                                                       |
| 4. Deep Expand              | Warm            | Expander loads original research file, not researcher conversation context                                                                                                                  |
| 5. Review Research          | Cold (strict)   | Reviewer must NOT see researcher reasoning                                                                                                                                                  |
| 5a. Re-Research (if needed) | Warm            | Researcher gets reviewer feedback, not reviewer reasoning                                                                                                                                   |
| 6. Graduate to MuninnDB     | N/A             | Automated scoring process (lu-research-graduator), no subjective judgment                                                                                                                   |
| 7. Plan                     | Warm            | Planner loads graduated research, project conventions                                                                                                                                       |
| 8. Review Plan              | Cold            | Reviewer sees plan only, not planner's reasoning                                                                                                                                            |
| 9. Execute (per task)       | Warm            | Executor loads task plan + research files, not full plan                                                                                                                                    |
| 10. Verify + UAT            | Cold            | Includes implementation review; verifier evaluates against criteria, not intent                                                                                                             |

### The Review Loop Pattern

The review loop is the core isolation mechanism in v2. It follows a strict protocol:

```
          +------------------+
          |                  |
          v                  |
  +---------------+    +-----------+
  | Producer      |    | Reviewer  |
  | (researcher,  |--->| (cold     |
  |  planner, or  |    |  isolate) |
  |  executor)    |    +-----------+
  +---------------+          |
          ^                  |
          |                  v
          |           +-------------+
          |           | Review      |
          |           | Decision    |
          |           +------+------+
          |                  |
          |         +--------+--------+
          |         |                 |
          |        PASS              FAIL
          |         |                 |
          |         v                 v
          |    [Graduate /      [Feedback to
          |     Proceed]         Producer]
          |                       |
          +-----------------------+
              (Re-do with feedback,
               NOT with reviewer context)
```

Critical rule: when the producer re-does work based on reviewer feedback, it receives the **feedback** (what was wrong, what needs to change) but NOT the reviewer's **reasoning** (why they think it's wrong, what they would do instead). This prevents the reviewer's assumptions from replacing the producer's assumptions.

### Maximum Review Iterations

Review loops are bounded to prevent infinite cycles. The convergence model uses gap-severity classification (CRITICAL / IMPORTANT / MINOR) -- loops continue while any CRITICAL findings exist. See [`05-review-loops/`](../05-review-loops/README.md) for the canonical convergence criteria and [`05-review-loops/iteration-budgets.md`](../05-review-loops/iteration-budgets.md) for complexity-scaled iteration limits.

| Loop                  | Max Iterations (varies by complexity) | Escalation on Max                               |
| --------------------- | ------------------------------------- | ----------------------------------------------- |
| Research review       | 1-3                                   | Flag finding as LOW confidence, skip graduation |
| Plan review           | 1-3                                   | Proceed with flagged concerns documented        |
| Implementation review | 1-3                                   | Escalate to human review                        |

---

## Why Reviewers Must NEVER See Reasoning

This deserves its own section because it is the most counter-intuitive aspect of v2 isolation.

### The Natural Instinct

When something fails review, the instinct is to give the reviewer more context: "Here's what the researcher was thinking. Here's what sources they checked. Here's why they chose this approach." The assumption is that more context helps the reviewer make a better judgment.

This is wrong.

### What Actually Happens

When a reviewer sees the producer's reasoning:

1. **Anchoring**: The reviewer's evaluation is anchored to the producer's framing. If the researcher says "I checked Context7 and found X," the reviewer is less likely to re-check Context7 themselves.

2. **Plausibility bias**: The reasoning provides a plausible story for why the output is correct. Even if the output is wrong, the reasoning makes it _feel_ correct. The reviewer has to overcome both the output and the reasoning to flag an error.

3. **Effort reduction**: Reviewing reasoning is easier than independently verifying claims. The reviewer shifts from "Is this correct?" to "Does the reasoning seem sound?" -- a fundamentally weaker check.

4. **Context inheritance**: The reviewer inherits the producer's assumptions. If the researcher assumed that Bun's API is similar to Express's (leading to the hallucinated route groups), that assumption is now in the reviewer's context too.

### The Cold Review Alternative

Without reasoning, the reviewer must:

1. **Evaluate the output on its own merits**: Does this claim stand up to scrutiny?
2. **Independently verify claims**: If the file says "Bun supports X," check the docs.
3. **Question assumptions**: Without the "because" behind the decision, every decision is questionable.
4. **Apply their own framework**: Instead of evaluating the producer's logic, they apply fresh logic.

This is more expensive per review cycle. It requires the reviewer to do some of the same work the producer did. But it is the only way to catch errors that the producer's reasoning made invisible.

---

## Cost Analysis

### Extra Agent Spawns

| Pipeline Step         | v1 Agents            | v2 Agents              | Delta     | Notes                              |
| --------------------- | -------------------- | ---------------------- | --------- | ---------------------------------- |
| Research              | 1 (shared context)   | 3-5 (independent)      | +2-4      | Parallel, so wall-clock is similar |
| Research review       | 0                    | 3 (cold reviewers)     | +3        | New cost                           |
| Plan review           | 1 (warm)             | 1-2 (cold)             | +0-1      | Marginal increase                  |
| Execution             | 1-3 (shared context) | 1-3 (targeted context) | ~0        | Same count, different context      |
| Implementation review | 1 (warm)             | 1-3 (cold)             | +0-2      | Scales with task count             |
| **Total per session** | **4-8**              | **12-20**              | **+8-12** |                                    |

### Token Cost Per Review Cycle

| Isolation Level    | Context Loaded                   | Tokens per Cycle | Estimated Error Detection Rate |
| ------------------ | -------------------------------- | ---------------- | ------------------------------ |
| None (self-review) | 100% of prior context            | ~0 marginal      | ~20-30%                        |
| Warm               | 30-50% of prior context          | ~2000-5000       | ~40-50%                        |
| Cold               | 5-15% (output + references only) | ~1000-3000       | ~65-80%                        |

Cold review is actually **cheaper per cycle** than warm review because it loads less context. The additional cost comes from spawning more review agents, not from each review being more expensive.

### Quality Improvement vs. Cost

```
Estimated Error Detection Rate
  ^
  |
  |                              * Cold (~65-80%)
  |                    * Warm (~40-50%)
  |        * None (~20-30%)
  |
  +-----------------------------------> Cost per Review Cycle
  Low                            High
```

The relationship is not linear. Cold isolation provides disproportionately better error detection per token spent because:

1. Less context loaded = cheaper per cycle
2. Fresh perspective = finds different error classes
3. No reasoning overhead = faster evaluation

The cost comes from running more cycles (review loops), not from each cycle being more expensive.

### How Isolation Scales with Complexity

All 10 steps run at every complexity level (see [complexity-gating rule](../../../.claude/rules/complexity-gating.md)). Complexity affects model tier, iteration budgets, and token budgets -- not which steps execute. For TRIVIAL tasks, researchers use the `fast` model tier with reduced token budgets, and review loops are capped at 1 iteration.

V2 scales the isolation intensity with complexity:

| Complexity | Research Review          | Plan Review              | Implementation Review       |
| ---------- | ------------------------ | ------------------------ | --------------------------- |
| TRIVIAL    | Cold (1 iteration, fast) | Cold (1 iteration, fast) | Warm (quick check)          |
| SIMPLE     | Cold (2 iterations)      | Cold (1 iteration)       | Warm                        |
| MODERATE   | Cold (2 iterations)      | Cold (2 iterations)      | Cold                        |
| COMPLEX    | Cold (3 iterations)      | Cold (2 iterations)      | Cold (2 iterations)         |
| CRITICAL   | Cold (3 iterations)      | Cold (3 iterations)      | Cold (3 iterations) + Human |

See [`05-review-loops/iteration-budgets.md`](../05-review-loops/iteration-budgets.md) for the canonical iteration budget table.

---

## Implementation Guidance

### Spawning a Cold Reviewer

When the orchestrator spawns a cold reviewer, it must construct the context deliberately:

```
DO include:
  - The artifact to review (research file, plan section, code diff)
  - Task description / review criteria
  - Project conventions (from MuninnDB brain tree)
  - Referenced research files (for implementation review)

DO NOT include:
  - Producer's conversation history
  - Producer's reasoning or decision process
  - Intermediate drafts or rejected approaches
  - Sources the producer checked and dismissed
```

**Subsequent review iterations**: Each review iteration uses a completely fresh cold reviewer. The reviewer receives the **revised artifact** (not the original), plus a summary of **what specific issues were flagged** in the prior iteration. This allows the reviewer to verify that flagged issues were addressed while still evaluating the artifact with fresh eyes. The reviewer does NOT receive the prior reviewer's reasoning or the full prior review -- only the actionable gap descriptions (e.g., "G-ACC-001: [severity: CRITICAL] Claims groupRoutes() exists but no source cited"). This is a "re-review from scratch with targeted attention" model: the reviewer checks everything, but knows where to look closely.

### Structuring Review Feedback

When a cold reviewer finds issues, the feedback must be actionable without leaking the reviewer's reasoning framework:

```
GOOD feedback (actionable, no reasoning leak):
  "The file claims Bun supports groupRoutes(). I could not find this
   function in Context7 or official Bun docs. Please re-verify this
   claim and cite the specific documentation source."

BAD feedback (leaks reviewer reasoning):
  "I think the researcher confused Bun with Express.js, which has
   router.group(). The researcher should check Bun.serve() docs
   specifically and compare with Express's Router API to understand
   the difference."
```

The bad feedback tells the producer _how_ to think about the problem, which replaces their reasoning with the reviewer's. The good feedback tells the producer _what_ needs to be fixed, allowing them to apply their own reasoning.

### Verifying Isolation in Practice

The orchestrator can verify that isolation is maintained by checking the context provided to each agent:

| Check                   | Passes If                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| No conversation history | Agent context does not contain prior `assistant` or `user` turns from another agent                   |
| No reasoning artifacts  | Agent context does not contain `THINKING:`, `REASONING:`, or chain-of-thought markers                 |
| Output-only for review  | For review tasks, the only producer artifact in context is the final output                           |
| Bounded references      | Research file references are explicit (file paths), not embedded (pasted content from multiple files) |

---

## Key Takeaways

1. **Isolation is not about distrust.** It is about eliminating structural blind spots that no agent can overcome through effort or prompting.

2. **Cold isolation is the default for all review steps.** Warm isolation is for continuation. No isolation is for same-agent follow-up only.

3. **Reviewers must NEVER see reasoning.** This is the hardest rule to follow and the most important. Reasoning is where assumptions hide.

4. **Cold review is cheaper per cycle than warm review.** The cost of isolation comes from more review cycles, not from each cycle being more expensive.

5. **Scale isolation intensity with complexity.** All complexity levels use cold review, but TRIVIAL tasks run with `fast` model tier and 1 iteration, while CRITICAL tasks run with `capable` tier and up to 3 iterations.

6. **Feedback must be actionable, not prescriptive.** Tell the producer what is wrong, not how to fix it. Let them apply their own reasoning to the fix.

---

## Related Documents

- [README.md](README.md) -- How agent isolation connects to other v2 principles
- [context-rot-prevention.md](context-rot-prevention.md) -- Fresh agents as the mechanism for context rot prevention
- [grounded-decisions.md](grounded-decisions.md) -- Cold reviewers as the enforcement mechanism for grounding
- [multi-file-architecture.md](multi-file-architecture.md) -- How output files enable isolation (reviewers load files, not context)
