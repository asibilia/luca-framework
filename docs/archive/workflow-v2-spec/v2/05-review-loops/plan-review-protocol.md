# Plan Review Protocol

> The convergence-based review loop that verifies plan soundness before execution begins, using existing domain-specialist review agents in cold isolation. **This section is the canonical specification** for the plan review loop (Decision 19).

---

## Position in the Pipeline

The plan review loop is Step 8 of the Luca v2 workflow. It sits between plan creation (Step 7) and execution (Step 9):

```
Step 6: Graduate to MuninnDB ---> Persistent engrams
Step 7: Plan ------------------> PLAN.md (with @research refs)
                                       |
                                       v
                         +========================+
                         |  Step 8: REVIEW PLAN   |
                         |                        |
                         |  Iteration 1:          |
                         |    Spawn 3 reviewers   |
                         |    Collect findings    |
                         |    Aggregate + decide  |
                         |                        |
                         |  If BLOCKING findings: |
                         |    lu-planner revises   |
                         |    Iteration 2...      |
                         |                        |
                         |  If approved:          |
                         |    Proceed to execute  |
                         +========================+
                                       |
                                       v
                         Step 9: Execute (wave-based)
```

---

## Trigger Conditions

The plan review loop activates when:

1. `lu-planner` has produced a PLAN.md file in `.planning/phases/{NN}-{name}/`
2. The plan contains at least one wave with at least one task
3. The research review loop (Step 5) has completed with APPROVED status

If the plan is empty or the planner flagged an unresolvable issue, the orchestrator escalates to the user instead of running the review loop.

---

## Reviewer Agents

Three existing domain-specialist review agents are reused for plan review (Decision 2). Unlike the research review loop (which uses NEW purpose-built reviewer agents), the plan review loop leverages agents that already exist in the Luca agent registry. **3 reviewers run at all complexity levels** (Decision 13) -- complexity affects model tier and iteration budget, not reviewer count.

| Reviewer             | Source                                         | Evaluation Focus                                                                          |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **code-architect**   | `src/agents/general/code-architect.agent.ts`   | Architecture, task scoping, dependency ordering, technical feasibility                    |
| **dx-advocate**      | `src/agents/general/dx-advocate.agent.ts`      | Developer experience, documentation quality, naming consistency, standards compliance     |
| **security-auditor** | `src/agents/general/security-auditor.agent.ts` | Security implications, authentication/authorization gaps, input validation, data exposure |

### Why Reuse Existing Agents

These three agents already exist for code review during the execution phase (Step 9). Reusing them for plan review provides:

- **Consistent evaluation criteria**: The same agents that review the code also review the plan, ensuring alignment between what is planned and what is accepted
- **No new agent definitions needed**: Reduces maintenance burden
- **Domain expertise**: Each agent has a well-defined specialty documented in its agent definition

### Cold Isolation Enforcement

Each reviewer receives:

```
INPUT:
  .planning/phases/{NN}-{name}/PLAN.md              (the plan being reviewed)
  .planning/phases/{NN}-{name}/research/*.md         (all research files, flat directory)
  .planning/phases/{NN}-{name}/CONTEXT.md            (locked decisions from Step 3)
  User intent from Step 1                            (what was asked for)

NOT INCLUDED:
  lu-planner session context          (reasoning, trade-off analysis, discarded approaches)
  MuninnDB session engrams            (session:planning-* entries)
  Other reviewers' findings           (reviewers do not see each other)
```

Reviewers are spawned in parallel. Each evaluates the plan independently against the research corpus.

### Model Tier

Plan reviewers use the DEEP_ANALYSIS routing preset:

| Complexity | Model Tier |
| ---------- | ---------- |
| TRIVIAL    | fast       |
| SIMPLE     | balanced   |
| MODERATE   | capable    |
| COMPLEX    | capable    |
| CRITICAL   | capable    |

---

## Review Criteria by Reviewer

### code-architect

The code-architect evaluates the plan from a structural and technical perspective:

| Criterion                    | What to Check                                                                 | Red Flag                                                  |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Task scoping**             | Is each task implementable within a single context window?                    | Tasks that span multiple files with complex interactions  |
| **Dependency ordering**      | Are wave dependencies correct? Does Wave N depend on something from Wave N+1? | Circular dependencies, missing predecessors               |
| **Architecture soundness**   | Does the proposed structure match the codebase's existing patterns?           | New patterns introduced without justification in research |
| **Research grounding**       | Does each task reference specific research findings?                          | Tasks with no `@research` references (ungrounded)         |
| **Scope completeness**       | Are all aspects of the user's intent covered by at least one task?            | User intent aspects with no corresponding task            |
| **File boundary violations** | Do tasks respect the module boundary and domain architecture rules?           | Cross-domain imports, tier violations                     |

