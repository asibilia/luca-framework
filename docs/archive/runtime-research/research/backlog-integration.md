# Backlog Integration Analysis

**Date:** 2026-03-23
**Author:** Backlog Integrator (pre-grooming review)
**Scope:** Map runtime architecture roadmap (Phases A-E) against existing backlog, domain architecture, and module boundaries

---

## Phase A: DAG Workflow Engine

### Related Existing Todos

| Todo                                  | Title                               | Relationship                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v2-phase-6-orchestrator-integration` | Wire v2 pipeline into `/lu`         | **Direct overlap.** Phase A replaces the prose orchestrator that Phase 6 wires into. The v2 `lu.skill.ts` modifications planned in this todo would be building on top of an artifact that Phase A intends to make a _compilation output_ of the DAG. If Phase A lands first, v2-phase-6 becomes "wire v2 pipeline into the DAG definition" instead of "wire into lu.skill.ts prose." |
| `v2-phase-1-research-infrastructure`  | 4 parallel researcher agents        | **Made easier.** The DAG engine's `parallelGroups` concept directly models the fan-out/fan-in pattern the research phase needs (spawn 4 researchers in parallel, aggregate). Currently this parallelism is encoded in prose instructions.                                                                                                                                            |
| `v2-phase-2-review-loop`              | Convergence-based research review   | **Made easier.** The review loop's convergence logic (iterate while CRITICAL findings exist, max iterations) maps cleanly to DAG step retry configuration with guard conditions. The DAG engine would formalize what is currently ad-hoc iteration logic.                                                                                                                            |
| `v2-phase-4-plan-enhancement`         | Plan review loop                    | **Made easier.** Same as above -- plan review loop becomes a DAG sub-workflow with typed step contracts between planner and reviewers.                                                                                                                                                                                                                                               |
| `v2-phase-5-executor-enhancement`     | Per-task MuninnDB recall            | **Neutral.** This is an agent-level enhancement (executor receives research refs). Unaffected by whether the orchestrator is prose or DAG-based.                                                                                                                                                                                                                                     |
| `v2-phase-3-muninndb-graduation`      | Research files to semantic memory   | **Neutral.** Graduation logic is agent-level, not orchestration-level.                                                                                                                                                                                                                                                                                                               |
| `v2-config-and-schema-updates`        | Config and schema extensions for v2 | **Partial overlap.** The DAG engine introduces its own Zod schemas (`WorkflowStepSchema`, `WorkflowDAGSchema`, step contracts). These must coexist with the v2 config schemas. The `workflow.version` field from v2 config could be extended to also control DAG vs prose orchestration mode.                                                                                        |

### Affected Domains (T0-T3)

| Tier | Domain                       | Impact                                                                                                                                                                                                                                                 |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1   | **NEW: `src/workflow/`**     | New core domain. Must be classified as T1 Core, Archetype B.                                                                                                                                                                                           |
| T1   | `src/iteration/`             | The DAG executor subsumes some iteration concerns (retry, convergence). The iteration domain's budget/checkpoint/convergence logic needs to be either consumed by the DAG executor or exposed as utility functions the executor calls.                 |
| T1   | `src/planner/`               | The planner's cost model and scoring could feed into DAG step metadata. No structural change, but the planner may need to emit DAG-compatible output.                                                                                                  |
| T1   | `src/harness/`               | Per the DAG design doc, harness becomes "a tool invoked by the execute step, not a standalone system." This is a conceptual demotion from standalone system to utility. Structural change is minimal (harness stays T1, called by DAG executor).       |
| T1   | `src/context/`               | Context assembly feeds into DAG execution context. No structural change.                                                                                                                                                                               |
| T0   | `src/complexity/`            | Complexity level feeds into DAG step configuration (model tier per step). The existing `resolveModelForAgent()` API is consumed by the DAG executor to determine which model to use per step. No structural change.                                    |
| T2   | `src/agents/`, `src/skills/` | Agent and skill definitions become DAG step handlers. The current agent registry maps to `handler` fields in `WorkflowStepSchema`. Skills that orchestrate sub-workflows (phase-execute, phase-research) would eventually be expressed as nested DAGs. |
| T3   | `src/compilers/`             | The compiler pipeline's relationship to the DAG engine is critical: the Claude adapter (Phase B) replaces/absorbs skill compilation for workflow definitions. During Phase A, compilers remain unchanged.                                              |

### Rules That Need Updating

| Rule                      | Required Change                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-architecture.md`  | Add `src/workflow/` to the tier map as T1 Core, Archetype B. Add to the domain table.                                                                                                                                            |
| `module-boundary.md`      | Add `workflow` to T1 list. Define import permissions: workflow imports T0 (shared, complexity); consumed by T2 (agents, skills) and T3 (compilers). Same-tier T1 imports allowed (workflow <-> iteration, workflow <-> context). |
| `complexity-gating.md`    | Add model routing entries for DAG executor agent(s) if they are registered as named agents. Alternatively, document that the DAG executor uses `resolveModelForAgent()` for each step's handler.                                 |
| `harness-verification.md` | Update to reflect that harness is invoked by the DAG execute step, not as a standalone phase-boundary system.                                                                                                                    |
| `hook-skill-boundary.md`  | Clarify that DAG steps are neither hooks nor skills -- they are a third category (typed workflow steps).                                                                                                                         |

