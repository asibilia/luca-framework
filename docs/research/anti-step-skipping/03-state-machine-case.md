# The Case for State Machine Enforcement

## The Core Problem

When an LLM orchestrator receives a multi-step skill prompt, it treats instructions as _suggestions weighted by attention_, not as _mandatory sequential operations_. Text-based prohibitions -- even in ALL CAPS with bold formatting -- are the weakest form of enforcement. QuantumBlack's research concluded: **"agents routinely skipped steps, created circular dependencies, or got stuck in analysis loops"** when given meta-level orchestration decisions.

**Source:** [QuantumBlack, AI by McKinsey](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)

## Why Decomposition Alone Is Insufficient

Decomposition moves the step-skipping risk from _within_ a skill to _between_ skills. The orchestrator that chains sub-skills is still an LLM. Nothing structurally prevents it from calling `Skill("pr-fetch")` then jumping to `Skill("pr-fix")`. The bold-text warning in `lu.skill.ts` ("The phase pipeline is inviolable") exists precisely because the LLM _has_ skipped these steps.

## Make Illegal States Unrepresentable

The pattern coined by Yaron Minsky: **if your type system prevents invalid states from being constructed, you eliminate entire categories of bugs without runtime checks.**

Applied to pr-address:

```
IDLE -> FETCHED -> VALIDATED -> DEBATED -> PLANNED -> FIXED -> VERIFIED -> LEARNED -> RESPONDED -> PUSHED
```

The system _cannot_ transition from FETCHED to FIXED because no such transition exists. You do not ask the LLM "please don't skip validation." You make skipping validation _impossible_.