### dx-advocate

The dx-advocate evaluates the plan from a developer experience and standards perspective:

| Criterion                 | What to Check                                                                                         | Red Flag                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Task documentation**    | Does each task have enough detail for an executor agent to implement without guessing?                | Tasks with only a title and no description   |
| **Naming consistency**    | Do proposed file names, function names, and variable names follow kebab-case and project conventions? | PascalCase file names, camelCase directories |
| **Standards compliance**  | Do tasks follow established patterns (functional APIs, Zod schemas, lodash preference)?               | Tasks proposing class-based implementations  |
| **Verification criteria** | Does each task specify how to verify success?                                                         | Tasks with no acceptance criteria            |
| **Error handling**        | Do tasks address error cases, not just happy paths?                                                   | Tasks that implement only the success path   |

### security-auditor

The security-auditor evaluates the plan for security implications:

| Criterion               | What to Check                                           | Red Flag                                                |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| **Authentication gaps** | Do tasks that handle user data include auth checks?     | Direct data access without auth verification            |
| **Input validation**    | Do tasks that accept external input include validation? | Raw input passed to functions without Zod parsing       |
| **Data exposure**       | Could the implementation leak sensitive data?           | Error messages that include internal state, logging PII |
| **Dependency security** | Do new dependencies have known vulnerabilities?         | Adding packages without security review                 |
| **Authorization**       | Are permission checks present where needed?             | CRUD operations without role-based access control       |

---

## Review Output Format

Each reviewer produces a structured review document:

```markdown
## Plan Review: [Reviewer Name] - Iteration [N]

**Plan file**: [path to PLAN.md]
**Iteration**: [N] of [max]
**Timestamp**: [ISO 8601]

### Blocking Findings (must fix before execution)

These findings will cause execution failures, security vulnerabilities,
or architectural violations if not addressed.

- BLOCK-001: [task reference] -- [finding] -- [suggested fix]
- BLOCK-002: [task reference] -- [finding] -- [suggested fix]

### Advisory Findings (should fix, will not block)

These findings would improve the plan but are not required for safe execution.

- ADV-001: [task reference] -- [finding] -- [suggested fix]
- ADV-002: [task reference] -- [finding] -- [suggested fix]

### Commendations (optional)

Specific aspects of the plan that are well-designed.

- [task reference] -- [what is well-designed]

### Verdict: APPROVED / REVISE

**Rationale**: [1-2 sentences explaining the verdict]
```

### Finding ID Convention

```
BLOCK-NNN    Blocking finding (must fix before execution)
ADV-NNN      Advisory finding (should fix, will not block)
```

IDs are per-reviewer, per-iteration. When findings repeat across iterations (not addressed), the original ID is retained with a note.

---

## Loop Decision

The orchestrator collects all three reviews and evaluates:

```
                    Merged findings
                         |
                         v
              Any BLOCKING findings?
              /                    \
           YES                      NO
            |                        |
            v                        v
    iteration < max?              APPROVED
    /              \              (advisory findings
  YES               NO            noted as caveats
   |                 |             in the plan)
   v                 v
 REVISE          ESCALATE
(lu-planner      (to user with
 refines plan)    blocking summary)
```

Decision rules:

1. **Any BLOCKING findings** and iteration < max --> **REVISE** (lu-planner refines specific tasks)
2. **Any BLOCKING findings** and iteration >= max --> **ESCALATE** to user with summary
3. **Only ADVISORY findings or no findings** --> **APPROVED** (advisory findings noted in plan as caveats)

Note the asymmetry with the research review loop (IMP-RL-001 rationale): ADVISORY plan findings never block convergence at any iteration, while IMPORTANT research gaps may trigger additional iterations. This is intentional because research gaps propagate downstream into planning and execution (compounding errors), whereas advisory plan findings can be addressed during execution without compounding risk.

### Re-Review Strategy

When the plan is revised and re-submitted for review, **reviewers always perform a full re-evaluation** of the entire plan (not just the changed sections). This ensures that revisions do not introduce regressions in previously-approved sections. Reviewers are fresh instances in cold isolation, so they cannot selectively review only the delta.

### Maximum Iterations (Decision 14)

Plan review has a lower iteration budget than research review. The rationale: if the research corpus is thorough (ensured by the research review loop), the plan should be close to correct on the first attempt. Excessive plan revisions indicate a research problem, not a planning problem.

| Complexity | Plan Review Max Iterations |
| ---------- | -------------------------- |
| TRIVIAL    | 1                          |
| SIMPLE     | 1                          |
| MODERATE   | 2                          |
| COMPLEX    | 2                          |
| CRITICAL   | 3                          |