### Integration Risks

1. **lu.skill.ts coexistence.** The DAG engine must coexist with the prose orchestrator during transition. The design doc acknowledges this ("can the DAG engine coexist with the prose orchestrator?") and the research recommends coexistence via the Claude adapter compiling DAG to prose. Risk: the generated prose may not match the hand-written prose exactly, causing behavioral regression. Mitigation: diff-test generated prose against current lu.skill.ts.

2. **Iteration domain overlap.** The DAG executor's retry/convergence logic overlaps with `src/iteration/`. If both systems are active, there is a risk of double-retry or conflicting convergence signals. Mitigation: clearly delineate that iteration's budget/checkpoint logic is consumed _by_ the DAG executor, not run in parallel.

3. **State machine integration.** The DAG executor uses the state machine for persistence ("tracks which step the DAG is on"). The existing state machine (`packages/luca-framework/src/state/machine.ts`) has 13 workflow states. Adding per-step DAG state tracking could expand the state space significantly. Risk: state machine complexity explosion. Mitigation: use the DAG checkpoint JSON (`dag-serializer.ts`) as a separate persistence layer, with the state machine tracking only the high-level workflow phase (idle -> executing -> verifying -> complete), not individual DAG steps.

4. **v2 workflow version interaction.** If v2's `workflow.version: "v2"` flag is active and the DAG engine is also active, which takes precedence? Risk: conflicting orchestration paths. Mitigation: the `workflow.version` field should be extended to include a "v3-dag" value, or the DAG engine should be the _implementation_ of both v1 and v2 pipelines.

### Pseudo-Plan Notes

- Phase A can begin immediately -- no dependency on v2 todos or current v5.4.0 branding work.
- The `src/workflow/` domain should be created with the standard structure (`__schemas/`, `__helpers/`, `index.ts`).
- Start with schemas and builder, then validator, then executor. Visualizer is low-priority for Phase A (can be deferred to Phase D/Studio).
- Checkpoint/resume can initially use the simple JSON snapshot approach (aligned with existing `luca-bridge` patterns).
- The existing `lu.skill.ts` should NOT be modified during Phase A. The DAG definition is a parallel artifact that can be validated against the prose without replacing it.

---

## Phase B: Adapter Architecture

### Related Existing Todos