**Source:** [Functional Architecture](https://functional-architecture.org/make_illegal_states_unrepresentable/)

## Evidence from Production Systems

### Stripe

Every PaymentIntent is a state machine: `requires_payment_method -> requires_confirmation -> requires_action -> processing -> succeeded`. You cannot cancel a payment in `processing` state -- the state machine rejects the transition.

**Source:** [Stripe Documentation](https://docs.stripe.com/payments/paymentintents/lifecycle)

### Netflix Conductor

Workflows as explicit state machines. "If a worker crashes or a task fails, Conductor retries the task based on predefined policies, using the persisted workflow state as the source of truth."

**Source:** [Netflix TechBlog](https://netflixtechblog.com/netflix-conductor-a-microservices-orchestrator-2e8d4771bf40)

### Uber Cadence / Temporal

"Preserves a complete multithreaded application state including thread stacks with local variables across hardware and software failures." Temporal's innovation was _durable execution_ -- automatically recording each workflow step as an event.

**Source:** [Cadence Workflow](https://cadenceworkflow.io/docs/use-cases/orchestration); [Temporal Blog](https://temporal.io/blog/temporal-replaces-state-machines-for-distributed-applications)

### AWS Step Functions

Enforces step ordering through explicit `Next` field definitions. States cannot advance without an explicit transition definition.

**Source:** [AWS Documentation](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-statemachines.html)

## Evidence from AI Agent Space

### LangGraph

Explicit edge definitions enforce step ordering: `add_edge("browse", "add_to_cart")`. Step-skipping is impossible by construction.

**Source:** [LangGraph State Machines](https://dev.to/jamesli/langgraph-state-machines-managing-complex-agent-task-flows-in-production-36f4)

### Stately Agent (XState for AI)

"Agents cannot arbitrarily jump between states -- only valid transitions defined in the state machine configuration are permitted."

**Source:** [Stately/XState Agent](https://github.com/statelyai/agent)

### Scale AI

State machines with explicit `next_node` configurations for deterministic transitions with "persistent state management."

**Source:** [Scale AI Documentation](https://docs.gp.scale.com/docs/agents/state-machines)

### QuantumBlack

"Agents are good at generating content within a bounded problem; they struggle with meta-level decisions about workflow sequencing." Solution: "a conventional, rule-based workflow engine" handling phase transitions deterministically while agents execute bounded tasks.

**Source:** [QuantumBlack](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)

## Concrete Design: Per-Skill State Machines

### The pr-address Example

```typescript
export const PR_ADDRESS_TRANSITIONS = [
  { from: "IDLE", to: "FETCHED", event: "COMMENTS_FETCHED" },
  { from: "FETCHED", to: "CATEGORIZED", event: "COMMENTS_CATEGORIZED" },
  { from: "CATEGORIZED", to: "VALIDATED", event: "VALIDATION_COMPLETE" },
  {
    from: "VALIDATED",
    to: "DEBATED",
    event: "DEBATE_COMPLETE",
    guard: (ctx) => ctx.hasSplitVerdicts,
  },
  {
    from: "VALIDATED",
    to: "PLANNED",
    event: "PLAN_CREATED",
    guard: (ctx) => !ctx.hasSplitVerdicts,
  },
  { from: "DEBATED", to: "PLANNED", event: "PLAN_CREATED" },
  { from: "PLANNED", to: "FIXED", event: "FIXES_APPLIED" },
  { from: "FIXED", to: "VERIFIED", event: "FIXES_VERIFIED" },
  { from: "VERIFIED", to: "LEARNED", event: "LEARNINGS_CAPTURED" },
  { from: "LEARNED", to: "RESPONDED", event: "RESPONSES_POSTED" },
  { from: "RESPONDED", to: "PUSHED", event: "CHANGES_PUSHED" },
] as const;
```

**Critical property:** There is no transition from FETCHED to FIXED. To reach PUSHED, the system must pass through LEARNED.

### Lightweight Implementation (~50 lines)

```typescript
function createSkillStateMachine<S extends string>(
  transitions: ReadonlyArray<{
    from: S;
    to: S;
    event: string;
    guard?: (ctx: Record<string, unknown>) => boolean;
  }>,
  initial: S,
) {
  let current: S = initial;
  const transitionMap = new Map<string, (typeof transitions)[number]>();

  for (const t of transitions) {
    transitionMap.set(`${t.from}:${t.event}`, t);
  }

  return {
    current: () => current,
    transition(event: string, ctx: Record<string, unknown> = {}): boolean {
      const key = `${current}:${event}`;
      const t = transitionMap.get(key);
      if (!t) return false;
      if (t.guard && !t.guard(ctx)) return false;
      current = t.to;
      return true;
    },
  };
}
```

### Integration with luca-bridge

Extend with a `skill-state` subcommand: `luca-bridge skill-state --skill=pr-address --event=COMMENTS_FETCHED --data='{"count": 12}'`. The bridge validates the transition, rejects illegal ones, and persists state to `.planning/skill-state/{skill-name}.json`.

## The Saga Pattern

A saga is "a sequence of local transactions where each local transaction updates the database and publishes a message or event to trigger the next." Each step in a Luca skill is a local transaction, and the state machine enforces correct ordering with compensating transactions for rollback.

**Source:** [Microservices Saga Pattern](https://microservices.io/patterns/data/saga.html); [DZone: Modeling Saga as a State Machine](https://dzone.com/articles/modelling-saga-as-a-state-machine)

## Honest Assessment of Downsides

### Development Overhead

Every multi-step skill needs a state definition. For 15+ skills, this is non-trivial. Start with the 3-4 skills that skip steps most frequently.

### Debugging Complexity

When a transition fails, developers need to understand why. Mitigated by a `skill-state --explain` subcommand showing current state and available transitions.

### Rigidity Under Novel Conditions

State machines encode _expected_ workflows. Edge cases require guard conditions with `skip` semantics. The existing DAG executor already supports guard-based skipping.

### The "LLM Doesn't Read State" Objection

The LLM may not query the state machine before acting. Solution: make the bridge a _gatekeeper_, not an _advisor_. If a skill is invoked but state prerequisites aren't met, the bridge returns an error.

## Summary

| Property                        | Text Instructions | Decomposition Alone | State Machine              |
| ------------------------------- | ----------------- | ------------------- | -------------------------- |
| Prevents within-skill skipping  | No                | Partially           | Yes                        |
| Prevents between-skill skipping | No                | No                  | Yes                        |
| Crash recovery                  | No                | No                  | Yes (checkpointed)         |
| Auditability                    | No                | Partial             | Yes (transition history)   |
| Evidence of completion          | No                | No                  | Yes (evidence schemas)     |
| Production proven               | N/A               | Limited             | Stripe, Netflix, Uber, AWS |

## Sources

- [Temporal: Beyond State Machines](https://temporal.io/blog/temporal-replaces-state-machines-for-distributed-applications)
- [LangGraph State Machines](https://dev.to/jamesli/langgraph-state-machines-managing-complex-agent-task-flows-in-production-36f4)
- [Stately/XState Agent](https://github.com/statelyai/agent)
- [Make Illegal States Unrepresentable](https://functional-architecture.org/make_illegal_states_unrepresentable/)
- [Stripe PaymentIntents Lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)
- [Netflix Conductor](https://netflixtechblog.com/netflix-conductor-a-microservices-orchestrator-2e8d4771bf40)
- [AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-statemachines.html)
- [Scale AI State Machines](https://docs.gp.scale.com/docs/agents/state-machines)
- [QuantumBlack: Agentic Workflows](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [Agents Arcade: State Management](https://agentsarcade.com/blog/state-management-in-agentic-workflows)
- [Composable State Machines in TypeScript](https://medium.com/@MichaelVD/composable-state-machines-in-typescript-type-safe-predictable-and-testable-5e16574a6906)
