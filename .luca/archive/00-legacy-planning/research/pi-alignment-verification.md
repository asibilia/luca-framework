# Pi Platform Alignment Verification Report

**Date:** 2026-03-29
**Scope:** Assess whether Option B (Agent migration) aligns with Pi platform architecture for future transition feasibility
**Verdict:** Option B is directionally neutral for Pi alignment -- but Pi has been fully removed and the question itself may be moot

---

## Executive Summary

Pi was **fully removed as a compilation target in Phase 159** (commit `da351de`, `03704cd`, `a6ba3b2`). All Pi adapter code, extensions, output directories, and type surface area have been deleted. The codebase targets Claude Code exclusively (`SupportedFormat = "CLAUDE" | "PLUGIN"`). The question of Pi alignment is therefore a forward-looking hypothetical, not a near-term concern.

That said, the architecture is designed with platform portability in mind through the adapter layer, workflow DAG system, and compiler plugins. Option B neither helps nor hinders a future Pi transition because the areas it changes (orchestration mechanism, enforcement hooks) are Claude Code-specific and would need adaptation for any platform regardless.

---

## Finding 1: Pi Has Been Removed -- No Active Integration Exists

**Confidence:** HIGH (verified from source code and Phase 159 summary)

**Evidence:**

- Phase 159 ("Remove Non-Claude Platforms") deleted all Pi-related code
- `SupportedFormat` narrowed from `"CLAUDE" | "CURSOR" | "PLUGIN" | "PI"` to `"CLAUDE" | "PLUGIN"`
- `ADAPTER_PLATFORMS` narrowed from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- `src/hooks/pi-extensions/` directory (20 files including luca-subagents.ts, luca-teams.ts, luca-purpose-gating.ts) deleted
- `src/hooks/adapters/pi.adapter.ts` deleted
- `.pi/` output directory deleted and added to .gitignore
- `toPiFormat()` removed from BaseAgent, BaseSkill, BaseRule types
- Phase 184 further removed platform selection from the init wizard, hardcoding `["claude"]`

**Implication:** There is no active Pi integration to align with or break. Any future Pi integration would be built from scratch using the adapter abstraction layer.

---

## Finding 2: Pi's Orchestration Model Was Fundamentally Different

**Confidence:** HIGH (verified from Pi extension source code in phases 66-70 and pi-api-learnings todo)

Pi used an **extension-based** model, not a Skill()/Agent() model:

| Concern             | Claude Code                                               | Pi (when it existed)                                                              |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- | -------------- |
| Orchestration unit  | Skills (SKILL.md) and Agents (.md files)                  | Extensions (TypeScript modules loaded by runtime)                                 |
| Sub-task delegation | Skill() (prompt injection) or Agent()/Task() (subprocess) | `pi.spawn("pi", [...])` to launch subprocess subagents                            |
| Tool registration   | Convention-based (Read/Write/Edit/Bash/Grep/Glob)         | Explicit: `pi.registerTool({ name, params, execute })`                            |
| Event hooks         | Shell scripts + settings.json matchers                    | `pi.on("session_start"                                                            | "tool_call" | ...)` handlers |
| State management    | Context files + STATE.md + bridge CLI                     | Extension-scoped in-memory state + `pi.appendEntry()` for persistence             |
| Communication       | Implicit (conversation context)                           | `pi.sendMessage()` with `deliverAs: "followUp"` for async notification            |
| UI integration      | Statusline only                                           | `ctx.ui.notify()`, `ctx.ui.confirm()`, `ctx.ui.setWidget()`, `ctx.ui.setFooter()` |

**Key insight:** Pi's architecture was event-driven and API-rich, not prompt-injection-based. The Skill() vs Agent() distinction is **Claude Code-specific** and has no analog in Pi. Pi extensions registered tools and hooks via API calls at runtime, and subagents were OS processes spawned via `pi.spawn()`.

---

## Finding 3: The Adapter Layer Already Abstracts Platform Differences

**Confidence:** HIGH (verified from adapter schemas, registry, and executor bridge)

The codebase has a mature abstraction layer designed for multi-platform support:

1. **Adapter Interface** (`src/adapters/__schemas/adapter.schemas.ts`): Defines `compileAgent()`, `compileSkill()`, `compileRule()`, `executeStep()`, `emit()`, `detect()` -- fully platform-agnostic

2. **Adapter Registry** (`src/adapters/__helpers/adapter-registry.ts`): Map-based registry with auto-detection. Currently has Claude, Cursor, Windsurf, VS Code, and API adapters registered

3. **Workflow Adapter** (`src/workflow/__schemas/workflow.schemas.ts`): Minimal `WorkflowAdapter` interface at T1 tier that any platform can implement: `{ name, executeStep }`

4. **Adapter-Executor Bridge** (`src/adapters/__helpers/adapter-executor-bridge.ts`): Bridges T3 full adapters to T1 workflow adapters, mapping `AdapterStepResult` to `StepResult`

5. **DAG Executor** (`src/workflow/__helpers/dag-executor.ts`): Platform-agnostic DAG execution engine with wave-by-wave topological sort, retry, timeout, checkpoint/resume

**Implication:** Adding a Pi adapter in the future would mean implementing the `Adapter` interface with Pi-specific `compileAgent()`, `compileSkill()`, `emit()`, and `executeStep()` methods. This is independent of whether orchestration uses Skill() or Agent() calls.

---

## Finding 4: Option B Changes Are Claude Code-Specific

**Confidence:** HIGH (verified from skill-to-agent-migration.md)

Option B changes these components:

| Component Changed                                      | Pi-Relevant? | Rationale                                                                               |
| ------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------- |
| Skill() -> Agent() calls                               | NO           | Both are Claude Code-specific invocation mechanisms. Pi uses `pi.spawn()`               |
| Enforcement hooks matching on "Skill\|Agent" tool_name | NO           | Pi used `pi.on("tool_call")` event handlers, not PreToolUse hooks                       |
| Context file protocol (context-cli.ts)                 | PARTIALLY    | Context files are filesystem-based and platform-portable. Pi extensions could read them |
| State machine validation (XState)                      | YES          | XState definitions are platform-agnostic TypeScript. Would work in any runtime          |
| Agent() prompt templates                               | PARTIALLY    | Prompt content is portable; the delivery mechanism (Agent() vs pi.spawn()) is not       |

The **workflow DAG system** and **state machines** are already platform-agnostic. These are the components that would actually matter for Pi portability, and Option B does not change them.

---

## Finding 5: Prompt Templates Would Need Adaptation Regardless

**Confidence:** HIGH (verified from migration doc Agent() call template format)

Option B's Agent() prompts embed Claude Code-specific instructions:

```
You have access to Read, Write, Edit, Bash, Grep, Glob, and MCP tools.
You CANNOT call Agent(), Task(), or Skill().
```

Pi uses a different tool set (pi.registerTool-based) and a different subprocess model. These prompts would need to be adapted for any platform transition regardless of whether orchestration uses Skill() or Agent().

The `skill-to-agent-migration.md` already proposes extracting prompt templates to `src/skills/__helpers/agent-prompts.ts`, which would make them more modular. This extraction is mildly beneficial for portability but is not the determining factor.

---

## Architectural Comparison

| Concern             | Current (Skill-based)                   | Option B (Agent-based)                    | Pi (Historical)                            | Alignment Assessment                                       |
| ------------------- | --------------------------------------- | ----------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Orchestration       | Nested Skill() calls (prompt injection) | Flat Agent() calls (subprocess)           | Extension tool registration + `pi.spawn()` | Neither aligns with Pi -- both are Claude Code patterns    |
| Sub-task delegation | Skill() or Task()/Agent()               | Agent() only                              | `pi.spawn("pi", [..., "--no-extensions"])` | Agent() is slightly closer (both are subprocess-based)     |
| State management    | Context files + bridge CLI              | Same                                      | Extension in-memory + `pi.appendEntry()`   | Context files are portable; bridge CLI is Claude-specific  |
| Enforcement         | PreToolUse hooks matching "Skill"       | PreToolUse hooks matching "Skill\|Agent"  | `pi.on("tool_call")` event handler         | Neither aligns -- Pi uses a different event model          |
| Step sequencing     | LLM-driven in SKILL.md                  | LLM-driven (orchestrator prompts Agent()) | LLM-driven within extensions               | All three are LLM-driven -- the delivery mechanism differs |
| Workflow engine     | DAG executor with WorkflowAdapter       | Same (unchanged)                          | Not integrated (was planned)               | DAG executor is the portable layer in all cases            |

---

## Assessment: Does Option B Move Closer to Pi Compatibility?

**Answer: Marginally, but not meaningfully.**

### Slight Alignment

- Agent() calls are subprocess-based like Pi's `pi.spawn()`, whereas Skill() calls are prompt-injection-based. This is a philosophical alignment but not a practical one -- the subprocess APIs are completely different.
- Extracting prompt templates to shared modules (as proposed in Option B) improves modularity, which benefits any future platform transition.
- Removing 23 sub-skill files reduces the compilation surface -- fewer entities to adapt when adding a new platform.

### No Alignment

- The enforcement hook changes (matching "Agent" tool_name) are Claude Code-specific and have zero Pi applicability.
- The context file protocol is unchanged by Option B and would need Pi-specific adaptation regardless.
- The DAG executor (the truly portable component) is unchanged by Option B.

### Slight Misalignment

- Option B concentrates orchestration logic in lu.skill.ts, making it a larger monolith. If Pi were re-added, this monolith would need to be decomposed into Pi-compatible units (extensions or spawned processes). The current sub-skill decomposition is actually closer to Pi's extension model (many small, focused modules).

---

## Recommendation

Pi alignment should NOT be a factor in the Option B decision because:

1. **Pi is removed** -- there is no active integration to protect
2. **The adapter layer handles portability** -- adding Pi back means implementing the Adapter interface, not restructuring orchestration
3. **The workflow DAG system is the true portability layer** -- it's platform-agnostic and unchanged by Option B
4. **The Claude Code-specific changes in Option B (Skill->Agent, hook matchers) are irrelevant to Pi** -- they would need completely different implementations for Pi's extension model
5. **Option F (Channels) is the architecturally superior path for deterministic orchestration** and is equally applicable whether the current state uses Skill() or Agent()

Evaluate Option B solely on its Claude Code merits (fixing the nesting bug, improving reliability, reducing SKILL.md count) without weighting Pi alignment as a factor.

---

## Confidence Assessment

| Area                               | Level  | Reason                                                                                             |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Pi removal status                  | HIGH   | Verified from Phase 159 summary, git history, and current source code                              |
| Pi's historical architecture       | HIGH   | Verified from Pi extension source in phases 66-70, pi-api-learnings todo, and E2E validation plans |
| Adapter layer portability          | HIGH   | Read all adapter schemas, registry, executor bridge, and workflow adapter interface                |
| Option B's Claude Code specificity | HIGH   | Read full skill-to-agent-migration.md (650 lines) and enforcement hook factory                     |
| Pi re-integration feasibility      | MEDIUM | Based on architecture analysis, not empirical validation (Pi is removed)                           |
| Option B alignment assessment      | MEDIUM | Directional analysis -- no way to empirically validate without rebuilding Pi integration           |