| Todo                                  | Title                        | Relationship                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2-phase-6-orchestrator-integration` | Wire v2 pipeline into `/lu`  | **Blocked/complicated.** Phase B refactors the compiler into adapters. If v2-phase-6 has already modified `lu.skill.ts`, those modifications need to be captured in the Claude adapter's `executeStep()` logic. If v2-phase-6 has NOT landed, the Claude adapter can be built from the current lu.skill.ts. Sequencing matters. |
| `v2-phase-1-research-infrastructure`  | 4 parallel researcher agents | **Made easier (long-term).** The API adapter enables headless execution of researcher agents, which enables eval testing of research quality without running through Claude Code.                                                                                                                                               |
| `37-p1-test-suite-fragility`          | Test suite fragility         | **Made easier (long-term).** The API adapter enables headless agent testing, which could replace the broken `bun test` approach with agent evaluation via `luca eval`.                                                                                                                                                          |

### Affected Domains (T0-T3)

| Tier | Domain                                     | Impact                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | **NEW: `src/adapters/`**                   | New core domain. T1 Core, Archetype B. Contains claude/, api/, cursor/ subdirectories.                                                                                                                                                                                                                                                                        |
| T3   | `src/compilers/`                           | **Major refactoring target.** Existing compiler logic in `compile.ts`, `plugin-registry.ts` moves into `src/adapters/claude/`. The `src/compilers/` domain becomes a thin orchestration layer calling `adapter.compileAgent()`, `adapter.compileSkill()`, `adapter.compileRule()`. Eventually may be absorbed entirely.                                       |
| T3   | `src/hooks/`                               | Hook generation stays IDE-specific per adapter. The Claude adapter emits hooks to `.claude/hooks/`. Future Cursor adapter would emit to `.cursor/hooks.json`. No structural change to `src/hooks/`, but hook compilation may move into adapter-specific emitters.                                                                                             |
| T2   | `src/agents/`, `src/skills/`, `src/rules/` | Entity definitions gain a new consumer: adapters. The `AgentConfig`, `SkillConfig`, `RuleConfig` types are passed to `adapter.compileAgent()` etc. No change to entity definitions themselves, but entity schemas must be importable by the adapters domain (T1 importing T2 schemas). This is a **tier violation** under current rules -- see risk #2 below. |

### Rules That Need Updating

| Rule                      | Required Change                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain-architecture.md`  | Add `src/adapters/` to the tier map as T1 Core, Archetype B. Document the claude/, api/, cursor/ subdirectory structure.                                                                                                                                                                                                                                                                   |
| `module-boundary.md`      | **Critical update.** The adapter domain (T1) needs to import entity schemas from agents/skills/rules (T2). This is an upward dependency (T1 -> T2). Options: (a) move shared entity schemas to T0/shared, (b) create a T1 "entity-schemas" domain, (c) document this as an allowed exception. The current `src/compilers/` (T3) already imports T2 schemas -- this same pattern continues. |
| `generated-file-guard.md` | The Claude adapter replaces the compiler as the source of generated `.claude/` artifacts. The rule should reference adapters as the new source, or generalize to "generated output from build pipeline."                                                                                                                                                                                   |

### Integration Risks

1. **Backward compatibility of `bun run build:all`.** The roadmap requires that `bun run build:all` produces identical output via the Claude adapter. This is the highest-risk requirement. The existing `compile.ts` has accumulated edge cases, template transforms, and parity checks. All of this must be preserved in the Claude adapter. Mitigation: integration test that diffs output of old compiler vs. new adapter.

2. **Tier violation: adapters (T1) importing entity schemas (T2).** The existing compilers domain (T3) imports T2 entity schemas, which is technically already a downward import (T3 can import anything). But adapters at T1 importing T2 is an _upward_ dependency. Resolution options:
   - **Option A (recommended):** Adapters are actually T3 (build-time infrastructure), not T1. They are terminal -- nothing imports from adapters. This matches the compiler's current T3 classification.
   - **Option B:** Extract shared entity type definitions (AgentConfig, SkillConfig, RuleConfig) into T0 or T1, keeping entity registration in T2.
   - **Option C:** Document as an allowed exception with rationale.

3. **Claude Agent SDK dependency.** The API adapter depends on `@anthropic-ai/claude-agent-sdk`. This is a new production dependency from Anthropic. Risk: SDK version churn, API changes. Mitigation: wrap SDK calls in a thin adapter layer (despite research recommending against this -- the stability concern outweighs the simplicity concern for a framework).

4. **Compiler domain fate.** The design says compilers "becomes thin orchestration over adapters. Eventually may be absorbed entirely." This creates an ambiguous transition period where both `src/compilers/` and `src/adapters/` exist with overlapping responsibilities. Mitigation: clear ownership boundary -- compilers orchestrate (calls adapters), adapters implement (format-specific logic). Or, absorb compilers into adapters immediately rather than maintaining two domains.

