# MuninnDB-Mediated Context Pattern

## Overview

In the Agent()-based orchestration architecture, each sub-agent runs in an isolated context window with no conversation history from the parent. Rather than embedding large context blobs in Agent() prompts, MuninnDB serves as the **shared memory layer** between orchestrator and sub-agents — analogous to a database in a microservices architecture.

Each sub-agent follows a standardized 3-phase memory protocol: **recall** relevant context at startup, **observe** and store findings during execution, and **handoff** results for the next agent.

## Why MuninnDB Over Prompt Embedding

| Approach                   | Prompt Size                      | Context Quality                          | Cross-Step Memory              | Token Cost                   |
| -------------------------- | -------------------------------- | ---------------------------------------- | ------------------------------ | ---------------------------- |
| Embed everything in prompt | Large (2000+ tokens)             | Static snapshot, gets stale              | Lost between agents            | High (repeated per agent)    |
| File references only       | Small but agent reads many files | Fresh but unfocused                      | Lost between agents            | Medium (file reads)          |
| **MuninnDB-mediated**      | **Minimal (~200 tokens)**        | **Semantic recall = focused + relevant** | **Persists across all agents** | **Low (recall is targeted)** |

### Key Advantages

1. **Small Agent() prompts** -- role + recall instructions + task, not walls of context
2. **Semantic relevance** -- each agent recalls exactly what it needs, not a dump of everything
3. **Cross-step memory** -- findings from step 3 are available to step 7 via MuninnDB recall, not lost between agent boundaries
4. **Isolation modes work naturally** -- cold agents recall less, warm agents recall more, matching existing Luca conventions
5. **Learning accumulates** -- session observations build up across agents; lu-learner extracts validated patterns at the end
6. **Dual-vault routing preserved** -- project context in repo vault (`luca-framework`), generalizable patterns in default vault

---

## The 3-Phase Memory Protocol

Every sub-agent spawned by an orchestrator follows this protocol. The orchestrator's Agent() prompt template includes these phases as standard sections.

### Phase 1: Recall (Agent Startup)

The agent loads context from MuninnDB before doing any work. Three recall operations, in order:

```
1. Project identity (always):
   muninn_recall(vault: "luca-framework", context: ["project identity", "brain project"])
   → Returns: project name, stack, conventions, architecture patterns
   Note: If the brain tree root ULID is known, use muninn_recall_tree(vault, root_id: "{ULID}")
         instead. The root_id parameter requires a ULID, not a concept name.

2. Session context (always):
   muninn_recall(vault: "luca-framework", context: ["session context", "{step_description}"])
   → Returns: current phase, complexity, config flags, findings from prior steps

3. Relevant patterns (when applicable):
   muninn_recall(vault: "default", context: ["patterns and pitfalls", "{task_domain}"])
   → Returns: validated approaches, known issues, user preferences
```

**API notes:**

- `muninn_recall` takes `context` as an **array of strings**, not a single string
- `muninn_recall_tree` takes `root_id` as a **ULID**, not a concept name
- Recall is semantic search — there is no concept-prefix filter

**Recall depth is gated by complexity** (existing complexity matrix):

| Complexity | Recall Depth  | What Gets Recalled                        |
| ---------- | ------------- | ----------------------------------------- |
| TRIVIAL    | 1 entry max   | Project identity only                     |
| SIMPLE     | 1 entry max   | Project identity + session context        |
| MODERATE   | 3 entries max | All three recall operations               |
| COMPLEX    | Unlimited     | All three, plus domain-specific recalls   |
| CRITICAL   | Unlimited     | All three, plus exhaustive pattern search |

### Phase 2: Observe (During Execution)

As the agent does its work, it stores observations for future agents and the learning pipeline:

```
Code observations:
  muninn_remember(vault: "luca-framework", concept: "session:code-observations", content: "...")

Discoveries:
  muninn_remember(vault: "luca-framework", concept: "session:discovery", content: "...")

Candidate patterns (approaches that worked well):
  muninn_remember(vault: "luca-framework", concept: "session:candidate-pattern", content: "...")

Candidate pitfalls (issues encountered):
  muninn_remember(vault: "luca-framework", concept: "session:candidate-pitfall", content: "...")

Decisions made (choices with rationale):
  muninn_remember(vault: "luca-framework", concept: "session:candidate-decision", content: "...")
```

**All session memories use the `session:*` prefix** and route to the repo vault per the vault-routing rule.

### Phase 3: Handoff (Agent Completion)

