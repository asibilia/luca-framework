# Anti-Step-Skipping Research Synthesis

Research conducted 2026-03-28 to address a systemic problem in Luca's skill-based orchestration: LLMs skip workflow steps, especially "invisible" ones (learning capture, verification) while reliably executing "visible" ones (code execution, git push).

## The Unanimous Finding

All four research agents converged on one conclusion: **this is an architecture problem, not a prompting problem.**

| Source                            | Finding                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| MASFT (150+ traces, 5 frameworks) | Prompt-based tactical fixes yield only **+14% improvement**                            |
| Strands Agents (600 runs)         | Steering hooks: **100%** accuracy. Simple prompts: 82.5%. Graph workflows: 80.8%       |
| IFScale (2025)                    | At 500 instructions, best model achieves **68.9%** accuracy. Omission errors dominate. |
| InFoBench (ACL 2024)              | Even GPT-4 fails 10%+ of decomposed requirements                                       |
| The math                          | 90% per-step compliance x 15 steps = **20.6% all-steps-complete** probability          |

The core principle from AWS Strands research: **"The hook runs outside the LLM. The decision is not the LLM's to make."**

## Research Documents

| Document                                                           | Focus                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [01-reliability-research.md](./01-reliability-research.md)         | How production frameworks handle step reliability + academic research on LLM instruction-following failure modes          |
| [02-decomposition-case.md](./02-decomposition-case.md)             | The case for sub-skill decomposition, backed by "Lost in the Middle," IFScale, and framework consensus                    |
| [03-state-machine-case.md](./03-state-machine-case.md)             | The case for typed state transitions, backed by Temporal, Stripe, Netflix, and "make illegal states unrepresentable"      |
| [04-novel-approaches.md](./04-novel-approaches.md)                 | Unconventional techniques: progressive disclosure, hook enforcement, behavioral contracts, event sourcing, formal methods |
| [05-recommended-architecture.md](./05-recommended-architecture.md) | The converged layered architecture recommendation                                                                         |

## The Three Approaches Debated

### Approach A: Decomposition (Sub-Skill Chains)

Break monolithic skills into chains of small, atomic sub-skills (~100-150 lines).

**Strongest arguments:**

- "Lost in the Middle" (Liu et al., ACL 2024): 30%+ attention degradation for middle-positioned instructions
- IFScale: Omission errors dominate as instruction density increases
- ACL 2024 Findings: Prompt chaining "consistently outperforms monolithic stepwise prompts"
- Both Anthropic and OpenAI officially recommend decomposition

**Critical weakness:** Decomposition moves step-skipping risk from _within_ a skill to _between_ skills. The orchestrator that chains sub-skills is still an LLM.

### Approach B: State Machine Enforcement

Add typed state transitions that structurally prevent step-skipping.

**Strongest arguments:**

- "Make illegal states unrepresentable" (Yaron Minsky): No transition from FETCHED to FIXED means validation cannot be skipped
- Production validation: Stripe, Netflix, Uber, AWS Step Functions
- QuantumBlack (McKinsey): "Agents struggle with meta-level decisions about workflow sequencing"

**Critical weakness:** Development overhead per skill. The LLM must actually query the state machine.

### Approach C: Novel Techniques

Game-changing patterns from adjacent fields:

1. **Progressive Disclosure** (game design): Only reveal the NEXT step. The LLM cannot skip what it cannot see.
2. **Framework-Level Hooks** (Strands/AgentSpec): Deterministic hooks outside the LLM's decision loop. 100% enforcement.

## The Converged Architecture

All agents independently arrived at a layered approach:

```
Layer 0: DECOMPOSITION (reduce cognitive load)
  Large skills -> chains of focused sub-skills (~100-150 lines)

Layer 1: PROGRESSIVE DISCLOSURE (prevent seeing skippable steps)
  DAG executor reveals only the current step
  Mandatory tool call to advance

Layer 2: STATE MACHINE (enforce legal transitions)
  Per-skill state definitions
  luca-bridge validates transitions

Layer 3: HOOK ENFORCEMENT (framework-level guardrails)
  Pre-step hooks check DAG prerequisites
  Deterministic, unbypassable, millisecond overhead

Layer 4: EVENT-SOURCED GAP DETECTION (catch-all safety net)
  Session ledger as authority on step completion
  Post-execution audit against DAG
```

Each layer catches what the previous one misses.

## Existing Luca Infrastructure (80% Coverage)

| Component                      | Exists? | Location                                      |
| ------------------------------ | ------- | --------------------------------------------- |
| DAG executor                   | Yes     | `src/workflow/__helpers/dag-executor.ts`      |
| DAG sorter (topological)       | Yes     | `src/workflow/__helpers/dag-sorter.ts`        |
| Step contracts (typed outputs) | Yes     | `src/workflow/__schemas/contracts.schemas.ts` |
| State machine bridge           | Yes     | `luca-bridge` CLI (13 subcommands)            |
| Session ledger (event log)     | Yes     | `.planning/session-ledger.jsonl`              |
| Hook infrastructure            | Yes     | `src/hooks/`, `.claude/settings.json`         |
| Checkpoint schemas             | Yes     | `DAGCheckpointSchema`                         |

**What's missing:**

1. Per-skill state machine definitions
2. Step-by-step executor mode with progressive disclosure
3. Pre-step hooks that check DAG prerequisites
4. Post-execution gap detection against the event log