### Pseudo-Plan Notes

- Phase B depends on Phase A (DAG engine provides the `WorkflowStep` type that `executeStep()` receives).
- Start by extracting the Claude adapter (pure refactoring, no new behavior). This is the safest first step.
- The API adapter requires the Claude Agent SDK dependency. Evaluate whether `bun add @anthropic-ai/claude-agent-sdk` introduces any Bun compatibility issues before committing.
- The `SupportedFormat` type in `compile.ts` (`"CLAUDE" | "PLUGIN"`) is the seed for the adapter registry. The PLUGIN format becomes the Claude plugin adapter variant.
- The `plugin-registry.ts` `Map<string, CompilerPlugin>` pattern can be directly extended to `Map<string, Adapter>`.

---

## Phase C: Eval Framework

### Related Existing Todos

| Todo                            | Title                                                         | Relationship                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `37-p1-test-suite-fragility`    | Test suite fragility                                          | **Partially superseded.** The eval framework is a different paradigm from unit tests. However, #37's core concern (CI cannot validate quality) is addressed by the eval framework's smoke tier running in CI. The eval framework does NOT replace unit tests for mechanical correctness (type safety, function contracts) -- it replaces them for _agent quality assessment_. Both are needed long-term. |
| `v2-external-research-patterns` | Validated patterns to adopt                                   | **Relevant patterns.** Pattern #2 (evaluator-optimizer review loops), #4 (deterministic convergence criteria), and #6 (verification filtering after parallel reviews) all inform eval case design. The eval framework should include eval cases that validate these patterns work as designed.                                                                                                           |
| `v2-phase-2-review-loop`        | Convergence-based research review                             | **Made easier.** The review loop's convergence behavior is a prime eval target. Eval cases can validate that the review loop terminates correctly (APPROVED, NEEDS_EXPANSION, ESCALATE) under various input conditions.                                                                                                                                                                                  |
| `v2-enhanced-existing-agents`   | Enhanced lu-router, lu-learner, lu-premortem, lu-plan-checker | **Made easier.** Each of these enhanced agents becomes an eval target. The eval framework can measure whether v2 enhancements improve agent quality vs. v1 baselines.                                                                                                                                                                                                                                    |

### Affected Domains (T0-T3)

| Tier | Domain               | Impact                                                                                                                                                                                                    |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | **NEW: `src/eval/`** | New core domain. T1 Core, Archetype B. Contains schemas, runner, reporter, comparator, graders.                                                                                                           |
| T1   | `src/observability/` | The eval reporter's output (quality reports, regression detection) overlaps with observability's scorecard engine. Consider whether eval results feed into the observability pipeline or remain separate. |
| T0   | `src/complexity/`    | Eval cases are tagged by complexity level. The eval runner should respect complexity-gated evaluation depth (more trials at COMPLEX+).                                                                    |

### Rules That Need Updating