The agent returns a structured result to the orchestrator. Observations are already stored in MuninnDB -- the next agent can recall them without explicit passing.

```
Return to orchestrator:
  STATUS: success | failure
  RESULT: {structured summary of what was done}
```

The orchestrator then:

1. Parses the Agent's STATUS/RESULT
2. Writes the state transition to the context file
3. Stores accumulated session state for the next agent (if needed)
4. Spawns the next agent

---

## Orchestrator Memory Responsibilities

The orchestrator (lu.skill.ts) manages the session memory lifecycle:

### Session Initialization (Step 1)

Before spawning any agents, the orchestrator seeds the session context:

```
muninn_remember(vault: "luca-framework", concept: "session:init", content: "
  Task: {user_request}
  Complexity: {classified_level}
  Oversight: {oversight_mode}
  Phases: {phase_list}
  Branch: {current_branch}
  Config: {key_config_flags}
")
```

### Between Agent Steps

After each agent completes, the orchestrator updates the session state:

```
muninn_remember(vault: "luca-framework", concept: "session:progress", content: "
  Step completed: {step_name}
  Status: {success|failure}
  Key result: {summary}
  Phase: {current_phase}
  Remaining: {steps_left}
")
```

This creates a running log that subsequent agents can recall to understand what has already been done.

### Session Cleanup (Final Step)

After all agents complete, the orchestrator triggers learning extraction and cleanup:

```
1. Spawn lu-learner agent:
   → Recalls all session:candidate-* entries
   → Promotes validated patterns to permanent pattern:*/pitfall:*/decision:* in default vault
   → Cleans up remaining session:* entries (see cleanup pattern below)

2. Final session summary:
   muninn_remember(vault: "luca-framework", concept: "session:summary", content: "...")
```

**Session cleanup pattern:** `muninn_forget` requires a specific ULID `id`, NOT a wildcard like `session:*`. To clean up session entries:

```
1. Recall all session entries:
   results = muninn_recall(vault: "luca-framework",
     context: ["session context", "session findings", "session candidate"],
     since: "{SESSION_START}")

2. Iterate and forget each by ULID:
   for each result:
     muninn_forget(vault: "luca-framework", id: result.id)  // result.id is a ULID
```

---

## Integration with Existing Isolation Modes

Luca agents already define three isolation modes. The MuninnDB recall protocol maps cleanly:

| Isolation Mode           | Receives via MuninnDB                                          | Used By                                                        |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `none` (full context)    | Brain tree + session context + all session findings + patterns | lu-executor, lu-planner                                        |
| `warm` (session + brain) | Brain tree + session context, no session findings              | lu-verifier, lu-premortem                                      |
| `cold` (minimal)         | Brain tree only, no session context                            | Code reviewers (dx-advocate, code-architect, security-auditor) |

The orchestrator controls isolation by varying the recall instructions in the Agent() prompt:

```
# Full context (isolation: none)
<context_loading>
1. muninn_recall(vault: "luca-framework", context: ["project identity", "brain project"])
2. muninn_recall(vault: "luca-framework", context: ["session context", "findings for phase {NN}"])
3. muninn_recall(vault: "default", context: ["relevant patterns", "{domain}"])
</context_loading>

# Warm context (isolation: warm)
<context_loading>
1. muninn_recall(vault: "luca-framework", context: ["project identity", "brain project"])
2. muninn_recall(vault: "luca-framework", context: ["session context", "current phase"])
</context_loading>

# Cold context (isolation: cold)
<context_loading>
1. muninn_recall(vault: "luca-framework", context: ["project identity", "brain project"])
</context_loading>
```

---

## Agent() Prompt Template (Updated with Memory Protocol)

The standard Agent() call template, with the MuninnDB memory protocol integrated:

```
Agent(
  prompt: "
<role>
You are {agent-role}. {Brief responsibilities}.
You have access to Read, Write, Edit, Bash, Grep, Glob, and MCP tools.
You CANNOT call Agent(), Task(), or Skill().
</role>

<memory_protocol>
PHASE 1 — RECALL (do this FIRST, before any other work):
1. Load project identity:
   mcp__muninn__muninn_recall(vault: 'luca-framework', context: ['project identity', 'brain project'])
2. Load session context:
   mcp__muninn__muninn_recall(vault: 'luca-framework', context: ['session context', '{step_description}'])
3. Load relevant patterns:
   mcp__muninn__muninn_recall(vault: 'default', context: ['{domain-specific recall query}'])

PHASE 2 — OBSERVE (during your work):
Store significant findings as you work:
- Code observations: mcp__muninn__muninn_remember(vault: 'luca-framework', concept: 'session:code-observations', content: '...')
- Candidate patterns: mcp__muninn__muninn_remember(vault: 'luca-framework', concept: 'session:candidate-pattern', content: '...')
- Candidate pitfalls: mcp__muninn__muninn_remember(vault: 'luca-framework', concept: 'session:candidate-pitfall', content: '...')

PHASE 3 — HANDOFF (when done):
Return your results in the output contract format below.
Your observations are already stored in MuninnDB — the next agent will recall them.
</memory_protocol>

<task>
{Step-specific instructions}
</task>

<files_to_read>
- {relevant file paths}
</files_to_read>

<output_contract>
STATUS: success OR failure
RESULT: {structured result description}
</output_contract>
",
  name: "{step-name}",
  description: "{3-5 word description}"
)
```