---

## Plan Revision (When Looping)

When the loop decides to REVISE, the orchestrator:

1. Compiles the merged blocking findings into a structured revision request
2. Spawns `lu-planner` with the revision request and the original plan
3. `lu-planner` updates only the specific tasks referenced in blocking findings (not a full rewrite)
4. The updated plan is saved as the same PLAN.md file (overwritten)
5. The revision details are appended to the plan review section of REVIEW-LOG.md

### Revision Request Format

```markdown
## Plan Revision Request - Iteration [N]

### Blocking Findings to Address

- BLOCK-001 (code-architect): Task W1-T2 "Implement reconnection state
  machine" has a circular dependency with W1-T3 "Add backoff timer."
  The state machine needs the timer, and the timer needs state transitions.
  **Suggested fix**: Merge into a single task or define a clear interface
  boundary.

- BLOCK-003 (security-auditor): Task W2-T1 "Add WebSocket authentication"
  does not include token refresh handling. The research file
  websocket-auth.md documents that tokens expire after 1 hour.
  **Suggested fix**: Add a subtask for token refresh before reconnection
  attempt.

### Advisory Findings (noted, not required to address)

- ADV-001 (dx-advocate): Task W1-T1 uses the name "wsManager" which
  does not follow the project's kebab-case file naming convention.
  Suggest renaming to "ws-manager."
```

`lu-planner` receives this revision request along with:

- The current PLAN.md
- The research files (for reference)
- CONTEXT.md (for locked decisions)

It does NOT receive the reviewers' full reasoning or the orchestrator's aggregation logic.

---

## REVIEW-LOG.md Integration

Plan review iterations are appended to the same `.planning/phases/{NN}-{name}/research/REVIEW-LOG.md` used by the research review loop, under a separate section:

```markdown
# Research Review Log

[... research review iterations ...]

---

# Plan Review Log

## Iteration 1

### Reviews

#### code-architect

[Full review output]

#### dx-advocate

[Full review output]

#### security-auditor

[Full review output]

### Aggregated Findings

- 2 BLOCKING findings
- 4 ADVISORY findings

### Decision: REVISE (2 blocking findings remain)

### Revision Request

[Compiled revision request sent to lu-planner]

### Planner Response

- BLOCK-001: Merged W1-T2 and W1-T3 into single task with clear
  interface boundary between state machine and timer.
- BLOCK-003: Added subtask W2-T1.2 "Handle token refresh before
  reconnection attempt" with reference to websocket-auth.md.

---

## Iteration 2

### Reviews

#### code-architect

[Full review output]

#### dx-advocate

[Full review output]

#### security-auditor

[Full review output]

### Aggregated Findings

- 0 BLOCKING findings
- 2 ADVISORY findings

### Decision: APPROVED

### Advisory Caveats Noted in Plan

- ADV-001: File naming updated to follow kebab-case convention.
- ADV-003: Error message wording improved per dx-advocate suggestion.
```

---

## Example Walkthrough

Using the running example: "Add WebSocket reconnection logic with exponential backoff to a Bun HTTP server."

### Plan Structure (After Step 7)

```markdown
# Plan: WebSocket Reconnection System

## Wave 1: Core Infrastructure

- W1-T1: Create ws-reconnection-manager.ts with state machine
  @research: websocket-reconnection.md, exponential-backoff-deep.md
- W1-T2: Implement exponential backoff with jitter
  @research: exponential-backoff-deep.md
- W1-T3: Add disconnect error classifier
  @research: websocket-reconnection.md (addendum: disconnect classification)

## Wave 2: Integration

- W2-T1: Integrate reconnection manager with Bun.serve() WebSocket handler
  @research: bun-websocket-api.md, bun-ws-internals-deep.md
- W2-T2: Add connection health monitoring (heartbeat + timeout)
  @research: connection-health-monitoring.md
- W2-T3: Implement message queue with replay-on-reconnect
  @research: message-queue-replay.md
```

### Iteration 1

**code-architect** verdict: **REVISE**

```markdown
### Blocking Findings

- BLOCK-001: W1-T1 and W1-T2 -- The state machine (W1-T1) needs the
  backoff timer (W1-T2), and the backoff timer needs to know the current
  state to reset. These tasks have a circular dependency.
  **Suggested fix**: Either merge them or define the backoff as a pure
  function that the state machine calls, removing the reverse dependency.

### Advisory Findings

- ADV-001: W2-T3 -- Message queue replay does not specify a maximum
  queue size. Unbounded queues could cause memory issues on long
  disconnects. **Suggested fix**: Add a max queue depth parameter
  with a sensible default (e.g., 1000 messages or 10MB).
```