| Rule                     | Required Change                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-architecture.md` | Add `src/eval/` to the tier map as T1 Core, Archetype B.                                                                                                                                                                                                                         |
| `module-boundary.md`     | Add `eval` to T1 list. Eval imports from T0 (shared, complexity) and T1 (adapters for API execution).                                                                                                                                                                            |
| `no-tests.md`            | **Needs nuanced update.** The no-tests rule prohibits `*.test.ts` files due to process orphaning. The eval framework is NOT unit tests -- it is a separate eval runner (`luca eval`). The rule should clarify: no `bun test` files, but eval cases in `src/eval/` are permitted. |

### Integration Risks

1. **API adapter dependency.** Eval cases need the API adapter to call Anthropic directly (not through Claude Code). If Phase B's API adapter is not ready, eval development is blocked for LLM-graded evaluations. Mitigation: develop code-based graders (lu-router accuracy, convergence detection) first -- these need no LLM calls. Use mock adapter for LLM graders during development.

2. **Cost control.** Eval runs make real API calls, incurring token costs. Risk: accidental expensive eval runs during development. Mitigation: implement cost budgets in the eval runner from day one. Default to Haiku for routine evals.

3. **Eval case maintenance.** As agents evolve (v2 enhancements, DAG integration), eval cases must be updated. Risk: eval cases become stale and produce false positives/negatives. Mitigation: tie eval case updates to agent modification todos -- when an agent changes, its eval cases must be reviewed.

### Pseudo-Plan Notes

- Phase C can begin in parallel with Phase B because it depends only on the adapter _interface_ (schemas), not the implementation.
- Start with `src/eval/__schemas/eval.schemas.ts` defining EvalCase, EvalResult, EvalReport.
- Implement code-based graders first (zero LLM cost): lu-router classification accuracy, state machine transition correctness, convergence detection true positive/negative rates.
- LLM graders come second, after the API adapter is functional.
- Consider whether eval results should be stored in MuninnDB (repo vault, `eval:*` concept prefix) for trend analysis across sessions.

---

## Phase D: Luca Studio

### Related Existing Todos

| Todo                                  | Title                         | Relationship                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `37-p1-test-suite-fragility`          | Test suite fragility          | **Partially addressed.** Studio's eval results viewer provides a visual alternative to `bun test` output. The harness results viewer shows typecheck/lint/build results in the browser. This doesn't fix the root cause (process orphaning) but provides a better feedback loop. |
| `v2-phase-6-orchestrator-integration` | Wire v2 pipeline into `/lu`   | **Made easier.** Studio's DAG view would visualize the v2 pipeline, making it easier to understand and debug the multi-step research/review/graduate/plan/execute flow.                                                                                                          |
| `v2-open-questions-to-resolve`        | 6 unresolved design decisions | **Made easier.** Studio could visualize the research lifecycle (Q5: when to read files vs. MuninnDB) and review loop iterations (Q8: reviewer freshness), making design decisions more concrete.                                                                                 |

### Affected Domains (T0-T3)

| Tier    | Domain                               | Impact                                                                                                                                                                     |
| ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | **NEW: `packages/luca-studio/`**     | Separate package outside src/ tier system. Consumes src/ domains via imports but is not consumed by them.                                                                  |
| State   | `packages/luca-framework/src/state/` | Studio's State View reads the XState machine definition and state persistence files. The state machine's `machine.ts` is imported directly by Studio for graph extraction. |
| T1      | `src/workflow/`                      | Studio's DAG View renders the workflow DAG from Phase A's definitions. Primary data source for the main visualization.                                                     |
| T1      | `src/eval/`                          | Studio's Evals View displays eval results from Phase C.                                                                                                                    |
| T2      | `src/agents/`, `src/skills/`         | Studio's Agents View browses agent/skill definitions by reading source files.                                                                                              |

### Rules That Need Updating

| Rule                      | Required Change                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generated-file-guard.md` | Studio is a dev-only tool, not generated output. Clarify that `packages/luca-studio/` is editable source, not generated.                            |
| `domain-architecture.md`  | Add `packages/luca-studio/` as a separate package (not in the src/ tier system). Document that it is a dev-only tool with no production deployment. |

### Integration Risks

1. **build:all crash.** The MEMORY.md entry is emphatic: "Never run `bun run build:all` during a Claude Code session -- it crashes the process." Studio's file watcher must avoid triggering build:all. The research doc proposes targeted recompilation, but this is LOW confidence -- it "assumes per-domain compilers exist and can run independently." Risk: the targeted recompilation approach may not work with the actual compiler architecture. Mitigation: validate that individual domain compilers can run standalone before building the file watcher.

2. **Package isolation.** Studio lives in `packages/luca-studio/`, separate from `src/`. But it needs to import from `src/` domains (workflow schemas, state machine, agent definitions). This creates a cross-boundary import. The existing `packages/luca-framework/` has a similar pattern. Risk: import resolution issues between packages and src/. Mitigation: use workspace aliasing (already established in the monorepo).

3. **Dependency footprint.** Studio adds `elkjs` (~500KB WASM) as a production dependency. This is acceptable for a dev-only tool but should not leak into the main `luca-framework` package. Mitigation: keep elkjs as a dependency of `packages/luca-studio/` only, not hoisted.

4. **XState machine config extraction.** The research warns about XState v5's `setup()` making static analysis harder. Luca's machine uses XState v5. Risk: graph extraction from machine.ts may produce incomplete state/transition data. Mitigation: test extraction against the actual machine definition early in development.

