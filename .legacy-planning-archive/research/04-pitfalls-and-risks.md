# Pitfalls and Risks: Skill() to Agent() Migration (Claude Code Bug #17351)

## Scope

This document catalogs risks, edge cases, and failure modes for the migration from Skill()-based orchestration to Agent()-based orchestration across 5 Luca orchestrators. The migration flattens 4 levels of nested Skill() calls to a single level of Agent() calls to work around Claude Code bug #17351.

**Orchestrators affected:** lu, phase-execute, milestone-complete, pr-address, verify

---

## Common Pitfalls

### Pitfall 1: Sub-Agent Cannot Spawn Sub-Agents

**What goes wrong:** A sub-agent spawned via Agent() attempts to call Agent() or Skill() itself. The call silently fails or returns to the main session, breaking the pipeline exactly like the original bug.

**Why it happens:** The architecture research proposes that phase-execute, milestone-complete, pr-address, and verify become "monolith Agent()" calls. These monoliths contain internal workflow steps. If the developer writing the monolith prompt accidentally includes Agent() or Skill() calls (e.g., copying existing sub-skill logic that uses those tools), the nesting constraint is violated.

**How to avoid:**

- Audit every monolith prompt to ensure it uses ONLY Task() for delegation, never Agent() or Skill()
- Add a lint/grep check in the build pipeline: search generated SKILL.md files for `Agent(` or `Skill(` patterns inside monolith prompts
- Document the constraint prominently in each monolith's JSDoc and inline prompt

**Warning signs:** Pipeline halts after first Agent() call from a monolith, with no error. The parent orchestrator receives no return value.

### Pitfall 2: Inlining Phase-Loop Logic Into lu Creates Context Window Pressure

**What goes wrong:** The lu orchestrator, after inlining lu-phase-loop's ~700 lines of logic (dependency graph, topological sort, swarm execution, oversight gates, milestone boundary, cross-milestone loop, failure handling), becomes 1000-1500 lines. The LLM's quality degrades in the 50-70% context usage zone, causing it to rush through or skip late-pipeline steps.

**Why it happens:** lu-phase-loop is the largest sub-skill (~700+ lines). When inlined, the lu SKILL.md crosses the quality degradation threshold documented in the lu-workflow rule (quality DEGRADING at 50-70% context usage).

**How to avoid:**

- Measure the final lu SKILL.md token count before deploying. Target under 50% of the model's effective context budget
- Consider keeping lu-phase-loop as a separate Agent() call rather than inlining, if the token budget allows. lu-phase-loop does not itself orchestrate via Skill() -- it uses Skill() calls that would become Agent() calls, but since sub-agents cannot call Agent(), this requires lu to own ALL the Agent() calls and pass results to a stateless coordinator
- Aggressive summarization: convert verbose bash examples and tables in the prompt to compact forms

**Warning signs:** Late-pipeline steps (learning capture, gap detection, final commit) are skipped or executed perfunctorily. Session summaries become terse or inaccurate.

### Pitfall 3: Enforcement Hooks Match on `tool_name === "Skill"` -- Agent() Calls Are Invisible

**What goes wrong:** All 5 pre-step enforcement hooks (`pre-step-lu.ts`, `pre-step-phase-execute.ts`, `pre-step-verify.ts`, `pre-step-milestone-complete.ts`, `pre-step-pr-address.ts`) plus the enforcement hook factory check `if (toolName !== "Skill") return exitSuccess()`. Agent() calls have `tool_name === "Agent"` and pass through enforcement completely unchecked.

**Why it happens:** The enforcement layer was built specifically for Skill() tool interception. It was never designed for Agent() calls because Agent() was only used for leaf-level Task() spawns, not orchestrator-level workflow steps.

**How to avoid:**