**dx-advocate** verdict: **APPROVED**

```markdown
### Blocking Findings

(none)

### Advisory Findings

- ADV-001: W1-T3 -- "disconnect error classifier" is a generic name.
  Suggest "ws-disconnect-classifier.ts" to match the project's
  naming convention and indicate WebSocket scope.

- ADV-002: All tasks -- Verification criteria use "test passes" but
  tests are currently disabled per no-tests.md rule. Update verification
  criteria to use "bunx --bun tsc --noEmit passes" instead.
```

**security-auditor** verdict: **REVISE**

```markdown
### Blocking Findings

- BLOCK-001: W2-T1 -- Integration with Bun.serve() does not mention
  authentication. If the WebSocket endpoint requires auth, reconnection
  must re-authenticate. The research file websocket-reconnection.md
  does not cover auth-on-reconnect either.
  **Suggested fix**: Add a task for reconnection authentication or
  document that this endpoint is unauthenticated (explicit decision).

### Advisory Findings

- ADV-001: W2-T2 -- Heartbeat messages should be authenticated if
  the connection is authenticated, to prevent heartbeat spoofing.
```

### Aggregation

```
Merged BLOCKING: 2
  BLOCK-001 (code-architect): Circular dependency between W1-T1 and W1-T2
  BLOCK-001 (security-auditor): Missing auth-on-reconnect handling

Merged ADVISORY: 4
  ADV-001 (code-architect): Unbounded message queue
  ADV-001 (dx-advocate): Generic file naming
  ADV-002 (dx-advocate): Verification criteria reference disabled tests
  ADV-001 (security-auditor): Heartbeat authentication

Decision: REVISE (2 blocking findings)
```

### Plan Revision

`lu-planner` receives the revision request and produces:

- **BLOCK-001 (circular dependency)**: Restructured W1-T2 to be a pure function module (`backoff-calculator.ts`) with no state machine dependency. The state machine imports and calls the calculator.
- **BLOCK-001 (auth-on-reconnect)**: Added W2-T1.1 "Add reconnection authentication handler" with explicit decision: "If auth token exists, refresh before reconnect attempt. If no auth, reconnect directly. Decision locked in CONTEXT.md."

### Iteration 2

All three reviewers now produce **APPROVED** verdicts:

- code-architect: Circular dependency resolved. No new blocking findings.
- dx-advocate: No new blocking findings. Advisory about file naming already noted.
- security-auditor: Auth-on-reconnect addressed. No new blocking findings.

```
Decision: APPROVED (0 blocking, 3 advisory noted as caveats)
```

The plan proceeds to Step 9: Execute.

---

## Edge Cases

### All Reviewers Approve on Iteration 1

Common for SIMPLE and TRIVIAL tasks where the plan is straightforward. The review loop completes in a single iteration.

### Reviewer Finds a Research Gap

If a plan reviewer discovers that the research corpus is missing information needed for a task, this is escalated differently from a plan structural issue:

- The finding is classified as BLOCKING
- The revision request notes that **research re-expansion may be needed** (not just plan revision)
- The orchestrator may re-enter the research review loop (Step 5) before continuing plan review

This is rare if the research review loop (Step 5) was thorough, but it acts as a safety net.

### Planner Disagrees with a Finding

If `lu-planner` determines that a blocking finding is incorrect (e.g., the reviewer misread the plan), the planner documents its disagreement in the revision response:

```markdown
### Response to BLOCK-002 (code-architect)

DISAGREE: The reviewer states W2-T2 has no error handling, but lines 45-52
of the plan specify a try/catch with reconnection fallback. No change needed.
```

The orchestrator includes this disagreement in the next review iteration. If the reviewer still flags it as blocking, the conflict is escalated to the user.

Each disagreement is handled independently through the same escalation path. There is no threshold for batch escalation -- if the planner disagrees with multiple findings across multiple reviewers, each disagreement is documented individually and re-evaluated by fresh reviewers in the next iteration.

### Max Iterations Reached

If blocking findings persist after the maximum iterations:

1. The orchestrator compiles a summary of all remaining blockers
2. The summary is presented to the user
3. The user can: (a) manually resolve the blockers, (b) override and continue execution with documented risk, or (c) abort the phase

---

## Related Documentation

- [README.md](README.md) -- Overview of both review loops
- [research-review-protocol.md](research-review-protocol.md) -- Research review loop protocol
- [convergence-criteria.md](convergence-criteria.md) -- Formal convergence model
- [iteration-budgets.md](iteration-budgets.md) -- Token budgets and iteration caps
- [Agent Definitions](../../../../src/agents/general/) -- Source for code-architect, dx-advocate, security-auditor