### Pseudo-Plan Notes

- Phase D depends on both Phase B (adapters) and Phase C (eval framework).
- Start with the Bun.serve() skeleton and SSE live reload -- this is the infrastructure all views depend on.
- DAG View is the MVP (most immediate value). Agent Browser second. State Inspector third. Evals View fourth.
- File watcher with targeted recompilation is the riskiest component -- defer to last sub-phase and validate feasibility first.
- Use port 4040 as default with `--port` flag for override.

---

## Phase E: Additional Adapters

### Related Existing Todos

| Todo | Title | Relationship                                                                                                                                    |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| None | --    | Phase E has no direct relationship to existing backlog items. It is purely additive -- new compilation targets for existing entity definitions. |

### Affected Domains (T0-T3)

| Tier       | Domain          | Impact                                                                                                                                                                                                                                          |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 (or T3) | `src/adapters/` | New subdirectories: `cursor/`, `windsurf/`, `vscode/`. Each implements the `Adapter` interface for their target platform.                                                                                                                       |
| T2         | `src/rules/`    | Rule schemas may need platform-specific metadata (e.g., Windsurf's `trigger` field vs. Claude's `alwaysApply`). The rule schema should be extended with an optional platform-hints section, or each adapter handles the translation internally. |

### Rules That Need Updating