- Update `enforcement-hook-factory.ts` line 173 to match BOTH `"Skill"` and `"Agent"` (or whatever the Agent tool's `tool_name` value is)
- The `tool_input` schema for Agent() is different from Skill(). Skill has `tool_input.skill` and `tool_input.args`. Agent() has `tool_input.prompt`, `tool_input.model`, etc. The skill name extraction logic (step 4 of the factory) must be rewritten to parse agent identity from the prompt or a new parameter
- Alternatively, if monolith skills are inlined (no sub-skill boundaries at the Agent() call level), the per-sub-skill enforcement hooks become unnecessary. The monolith handles its own ordering internally, enforced by inline stop-check instructions

**Warning signs:** Steps execute out of order with no hook blocking them. Gap detection audit at the end catches missing sections, but by then the damage is done.

### Pitfall 4: Context Files Designed for Shared-Process State, Not Cross-Process State

**What goes wrong:** Context files at `/tmp/{skill}-context.json` are read and written by the orchestrator and its sub-skills. In the Skill() model, all skills share the same process and filesystem access. In the Agent() model, sub-agents run in separate Claude instances. If a sub-agent writes to the context file, the parent may read stale data (or vice versa) because there is no synchronization.

**Why it happens:** Skill() is a prompt injection -- the parent and sub-skill share the same conversation context and tool access. Agent() spawns an isolated instance. The context file protocol assumes shared-process access patterns.

**How to avoid:**

- Verify that Agent() sub-agents DO have filesystem access to `/tmp/`. Based on Claude Code documentation, sub-agents have their own tool access and should be able to read/write local files. This must be confirmed empirically
- Adopt a read-modify-write discipline: the orchestrator reads context AFTER each Agent() returns, not concurrently
- For monolith Agent() calls, the monolith writes to the context file and the orchestrator reads it after the Agent() returns. This is sequential and safe

**Warning signs:** Context file contains stale `current_state`, causing enforcement hooks to block valid operations. Or context file is empty/corrupt after an Agent() call.

### Pitfall 5: Losing Standalone Sub-Skill Invocability

**What goes wrong:** Users currently invoke sub-skills directly (e.g., `/verify-test`, `/pr-fetch`, `/phase-execute-waves`). After inlining into monoliths, these become sections within a larger prompt and lose their independent SKILL.md files. Users cannot invoke them standalone.

**Why it happens:** The migration deletes 23 sub-skill source files and inlines their logic into parent monoliths. The build pipeline no longer generates standalone SKILL.md files for them.

**How to avoid:**

- Identify which sub-skills are actually invoked standalone by users (vs. only invoked by orchestrators). Based on the available skills list, ALL 23 sub-skills are currently registered and invocable
- For sub-skills with legitimate standalone use cases (verify-test, pr-fetch, verify-extract), keep them as separate skills in the registry WITH a warning that standalone invocation may produce different results than orchestrator-driven invocation
- Alternatively, create lightweight "redirect" skills that tell the user to use the parent orchestrator

**Warning signs:** Users report that `/verify-test` or `/pr-fetch` no longer works. Support burden increases.

### Pitfall 6: Agent() Prompt Must Replicate the Entire Sub-Skill Context

**What goes wrong:** When the orchestrator calls `Skill("phase-execute-waves", "{phase_number} {flags}")`, the sub-skill has access to the full conversation history, all previously loaded skills, and the orchestrator's context. When replaced with `Agent("phase-execute-waves", ...)`, the sub-agent starts with a blank context. It does not know the project identity, current phase, complexity level, model profile, MuninnDB vault, or any prior context from the session.

**Why it happens:** Agent() is isolated by design. Each sub-agent has its own context window. The parent must explicitly pass everything the sub-agent needs via the `prompt` parameter.

**How to avoid:**

- Build a "context envelope" that the orchestrator constructs before each Agent() call. Include: phase number, complexity level, model profile, vault name, project identity summary, relevant config flags, file paths for PLAN.md files
- Use the existing context file as a shared state medium: have the orchestrator write context BEFORE spawning the Agent(), and have the Agent() read it at startup
- Template the Agent() prompt to include a standard context preamble

**Warning signs:** Agent() sub-agents fail to find PLAN.md files, use wrong complexity levels, write to wrong MuninnDB vault, or skip steps because they lack context about what has already been done.

---

## Failure Modes

### Agent() Call Returns Empty/Error with No Diagnostic

**Trigger:** Sub-agent encounters an error (context file corruption, missing PLAN.md, bridge unavailable) and fails silently. Agent() returns an empty string or generic error message to the parent.

**Impact:** The orchestrator cannot distinguish between "sub-agent completed successfully with no output" and "sub-agent failed." State machine transitions based on Agent() return value may proceed incorrectly, leaving the pipeline in an inconsistent state.

**Prevention:**

- Require all monolith Agent() prompts to produce structured output (e.g., JSON with `success`, `error`, `state` fields)
- The orchestrator must parse Agent() return value and treat missing/malformed output as a failure
- Context file serves as secondary verification: after Agent() returns, read the context file to confirm expected sections were populated

**Recovery:** Re-invoke the Agent() call. If it fails again, abort with a diagnostic message to the user including the last known context file state.

### Parallel Agent() Calls Corrupt Shared Context File

**Trigger:** The lu orchestrator's phase loop includes parallel execution (swarm mode) where multiple Agent() calls run concurrently. If two Agent() sub-agents write to the same context file simultaneously, the file becomes corrupted (partial writes, lost updates).

**Impact:** Context file fails Zod validation, triggering ABORT per PREMORTEM Constraint #1. All subsequent enforcement checks fail.

**Prevention:**

- Context files are per-orchestrator (e.g., `/tmp/lu-context.json`, `/tmp/phase-execute-context.json`). Parallel Agent() calls should NOT share a context file
- In swarm mode, each parallel executor should write to its own namespaced context file (e.g., `/tmp/phase-{N}-execute-context.json`)
- The `writeContextFile` helper uses deep merge, not overwrite, but concurrent deep merges are still unsafe without locking

**Recovery:** Delete the corrupted context file and re-initialize via `context-cli.ts init`. Re-run the failed step.

### State Machine Desynchronization Between Bridge and Context File

**Trigger:** The orchestrator emits bridge transitions (e.g., `luca-bridge transition --event=VERIFY_PASSED`) and writes context file state (e.g., `current_state: "verified"`). If the bridge succeeds but the context write fails (or vice versa), the two state tracking systems diverge.

**Impact:** The enforcement hooks read context file state. The bridge reads state machine state. If they disagree, the pipeline may be blocked by hooks while the bridge thinks execution should proceed (or vice versa).

**Prevention:**

- Write context file FIRST, then emit bridge transition. Context file is the enforcement source of truth
- If bridge fails, log warning but do not abort (bridge uses `2>/dev/null || true` pattern already)
- On recovery, read context file state as the canonical state, not bridge state

**Recovery:** Manual state correction via `context-cli.ts write {name} '{"current_state":"..."}'` to bring context file in sync with bridge.

### lu SKILL.md Exceeds Model Context Budget

**Trigger:** After inlining lu-phase-loop (700+ lines), lu-route context, lu-configure context, and the full orchestration flow, the lu SKILL.md exceeds the effective context budget. The model starts skipping sections.

**Impact:** Late-pipeline steps (learning capture, gap detection, final commit, session summary) are executed poorly or skipped entirely. Anti-skip enforcement via hooks partially mitigates this but cannot force the LLM to execute inline instructions with full fidelity.

**Prevention:**

- Measure token count of the final lu SKILL.md. If it exceeds ~800 lines or ~8000 tokens, split into sections with explicit "MANDATORY" markers
- Use the existing "STOP-CHECK" pattern (already used in lu-phase-loop) to create attention anchors at critical transition points
- Consider a hybrid approach: inline only the phase loop coordination logic (dependency graph, level grouping, oversight gates) and keep the phase execution step as a separate Agent() call

**Recovery:** Reduce prompt size by extracting reference tables, config examples, and bash code blocks into separate reference files that the orchestrator reads lazily via `@file` references.

### Build Pipeline Produces Orphaned Generated Files

**Trigger:** Deleting 23 sub-skill source files causes `bun run build:all` to stop generating their SKILL.md files in `.claude/skills/`. However, the old generated files remain on disk. Claude Code discovers them via directory scanning and presents them as available skills, creating confusion.

**Impact:** Users see deleted sub-skills as available (e.g., `/phase-execute-waves` appears in the skill list). Invoking them loads stale SKILL.md content that references the old architecture.

**Prevention:**

- The build pipeline (`build-shared.ts`) should delete the `.claude/skills/{name}/` directory for any skill removed from the registry
- Run `bun run check:drift` after build to detect orphaned generated files
- Add a cleanup step at the start of `build:all` that removes all generated skill directories before regenerating

**Recovery:** Manually delete orphaned `.claude/skills/{name}/` directories. Run `bun run build:all` to regenerate from current source.

---

## Performance Traps

| Pattern                                                 | Why It's Slow                                                                                                                                                             | Better Approach                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent() per sub-skill step (10-15 calls per pipeline)   | Each Agent() starts a fresh Claude instance with its own context window. Context loading + model warm-up overhead per call. Estimated 5-15 seconds per Agent() spawn      | Batch related steps into fewer, larger Agent() calls. A single "phase-execute" monolith Agent() replaces 3 separate Agent() calls                                                             |
| Passing full project context in every Agent() prompt    | If the context envelope (project identity, brain tree, config, learnings) is 2000+ tokens and repeated 10 times, that is 20,000 tokens of redundant context               | Write context to a shared file, tell Agent() where to read it. Only pass minimal identifiers in the prompt                                                                                    |
| Sequential Agent() calls when steps are independent     | lu-route, lu-configure could potentially run in parallel but are called sequentially via Agent()                                                                          | Identify truly independent steps and use parallel Agent() calls where ordering constraints allow. However, lu-route must complete before lu-configure (dependency), so parallelism is limited |
| Re-reading context file after every Agent() return      | If the orchestrator reads, parses, and validates the context file between every step, the overhead accumulates (each read involves Bun.file(), JSON.parse, Zod safeParse) | Cache context reads. Only read when the next step's decision depends on context data. Use the Agent() return value for simple pass/fail signals                                               |
| Monolith Agent() with 500+ lines of inline instructions | Large prompts consume the model's attention budget, reducing quality on late sections                                                                                     | Structure monolith prompts with clear section headers, mandatory markers, and stop-checks. Keep total under 8000 tokens if possible                                                           |

---

## Security Considerations

### Context File Stored in World-Readable /tmp/

**Risk:** Context files at `/tmp/lu-context.json`, `/tmp/phase-execute-context.json`, etc. are readable by any process on the machine. They contain workflow state, phase numbers, and potentially sensitive project metadata.

**Severity:** LOW (single-developer workflow, no multi-tenant risk). The context files are ephemeral (session-scoped) and contain no secrets.

**Mitigation:** If the framework is ever used in shared environments, move context files to a user-scoped directory (e.g., `$HOME/.luca/context/`) with restrictive permissions.

### Agent() Prompts Could Be Injected

**Risk:** If the user's task description is interpolated directly into an Agent() prompt without sanitization, a crafted task description could inject instructions into the sub-agent's prompt.

**Severity:** LOW (the user IS the developer -- they are injecting into their own tools). However, if Jira ticket descriptions are pulled into Agent() prompts, external content could reach the sub-agent.

**Mitigation:** Sanitize Jira ticket content before interpolation. Use structured prompt templates with clear delimiters between system instructions and user content.

---

## Migration / Version Risks

### Hook Registration in settings.json

All 5 pre-step enforcement hooks are registered in `.claude/settings.json` under `PreToolUse` with `matcher: "Skill"`. After migration:

- If the hooks are not updated to match `"Agent"` (or a regex like `"Skill|Agent"`), they become dead code -- they fire on Skill() calls that no longer exist, and ignore Agent() calls that need enforcement
- The settings.json is a generated file (via `bun run build:all`). The source of truth is `src/hooks/__helpers/hook-registry.ts`. Changes must go there, not in settings.json directly

### Template Generation in packages/luca-framework

24 template SKILL.md files exist in `packages/luca-framework/templates/harness/claude/skills/` for the sub-skills being deleted. These templates are used when `luca init` scaffolds a new project. If the templates are not removed:

- New projects get orphaned skill files for deleted sub-skills
- Template drift: the templates reference Skill() patterns that no longer work

**Files affected:** All 24 sub-skill template directories under `packages/luca-framework/templates/harness/claude/skills/`

### Skill Registry in build-skill-registry.ts

`src/skills/__helpers/build-skill-registry.ts` imports and registers all 23 sub-skills being deleted. After deletion:

- Build will fail with import errors if the registry is not updated
- This is the FIRST thing that breaks -- it will be caught immediately by `bunx --bun tsc --noEmit`

### Context Schema Files May Become Orphaned

5 context schema files exist (`lu-context.schemas.ts`, `phase-execute-context.schemas.ts`, `verify-context.schemas.ts`, `milestone-complete-context.schemas.ts`, `pr-address-context.schemas.ts`). Their purpose is tracking inter-sub-skill state. After inlining:

- The `lu-context.schemas.ts` still has a purpose (tracking lu's own orchestrator state for enforcement)
- `phase-execute-context.schemas.ts` becomes questionable: if phase-execute is a monolith, internal state tracking can be simplified
- The context-cli.ts registry maps all 5 names. Removing schema files without updating context-cli.ts causes runtime errors

### State Machine Definitions May Need Consolidation

5 state machine files exist in `src/skills/__schemas/states/`. After inlining sub-skills into monoliths:

- `lu.states.ts` must expand to include phase-loop states (or the phase-loop state tracking becomes internal to the monolith's instructions)
- `phase-execute.states.ts`, `verify.states.ts`, `milestone-complete.states.ts`, `pr-address.states.ts` may be deleted or simplified
- The `shared-transitions.ts` ABORT_TRANSITION is used by all 5 -- verify it is still referenced after changes

### luca-bridge Integration

The luca-bridge reads state from `state.json` and emits transitions. After migration:

- Bridge transitions (VERIFY_PASSED, LEARN_COMPLETE, etc.) are emitted by the orchestrator between Agent() calls -- this does not change
- Bridge read-status is used by `pre-step-enforcement.ts` -- this hook fires on `Bash|Skill` matcher. If Agent() replaces Skill(), the enforcement hook may need its matcher updated

### MuninnDB Session Context

Sub-skills currently write session observations to MuninnDB (e.g., `session:findings`). After migration:

- Monolith Agent() sub-agents have access to MuninnDB MCP tools (they have their own tool access)
- The vault resolution logic must be replicated in each Agent() prompt, or the vault name must be passed as a parameter
- Risk: Agent() writes to wrong vault ("default" instead of repo vault) because vault resolution reads `.planning/config.json` which the Agent() must also read

---

## Risk Matrix

| #   | Risk                                                              | Likelihood | Impact | Category               |
| --- | ----------------------------------------------------------------- | ---------- | ------ | ---------------------- |
| 1   | Sub-agent calls Agent()/Skill() violating nesting constraint      | HIGH       | HIGH   | Flattening             |
| 2   | lu SKILL.md exceeds quality degradation threshold                 | HIGH       | HIGH   | Context loss           |
| 3   | Enforcement hooks blind to Agent() calls                          | HIGH       | HIGH   | Anti-skip regression   |
| 4   | Build pipeline fails due to missing imports in registry           | HIGH       | LOW    | Build pipeline         |
| 5   | Sub-agent lacks session context (project identity, config, vault) | MEDIUM     | HIGH   | Context loss           |
| 6   | Context file race condition in parallel Agent() calls             | MEDIUM     | HIGH   | Reliability            |
| 7   | Standalone sub-skill invocability lost for users                  | MEDIUM     | MEDIUM | Backward compatibility |
| 8   | Orphaned generated SKILL.md files confuse skill discovery         | MEDIUM     | MEDIUM | Build pipeline         |
| 9   | Template scaffolding includes deleted sub-skills                  | MEDIUM     | MEDIUM | Build pipeline         |
| 10  | Agent() return value empty/ambiguous on failure                   | MEDIUM     | MEDIUM | Reliability            |
| 11  | State machine desync between bridge and context file              | LOW        | HIGH   | Reliability            |
| 12  | Context file corruption from concurrent writes                    | LOW        | HIGH   | Reliability            |
| 13  | MuninnDB vault misrouting from Agent() sub-agents                 | LOW        | MEDIUM | Context loss           |
| 14  | Token overhead from 10-15 Agent() context initializations         | LOW        | MEDIUM | Performance            |
| 15  | State machine schema files orphaned after deletion                | LOW        | LOW    | Build pipeline         |

---

## Recommended Migration Order

### Phase 1 (Proof-of-Concept): pr-address

**Why pr-address first:**

- Simplest orchestrator (6 sequential sub-skills, no loops, no parallel execution)
- No nesting deeper than 3 levels (lu -> pr-address -> pr-fix)
- Self-contained workflow (fetch PR, validate, debate, fix, learn, respond)
- Not on the critical path for the main /lu workflow
- Smallest blast radius if something goes wrong
- Has its own context file and state machine, isolated from lu's state

**What to validate:**

1. Agent() returns control to parent after each step
2. Enforcement hooks work (or are correctly disabled) for Agent() calls
3. Context file reads/writes work from Agent() sub-agents
4. Monolith prompt (inlining 6 sub-skills) fits in context budget
5. Task() calls from within the monolith Agent() still work

### Phase 2: verify

**Why verify second:**

- 4 sub-skills, moderate complexity
- Has conditional branching (Path A vs Path B) that tests orchestrator control flow
- Also not on the critical /lu path when called standalone

### Phase 3: milestone-complete

**Why milestone-complete third:**

- 5 sub-skills, moderate complexity
- Some sub-skills use Task() internally (milestone-learn, milestone-shadow-gate)
- Tests the Task()-from-monolith-Agent() pattern

### Phase 4: phase-execute

**Why phase-execute fourth:**

- The most complex monolith (waves + verify + review, each with internal Task() calls)
- This is on the critical path: phase-execute is called from lu-phase-loop on every phase
- Must validate: wave parallelism via Task(), harness fix loops, code review swarm
- Context file protocol is heavily used

### Phase 5: lu (top-level orchestrator)

**Why lu last:**

- Highest risk: inlines lu-phase-loop (700+ lines)
- Affects every workflow entry point
- Must handle: dependency graph, topological sort, oversight gates, swarm execution, milestone boundary, cross-milestone loop
- By this point, all sub-orchestrators (phase-execute, milestone-complete, pr-address, verify) are already migrated and validated

---

## Rollback Strategy

### Per-Orchestrator Rollback

Each orchestrator migration is independent. If a migrated orchestrator fails:

1. **Revert source file** to pre-migration version via `git checkout HEAD~1 -- src/skills/{path}/{skill}.skill.ts`
2. **Restore deleted sub-skill files** from git history
3. **Re-add registry entries** in `build-skill-registry.ts`
4. **Rebuild** via `bun run build:all` (user must run manually -- never run during Claude Code session)
5. **Verify** via `bun run check:drift`

### Full Rollback

If the migration approach is fundamentally flawed:

1. `git revert` all migration commits (they should be on a feature branch)
2. Re-run `bun run build:all` manually
3. The pre-migration architecture is fully preserved in git history

### Canary Period

After each orchestrator migration, run at least 3 full workflow cycles before proceeding to the next orchestrator. Monitor for:

- Pipeline stalls (the original bug symptom -- should NOT occur with Agent())
- Skipped steps (anti-skip regression)
- Context file corruption
- MuninnDB vault misrouting
- User complaints about missing standalone skills

---

## Confidence Assessment

| Area                                           | Level  | Reason                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bug #17351 root cause (Skill() nesting fails)  | HIGH   | Confirmed by 2 bug reports with repro, official Claude Code issues, and behavioral observation in this codebase                                                                                                                                                                |
| Agent() returns control to parent              | HIGH   | Documented Claude Code behavior, confirmed by existing Task()/Agent() usage in leaf agents throughout the codebase                                                                                                                                                             |
| Sub-agents cannot spawn sub-agents             | HIGH   | Documented in Claude Code sub-agent docs, referenced in the investigation write-up                                                                                                                                                                                             |
| Agent() sub-agents have filesystem access      | MEDIUM | Expected based on Claude Code docs (sub-agents have tool access), but not empirically verified for `/tmp/` writes in this codebase. Must be confirmed in Phase 1                                                                                                               |
| Enforcement hook `tool_name` for Agent() calls | LOW    | The exact `tool_name` value that Claude Code sends for Agent() tool invocations is not documented in the investigation. It may be "Agent", "Task", or something else. Must be inspected from hook stdin data during Phase 1                                                    |
| Context window pressure from inlined lu        | MEDIUM | Based on the quality degradation curve documented in lu-workflow rule and the known size of lu-phase-loop (~700 lines). Exact impact depends on model and prompt engineering                                                                                                   |
| Template/registry cleanup completeness         | HIGH   | File inventory is fully documented in the architecture research (01-architecture-patterns.md, 24 files listed). Mechanical deletion with tsc verification                                                                                                                      |
| Swarm/parallel execution compatibility         | LOW    | The investigation does not address how parallel Agent() calls interact with context files, bridge transitions, or enforcement hooks. The swarm mode (TeamCreate/Task with worktree isolation) is already complex; adding Agent() migration on top adds unverified interactions |

---

## What Might I Have Missed

1. **Claude Code platform changes:** Bug #17351 has been open since 2026-02-09. If Anthropic ships a fix, the migration may become unnecessary. However, planning for the fix is prudent because the timeline is unknown.

2. **Agent() tool_input schema:** The enforcement hook factory extracts skill names from `tool_input.skill`. The Agent() tool likely has a completely different `tool_input` schema (prompt, model, description). The hook adaptation is not a simple `"Skill" -> "Agent"` string replacement -- the entire skill-name extraction logic must be redesigned.

3. **Agent() token budgets:** Each Agent() call has its own token budget. The parent orchestrator's remaining budget is not affected, but the sub-agent's budget is separate. Complex monolith prompts (phase-execute with waves + verify + review inlined) may exceed the sub-agent's token budget if the prompt itself is large AND the sub-agent needs to do substantial work.

4. **Error propagation across Agent() boundaries:** If a sub-agent encounters an error and writes diagnostic info to stderr or the context file, how does the parent orchestrator detect and surface this? The Skill() model had implicit error propagation (same conversation). Agent() requires explicit error handling.

5. **Hook ordering and timing:** With Skill(), hooks fire before the Skill() tool call is executed. With Agent(), hooks would fire before the Agent() tool call. But Agent() spawns a separate process -- the hook fires synchronously before spawn. If the hook needs to check state that the sub-agent has not yet written, the timing may be different from the Skill() model.

6. **Phase-loop loop semantics:** lu-phase-loop contains a `for each phase` loop. When inlined into lu, this loop must be implemented by the LLM. LLMs are notoriously unreliable at maintaining loop state across long execution sequences. Each loop iteration involves multiple Agent() calls, context reads, and state transitions. The risk of the LLM "forgetting" the loop counter or breaking out early increases with context usage.

7. **Existing Skill() calls inside sub-skills being kept:** lu-route currently calls `Skill("jira-issue")` and `Skill("git-feature")` internally. If lu-route becomes an Agent() leaf, these Skill() calls are now at nesting depth 2 (lu -> Agent("lu-route") -> Skill("jira-issue")). Since sub-agents cannot use Skill(), these must also be converted to Task() or inlined. This was noted in the architecture research but is easy to overlook during implementation.