---

## Session Memory Lifecycle

```
/lu invoked
  │
  ├── Orchestrator seeds session:init in MuninnDB
  │
  ├── Agent "route" ─── recalls session:init ─── stores observations
  ├── Agent "configure" ── recalls session:* ─── stores observations
  ├── Agent "backlog" ─── recalls session:* ─── stores observations
  │
  ├── FOR each phase:
  │   ├── Orchestrator writes session:progress (phase N starting)
  │   ├── Agent "discuss" ── recalls session:* + patterns ── stores context
  │   ├── Agent "plan" ──── recalls session:* + discuss findings ── stores plan
  │   ├── Agent "execute" ─ recalls session:* + plan + patterns ── stores observations
  │   ├── Agent "verify" ── recalls session:* (warm) ── stores results
  │   ├── Agent "review" ── recalls brain tree only (cold) ── stores findings
  │   ├── Agent "learn" ─── recalls all session:candidate-* ── promotes to permanent
  │   └── Orchestrator writes session:progress (phase N complete)
  │
  ├── Orchestrator writes session:summary
  └── Cleanup: recall session entries by ULID, forget each individually
```

---

## Vault Routing (Unchanged)

All session memories follow the existing vault-routing rule:

| Concept Prefix              | Vault                                            | Rationale                                     |
| --------------------------- | ------------------------------------------------ | --------------------------------------------- |
| `session:*`                 | Repo vault (`luca-framework`)                    | Session context is project-scoped             |
| `session:candidate-pattern` | Repo vault (promoted to `default` by lu-learner) | Candidates are project-scoped until validated |
| `pattern:*` (promoted)      | Default vault                                    | Validated patterns are cross-cutting          |
| `pitfall:*` (promoted)      | Default vault                                    | Validated pitfalls are cross-cutting          |
| `brain:project-*`           | Repo vault                                       | Project identity                              |

---

## Edge Cases

### Agent Crashes Before Storing Observations

If a sub-agent crashes mid-execution, its MuninnDB writes up to that point are preserved (MuninnDB writes are fire-and-forget — each write completes independently). The orchestrator detects the failure via the Agent() return value and can retry or skip.

### MuninnDB Unavailable

If MuninnDB is unreachable, agents fall back to file-based context:

- Read `.planning/STATE.md` for state
- Read `.planning/config.json` for config
- Read context file `/tmp/lu-context.json` for accumulated results

The Agent() prompt template should include this fallback instruction.

### Session Memory Bloat

Long pipelines (10+ phases) could accumulate many `session:*` entries. Mitigations:

- lu-learner promotes validated entries and cleans up the rest after each phase (not just at session end)
- The orchestrator can call `muninn_forget` for stale `session:progress` entries between phases
- Recall depth limits (from complexity matrix) prevent retrieving too many entries

### Concurrent Sessions

Two `/lu` sessions would write to the same MuninnDB vault. Mitigations:

- **Timestamp-based isolation**: Use `since: "{SESSION_START}"` parameter on all `muninn_recall` calls to filter to entries created during the current session. MuninnDB supports ISO 8601 timestamp filtering on recall.
- Session start timestamp is recorded at session init and embedded in every Agent() prompt
- Context files should use session-scoped paths (`/tmp/lu-context-{SESSION_ID}.json`) or use the existing `.claude/.session-lock` pattern
- A lock file or session ID check should be added to the orchestrator initialization

---

## Related Documents

- [architecture.md](./architecture.md) -- Full migration architecture (Option B)
- [Vault routing rule](../../.claude/rules/vault-routing.md) -- Write routing table for MuninnDB
- [Complexity gating rule](../../.claude/rules/complexity-gating.md) -- Recall depth per complexity level