| Rule              | Required Change                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor-rules.md` | This rule documents _Luca's_ cursor rule format (for managing .claude/rules/). If a Cursor adapter is built, a separate rule for generating .cursor/rules/ output would be needed. Rename or disambiguate. |

### Integration Risks

1. **Format divergence.** While the research shows convergence across IDE formats (all use markdown + YAML frontmatter), edge cases differ: Windsurf's character limits (6K per rule, 12K total), Cursor's `.mdc` extension, VS Code's different tool names. Risk: subtle format bugs in non-Claude adapters. Mitigation: per-adapter integration tests that validate output against target platform's parser.

2. **Maintenance burden.** Each adapter is a surface that must be maintained as target platforms evolve. Risk: adapters become stale as Cursor/Windsurf/VS Code release new features. Mitigation: community-contributed adapters (Phase E is the most natural point for external contributors). Keep adapter interface stable so adapters can evolve independently.

### Pseudo-Plan Notes

- Phase E depends only on Phase B (adapter architecture).
- Cursor adapter is highest priority (most similar to Claude, deliberate protocol compatibility).
- VS Code adapter is second (reads `.claude/` natively, so partial support is free).
- Windsurf adapter is lowest priority (strategic uncertainty from Cognition acquisition, character limits are restrictive).
- Each adapter is ~1 week of effort per the roadmap estimate. This seems reasonable given the format similarity documented in the research.

---

## Cross-Cutting Concerns

### Build Process Impact

The `bun run build:all` command is the central build pipeline. It currently:

1. Compiles agents (TS -> markdown in `.claude/agents/`)
2. Compiles skills (TS -> SKILL.md in `.claude/skills/`)
3. Compiles rules (TS -> markdown in `.claude/rules/`)
4. Generates hooks (TS -> shell scripts in `.claude/hooks/`)
5. Generates plugin artifacts

**Impact of runtime architecture:**

- **Phase A:** No impact on build:all. DAG engine is a runtime concern.
- **Phase B:** build:all calls the adapter registry instead of direct compiler functions. Output should be identical for the Claude adapter (backward compat). New adapters produce additional output directories (`.cursor/`, `.github/`). build:all becomes `build:all --adapter=claude` (default) or `build:all --adapter=all` (multi-target).
- **Phase C:** No impact on build:all. Eval is a separate command (`luca eval`).
- **Phase D:** Studio is a separate command (`luca studio`). No impact on build:all, but Studio may offer a replacement for build:all via targeted recompilation.
- **Phase E:** build:all gains new output targets. Each registered adapter that supports compilation emits its artifacts.

**Key constraint:** build:all must remain fast and not crash Claude Code. The MEMORY.md warning about build:all crashing Claude Code means any adapter that is slow or resource-intensive should be opt-in, not default.

### Domain Architecture Changes

**New domains to add:**

| Domain                  | Tier                | Archetype             | Phase |
| ----------------------- | ------------------- | --------------------- | ----- |
| `src/workflow/`         | T1 Core             | B (Core)              | A     |
| `src/adapters/`         | T1 Core or T3 Build | B (Core) or C (Infra) | B     |
| `src/eval/`             | T1 Core             | B (Core)              | C     |
| `packages/luca-studio/` | Separate package    | --                    | D     |

**Tier classification decision needed for `src/adapters/`:**

The architectural vision classifies adapters as T1 Core ("consumed by T2 entities and T3 build"). But the adapter architecture research notes that adapters are _consumers_ of entity definitions (agents, skills, rules) -- they import _from_ T2, not the other way around. This makes them more like T3 Build (terminal, imported by nothing).

**Recommendation:** Classify `src/adapters/` as **T3 Build** alongside `src/compilers/` and `src/hooks/`. Rationale:

- Adapters are terminal -- nothing in src/ imports from adapters.
- Adapters consume entity definitions (T2) and core utilities (T0-T1).
- This matches the existing `src/compilers/` classification.
- The `src/compilers/` domain can be gradually absorbed into `src/adapters/claude/`.

If adapters also provide runtime execution (API adapter's `executeStep()`), the execution interface should be defined in `src/workflow/` (T1) with adapters implementing it at T3. This follows the dependency inversion principle: the interface lives at the lower tier, the implementation at the higher tier.

### Module Boundary Updates

**New import allowances:**

| Source                  | Target                                                    | Direction                | Justification                                                                                                                                |
| ----------------------- | --------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workflow/` (T1)    | `src/shared/` (T0), `src/complexity/` (T0)                | Downward (OK)            | Standard T1 -> T0                                                                                                                            |
| `src/workflow/` (T1)    | `src/iteration/` (T1), `src/context/` (T1)                | Same-tier (OK)           | T1 -> T1 allowed                                                                                                                             |
| `src/adapters/` (T3)    | `src/agents/` (T2), `src/skills/` (T2), `src/rules/` (T2) | Downward (OK if T3)      | T3 -> T2 is allowed                                                                                                                          |
| `src/adapters/` (T3)    | `src/workflow/` (T1)                                      | Downward (OK if T3)      | T3 -> T1 for step execution                                                                                                                  |
| `src/eval/` (T1)        | `src/workflow/` (T1)                                      | Same-tier (OK)           | Eval runs DAG steps                                                                                                                          |
| `src/eval/` (T1)        | `src/adapters/` (T3)                                      | Upward (VIOLATION if T3) | Eval needs API adapter to execute. Resolution: eval imports the adapter _interface_ from workflow (T1), not the adapter implementation (T3). |
| `packages/luca-studio/` | `src/*`                                                   | Cross-package            | Not governed by tier rules. Uses workspace imports.                                                                                          |

**Critical boundary issue: eval -> adapters.**

If `src/eval/` (T1) needs to call `adapter.executeStep()`, and the adapter implementation lives in `src/adapters/` (T3), this is an upward dependency. Resolution:

- Define the `Adapter` interface in `src/workflow/__schemas/` (T1).
- Eval imports the interface from workflow (T1 -> T1, allowed).
- Adapter implementations in `src/adapters/` (T3) implement the interface.
- At runtime, the adapter instance is injected into the eval runner (dependency injection, no import needed).

### Complexity Routing Integration

The DAG engine interacts with complexity routing at two levels:

1. **Step-level routing.** Each DAG step has a `handler` field mapping to a registered agent. The DAG executor calls `resolveModelForAgent(handler, complexity)` to determine the model tier. This is a read-only consumption of complexity routing -- no change to the routing system.

2. **Workflow-level routing.** The entire workflow's behavior changes based on complexity: loop budgets, verification depth, model tiers. The DAG engine should consume these from the complexity matrix. The `loopBudgets` in `complexity-gating.md` (harness fix iterations, verify fix iterations, plan verification iterations) map to DAG step retry configurations.

3. **v2 integration.** v2's complexity matrix extensions (researchReviewIterations, planReviewIterations) from `v2-config-and-schema-updates` would become DAG step retry parameters. The complexity matrix is the configuration source; the DAG step definition consumes it.

**No changes needed to the complexity routing system itself.** The DAG engine is a consumer, not a modifier.

---

## Recommended Sequencing

### What to Do Before Starting Phase A

1. **Finish v5.4.0 branding milestone.** The current branch (`feat/v5.4.0-branding-personalization`) has uncommitted work. Complete the remaining verification items (Phase 3 of the branding roadmap) and merge to main before starting architectural work.

2. **Decide on adapter tier classification.** The T1 vs. T3 decision for `src/adapters/` affects module boundary rules and must be resolved before any domain is created. Recommendation: T3 Build.

3. **Decide on v2 sequencing.** The v2 workflow todos (phases 1-6) overlap significantly with the runtime architecture. Two options:
   - **Option A: v2 first, then runtime architecture.** Land v2 enhancements on top of the prose orchestrator. Then replace the prose orchestrator with the DAG engine. Pro: v2 delivers value immediately. Con: v2 work is partially throwaway (orchestration logic rewired into DAG).
   - **Option B: Phase A first, then v2 on DAG.** Build the DAG engine, then implement v2's pipeline as a DAG definition. Pro: v2 work is built on the final architecture. Con: delays v2 delivery by 2-3 weeks (Phase A duration).
   - **Option C (recommended): Interleave.** Start Phase A (DAG schemas + builder + validator). In parallel, start v2-phase-1 (researcher agents -- these are agent-level, not orchestration-level). Once the DAG engine has a functional executor, wire v2's orchestration into the DAG instead of into prose. This maximizes parallelism and minimizes throwaway work.

4. **Document the coexistence strategy.** During transition, both prose orchestrator and DAG engine will exist. Document which source of truth is authoritative and how conflicts are resolved.

### Dependencies That Must Be Resolved

| Dependency                                                      | Blocking                              | Resolution                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter tier classification (T1 vs T3)                          | Phase B domain creation               | Decide before Phase B starts. Recommendation: T3.                                                                                                                   |
| Adapter interface location (`src/workflow/` vs `src/adapters/`) | Phase B + C module boundaries         | Define interface in `src/workflow/__schemas/`, implementations in `src/adapters/`.                                                                                  |
| v2 sequencing (before/after/interleaved with Phase A)           | v2 todos + Phase A                    | Recommendation: interleave (Option C above).                                                                                                                        |
| Test reintroduction strategy (#37) vs eval framework (Phase C)  | No hard block, but conceptual overlap | Clarify: #37 is mechanical test infrastructure (bun test). Phase C is agent quality evaluation (luca eval). Both are needed. They are complementary, not competing. |
| `build:all` backward compatibility verification                 | Phase B Claude adapter                | Build a diff-test harness that compares old compiler output vs new adapter output before migrating.                                                                 |

### Quick Wins That Could Be Done Immediately

1. **Create `src/workflow/__schemas/workflow.schemas.ts`.** The Zod schemas for `WorkflowStepSchema`, `WorkflowDAGSchema`, and step contracts can be written today with zero impact on existing code. They are pure type definitions.

2. **Create `src/workflow/__schemas/contracts.schemas.ts`.** The per-step input/output schemas (ClassifyOutput, DiscussOutput, PlanOutput, etc.) formalize contracts that are currently implicit. Writing these is valuable documentation even before the DAG engine exists.

3. **Prototype `dag-builder.ts`.** The fluent builder API can be implemented and tested in isolation. Building `phasePipeline` from the design doc validates the API design without touching any existing code.

4. **Prototype `dag-visualizer.ts`.** Mermaid generation from a DAG definition is ~40 lines of string templating. Can be used immediately in documentation.

5. **Update `domain-architecture.md` and `module-boundary.md`.** Add the planned domains (workflow, adapters, eval) with "Planned" status. This socializesthe architectural direction before any code ships.

6. **Extend `v2-config-and-schema-updates` to include DAG config.** Add `workflow.engine: "prose" | "dag"` to the config schema alongside `workflow.version: "v1" | "v2"`. This prepares the config surface for the DAG engine without activating it.
