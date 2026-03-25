# Pre-Mortem Risk Analysis: Runtime Architecture Evolution

**Date:** 2026-03-23
**Analyst:** Pre-mortem risk analyst (lu-premortem)
**Scope:** Phases A-E of the runtime architecture roadmap
**Documents reviewed:** 9 design/research docs, 3 architecture rules, project memory (MuninnDB + MEMORY.md)

## Executive Summary

This initiative proposes replacing Luca's core orchestration mechanism -- a 1,596-line prose skill that has been the stable center of the framework since v3.0 -- with a typed DAG engine, adapter system, evaluation framework, and visual studio, across 8-12 weeks. The initiative is well-researched and architecturally sound in isolation, but it carries **high cumulative risk** due to the number of foundational systems being changed simultaneously, the project's documented history of build pipeline fragility, and the absence of a test suite to catch regressions. The single most dangerous moment is the transition from the prose orchestrator to DAG-compiled prose (Phase B), where behavioral equivalence is unverifiable without tests. The most likely failure mode is not catastrophic breakage but **chronic scope expansion** -- each phase revealing integration work not accounted for in the estimates.

---

## Risk Register

### Risk 1: Prose Behavioral Equivalence is Unverifiable

- **Category:** Migration
- **Likelihood:** HIGH
- **Impact:** HIGH
- **Description:** The DAG engine's Claude adapter must compile step definitions into prose that produces identical behavior to the current hand-written `lu.skill.ts`. But "identical behavior" for LLM-interpreted prose is not a well-defined property. Small wording changes in the generated skill markdown can cause Claude Code to interpret steps differently -- skipping gates, reordering operations, or changing flag handling. There is no automated way to verify that compiled prose produces the same agent behavior as the original prose.
- **Evidence:** The current `lu.skill.ts` is 1,596 lines of carefully tuned natural language (verified: `wc -l src/skills/luca/lu.skill.ts`). It contains 13 ordered sections with nuanced conditional logic expressed in English (gate enforcement, oversight levels, flag plumbing). The design doc acknowledges this: "LLM interpretation variance -- the same prose may be interpreted differently across sessions" (`dag-workflow-engine.md`, Problem Statement). The research doc's open question #4 asks about migration path but the answer ("coexist") assumes behavioral equivalence can be validated, without specifying how.
- **Mitigation:** Before replacing `lu.skill.ts`, run a manual A/B comparison: execute the same 5-10 representative tasks through both the hand-written prose and the DAG-compiled prose, on the same codebase. Document divergences. Accept that 100% equivalence is impossible and define an explicit "acceptable divergence" threshold. Keep the hand-written prose as a fallback for at least 2 weeks after the switch.
- **Detection:** Users report that `/lu` behaves differently after the migration -- phases are skipped, gates are not enforced, flag handling changes. Monitor MuninnDB for new `pitfall:*` entries related to workflow behavior changes in the weeks following the switch.

---

### Risk 2: The ~790-Line Estimate is a Substantial Undercount

- **Category:** Scope
- **Likelihood:** HIGH
- **Impact:** MEDIUM
- **Description:** The DAG engine research estimates ~790 lines total across 7 components (schemas 120, builder 150, validator 100, sorter 80, executor 200, checkpoint 80, visualizer 60). This estimate covers the happy path but substantially underestimates edge cases, error handling, retry logic, timeout management, guard condition evaluation, and the complexity of wiring the DAG executor to the existing state machine (`packages/luca-framework/src/state/machine.ts`, 615 lines) and iteration system (`src/iteration/`). The executor alone -- which must handle parallel wave execution, per-step retry with backoff, abort controller management, checkpoint persistence, and adapter dispatch -- is estimated at 200 lines. Production-quality async orchestration with error propagation at that scope typically runs 400-600 lines.
- **Evidence:** `dag-engines.md` Section 6 estimates ~790 lines. The existing state machine bridge (`packages/luca-framework/src/state/bridge.ts`) is 1,494 lines for what is essentially a CLI wrapper around state reads/writes. The lu.skill.ts being replaced is 1,596 lines. The iteration system it must integrate with spans multiple files across `src/iteration/`. The ~790 line estimate does not include: integration code to wire to the state machine, migration/compatibility shims for the bridge CLI, the Claude adapter's `executeStep()` implementation (which must generate the prose that currently lives in lu.skill.ts), or the step contract schemas for all 7+ workflow phases.
- **Mitigation:** Budget Phase A at 3 weeks minimum, not 2. Separate the "core engine" (sorter, validator, builder -- ~400 lines, low risk) from the "integration layer" (executor wired to state machine, checkpoint wired to bridge, guard conditions wired to oversight system -- estimated 600+ additional lines, high risk). Deliver the core engine first, validate it in isolation, then tackle integration.
- **Detection:** If Phase A is not code-complete by end of week 3, the estimate was wrong. Track actual lines written vs. estimate weekly.

---

### Risk 3: build:all Crash Pattern Repeats During Development

- **Category:** Historical
- **Likelihood:** HIGH
- **Impact:** MEDIUM
- **Description:** MEMORY.md documents a critical, unresolved issue: "Never run `bun run build:all` during a Claude Code session -- it crashes the process." The runtime architecture work will require frequent compilation cycles as new domains (`src/workflow/`, `src/adapters/`, `src/eval/`) are added and their outputs need to be verified. Every time a developer working in Claude Code needs to test compiled output, they must stop the session, run build:all manually, and restart. This friction will compound across 8-12 weeks of development.
- **Evidence:** MEMORY.md explicitly states: "CRITICAL: Never run `bun run build:all` during a Claude Code session -- it crashes the process. Always ask the user to stop the session, run it manually, and restart. This applies to all agents and skills." The `dev-studio.md` research doc acknowledges this: "The critical constraint is that `bun run build:all` crashes Claude Code." Luca Studio (Phase D) is designed to solve this, but it comes last in the dependency chain -- the problem exists for all of Phases A, B, and C.
- **Mitigation:** Prioritize the "targeted recompilation" capability from Studio research (`dev-studio.md` Section 5) as a standalone script deliverable in Phase A, not Phase D. Create a `bun run build:domain -- workflow` command that compiles only the changed domain. This is a ~50-line script that could save hundreds of session restarts over the project.
- **Detection:** Developer frustration with the edit-build-restart cycle. Count of Claude Code session crashes per week during the initiative.

---

### Risk 4: Two Orchestration Systems Running Simultaneously Creates Debugging Nightmares

- **Category:** Architecture
- **Likelihood:** MEDIUM
- **Impact:** HIGH
- **Description:** The migration plan calls for the DAG engine and prose orchestrator to coexist during transition. During this period, there are two systems that both interact with the state machine, both read/write `.planning/STATE.md`, both manage phase transitions, and both handle checkpoint/resume. When something goes wrong (and it will), developers must determine which system is active, which one produced the error, and whether the state is consistent between them. The existing state machine (`machine.ts`, 615 lines) already has a complex event system with guards and actions. Adding a second orchestration layer that also manages state transitions creates a race condition surface.
- **Evidence:** The state machine bridge (`bridge.ts`, 1,494 lines) implements a "dual-write guarantee" where every write goes to both the typed state machine and STATE.md (`state-machine-bridge.md` rule). The DAG executor will need to participate in this dual-write pattern. The phase actor (`phase-actor.ts`, 262 lines) manages per-phase state. If the DAG executor and the prose orchestrator disagree about phase boundaries, state corruption is possible. The design doc's "Relationship to Existing Systems" table (`dag-workflow-engine.md`) shows the DAG executor touching the state machine, iteration system, complexity routing, harness, and compiler pipeline -- 5 major integration points.
- **Mitigation:** Make the coexistence period as short as possible. Use a feature flag (`config.json` gate: `"dag_engine": true/false`) that switches between the prose orchestrator and the DAG engine at session start, not per-phase. Never run both in the same session. When the DAG engine is active, the prose orchestrator is completely bypassed, not running alongside.
- **Detection:** STATE.md and state.json diverge. Phase transitions fire twice. `luca-bridge read-status` returns unexpected state. Session ledger shows duplicate events.

---

### Risk 5: Test Suite Absence Makes Regression Detection Impossible

- **Category:** Historical / Migration
- **Likelihood:** HIGH
- **Impact:** HIGH
- **Description:** Tests were intentionally removed from the project due to process orphaning issues (MEMORY.md: "All `__tests__/` files were deleted from the working tree"). The `.claude/rules/no-tests.md` rule explicitly prohibits creating test files. This means the largest architectural refactoring in the project's history will proceed with zero automated regression detection. The harness checks that remain (typecheck, build drift) verify structural correctness but not behavioral correctness. The DAG engine could compile cleanly, type-check perfectly, and still produce workflows that behave differently from the current system.
- **Evidence:** MEMORY.md: "Agents spawning `bun test` via pre-commit gate orphaned hundreds of processes, freezing the machine." `no-tests.md` rule: "DO NOT create test files." The harness config in `config.json` shows `bun test` is enabled but there are no test files to run. The eval framework (Phase C) is designed to fill this gap, but it depends on the API adapter (Phase B), which depends on the DAG engine (Phase A). The safety net arrives after the riskiest changes are already shipped.
- **Mitigation:** Reintroduce a minimal, targeted test suite for the DAG engine only -- not the full project test suite. Use `bun test` with a single test file that validates: (1) topological sort produces correct wave ordering, (2) cycle detection catches cycles, (3) schema compatibility checking works, (4) checkpoint serialization round-trips correctly. These are pure-function tests with no process orphaning risk because they don't spawn sub-agents. Keep the `no-tests.md` rule for the rest of the codebase; add an exception for `src/workflow/__tests__/`.
- **Detection:** Regressions that would have been caught by tests manifest as runtime failures during development. If the team spends more than 20% of their time debugging issues that a test would have caught, this risk has materialized.

---

### Risk 6: The Claude Agent SDK is v0.2.x -- Pre-1.0 API Instability

- **Category:** Dependency
- **Likelihood:** MEDIUM
- **Impact:** HIGH
- **Description:** The API adapter (Phase B) is built on `@anthropic-ai/claude-agent-sdk`, currently at v0.2.71. This is a pre-1.0 library with no stability guarantees. The adapter-architectures research doc recommends: "Don't wrap the SDK in an abstraction layer -- call `query()` directly from `executeStep()`." This advice optimizes for simplicity but maximizes exposure to breaking changes. If Anthropic ships a v0.3.0 with a different `query()` API, Luca's API adapter breaks.
- **Evidence:** `adapter-architectures.md` Section 5 documents the SDK at v0.2.71. The recommendation is to call `query()` directly. The SDK's npm page shows it is actively evolving. The Adapter Architecture design doc (`adapter-architecture.md`) lists the tool bridge as a key deliverable, which depends on the SDK's tool execution model. If the SDK changes how tools are registered or invoked, the bridge must be rewritten.
- **Mitigation:** Contradict the research recommendation: DO wrap the SDK in a thin adapter-internal abstraction. Create `api-sdk-client.ts` (~50 lines) that exports `executeWithSDK(prompt, tools, options)` and encapsulates the `query()` call. When the SDK changes, only this file needs updating. Pin the SDK to an exact version in `package.json` (not a range) and test upgrades explicitly.
- **Detection:** `bun install` produces deprecation warnings from the SDK. SDK changelog shows breaking changes. API adapter tests (when they exist) fail after `bun update`.

---

### Risk 7: Elk.js WASM Compatibility with Bun is Untested

- **Category:** Dependency
- **Likelihood:** MEDIUM
- **Impact:** LOW
- **Description:** Luca Studio (Phase D) recommends Elk.js for DAG layout computation. Elk.js bundles a GWT-compiled Java layout engine as WASM (~500KB). Bun's WASM support, while improving, has historically had edge cases with larger WASM modules. The `dev-studio.md` research doc verifies Elk.js against GitHub/npm but does not mention testing it specifically in a Bun.serve() context.
- **Evidence:** `dev-studio.md` Section 2 recommends Elk.js, noting the ~500KB WASM bundle. Bun's WASM support is documented but not specifically tested with Elk.js. The project rule is Bun-first (`bun-preference.md`), meaning Node.js fallback is not an option. If Elk.js's WASM module fails to load in Bun, Studio's DAG visualization is blocked.
- **Mitigation:** Before committing to Elk.js in Phase D, run a 30-minute spike: `bun add elkjs && bun -e "const ELK = require('elkjs'); const elk = new ELK(); elk.layout({id:'root',children:[{id:'a',width:100,height:50}],edges:[]}).then(r => console.log(JSON.stringify(r)))"`. If this fails, fall back to dagre (pure JS, no WASM) or Mermaid text rendering with the `mermaid-cli` package.
- **Detection:** Studio's DAG view shows a blank page or errors in the browser console related to WASM instantiation.

---

### Risk 8: Second-System Effect on the Adapter Architecture

- **Category:** Second-System
- **Likelihood:** MEDIUM
- **Impact:** MEDIUM
- **Description:** The adapter architecture design describes 5 adapters (Claude, API, Cursor, Windsurf, VS Code) with a full `Adapter` interface including `compileAgent`, `compileSkill`, `compileRule`, `executeStep`, `emit`, and `detect`. But the immediate need is exactly 2 adapters: Claude (refactoring existing code) and API (new capability). The Cursor, Windsurf, and VS Code adapters are speculative -- they target platforms where Luca has zero current users. Designing the adapter interface to accommodate 5 platforms risks over-engineering for platforms that may never be built, while under-serving the two platforms that matter now.
- **Evidence:** The adapter-architecture design doc shows a full `src/adapters/` directory structure with 5 subdirectories. The IDE ecosystems research rates Windsurf at 5/10 extensibility with "Cognition acquisition creates strategic uncertainty." VS Code agent plugins are "Preview" status. Cursor skills are "nightly only." The research correctly identifies these as Tier 2/3 priorities, but the interface design accommodates them at Tier 1 cost. The `Adapter` interface has 6 methods; the Claude adapter needs 4, the API adapter needs 2 (`executeStep` and `compileAgent`).
- **Mitigation:** Design the adapter interface for the 2 concrete adapters only. Make `compileSkill`, `compileRule`, and `detect` optional (they already are in the research doc's recommendation). Do not create directory stubs for cursor/, windsurf/, vscode/ -- build them when there is user demand. The adapter registry pattern is the right abstraction; just don't over-specify the interface contract for hypothetical consumers.
- **Detection:** More than 30% of development time in Phase B is spent on interface design discussions or generalization rather than making the two real adapters work.

---

### Risk 9: The DAG Engine Creates a Paradigm Conflict with the Existing Compiler

- **Category:** Architecture
- **Likelihood:** MEDIUM
- **Impact:** MEDIUM
- **Description:** The existing compiler pipeline (`src/compilers/`, T3 Build tier) is a terminal domain -- it is imported by nothing in `src/`. The new workflow domain (`src/workflow/`, T1 Core) and adapters domain (`src/adapters/`, T1 Core) sit at a higher tier. But the Claude adapter needs to call compiler functions (`compileAgentClaude`, `compileSkillClaude`) to produce `.claude/` artifacts. This means a T1 domain (adapters) imports from a T3 domain (compilers) -- a tier violation under the current `module-boundary.md` rule. The design doc says "the existing compiler domain becomes a thin wrapper around the Claude adapter," but the direction is backwards: the adapter needs the compiler's logic, not the other way around.
- **Evidence:** `module-boundary.md` rule: "A file in tier N may import from tiers 0 through N-1 only. Never import upward." Compilers are T3 Build; adapters would be T1 Core. `domain-architecture.md` confirms: "T3 Build: compilers, hooks -- Terminal; imported by nothing in src/." The adapter-architecture design doc says `src/compilers/` "becomes thin orchestration over adapters. Eventually may be absorbed entirely." This absorption is the correct resolution, but it means Phase B includes a compiler refactoring that is not in the scope estimate.
- **Mitigation:** The compiler refactoring must happen at the START of Phase B, not as an afterthought. Move the core compilation functions (the actual markdown generation logic in `compile.ts`, 258 lines) into `src/adapters/claude/`. Leave `src/compilers/` as a thin T3 wrapper that calls into the adapter registry. This preserves the tier hierarchy. Budget 2-3 days for this refactoring within Phase B.
- **Detection:** `bun run scripts/check-domain-boundaries.ts` reports tier violations after the adapter domain is added.

---

### Risk 10: Opportunity Cost -- Runtime Architecture vs. Completing the Branding/Personalization Work

- **Category:** Opportunity Cost
- **Likelihood:** HIGH
- **Impact:** MEDIUM
- **Description:** The current branch is `feat/v5.4.0-branding-personalization` with recent commits for vault-init wiring and version bumps. The git status shows 7 modified files including skill templates and the deploy script. Starting an 8-12 week runtime architecture initiative means this in-progress work is either rushed to completion or abandoned. More broadly, 8-12 weeks is a quarter of development time. During this period, Luca cannot ship user-facing features, respond to Claude Code platform changes, or address the backlog.
- **Evidence:** Git status shows active work on branding/personalization: modified files in `packages/luca-framework/templates/harness/claude/skills/`, `.claude/skills/lu/SKILL.md`, and `scripts/deploy-global.ts`. STATE.md shows "Status: Idle" suggesting the v5.4.0 work is between phases. The roadmap lists Phase E (additional adapters) as "ongoing" with no defined end, meaning the initiative could extend beyond 12 weeks. Meanwhile, the IDE ecosystem research shows Claude Code and Cursor are "rapidly evolving" -- the platform may change under Luca during the 8-12 weeks.
- **Mitigation:** Complete v5.4.0 branding/personalization before starting the runtime architecture work. Timebox the entire initiative to 10 weeks with a hard stop. If Phase D (Studio) is not started by week 8, descope it to a future milestone. Define "minimum viable runtime architecture" as Phase A + Phase B Claude adapter only -- this delivers the core DAG engine and maintains backward compatibility in ~5 weeks.
- **Detection:** At week 6, if only Phase A is complete, the timeline is slipping and scope should be cut.

---

### Risk 11: Step Contract Schemas Will Be Wrong on First Try

- **Category:** Domain
- **Likelihood:** HIGH
- **Impact:** LOW
- **Description:** The step contracts (`contracts.schemas.ts`) define typed input/output schemas for each workflow phase: ClassifyOutput, DiscussOutput, PlanOutput, ExecuteOutput, VerifyOutput. These schemas must accurately capture the data that actually flows between phases today. But the current system passes data through STATE.md (a markdown file), environment variables, file paths, and implicit conventions -- not typed interfaces. Reverse-engineering the actual data contracts from 1,596 lines of prose will involve multiple iterations of "define schema, test against real workflow, discover missing field, update schema."
- **Evidence:** The DAG design doc (`dag-workflow-engine.md`) shows proposed schemas (e.g., `ClassifyOutputSchema` with `complexity`, `reasoning`, `modelTier`). But the actual `lu.skill.ts` prose describes classify output as including complexity, model tier, oversight level, phase number, session context, and MuninnDB recall results -- significantly more than the 3-field schema in the design. The DiscussOutput schema proposes `contextPath`, `appetite`, and `premortemPath`, but the actual discuss phase also produces a research context, roadmap updates, and issue mirror results. Every schema in the design doc is an approximation.
- **Mitigation:** Accept that schemas will require 2-3 revision cycles. Build the DAG engine with schema validation in "warn" mode first (log mismatches but don't fail), then tighten to "strict" mode once schemas stabilize. Start by tracing one real workflow execution end-to-end and recording what data actually crosses each phase boundary.
- **Detection:** Schema validation failures during the first real DAG-driven workflow execution. Count of schema revisions per phase -- if any schema exceeds 5 revisions, the reverse-engineering approach needs adjustment.

---

### Risk 12: The Eval Framework Has a Chicken-and-Egg Problem with the API Adapter

- **Category:** Scope
- **Likelihood:** MEDIUM
- **Impact:** MEDIUM
- **Description:** The eval framework (Phase C) requires the API adapter (Phase B) to call the Anthropic API directly. But the API adapter requires the DAG engine (Phase A) for step execution. And the eval framework is supposed to validate that the DAG engine produces correct behavior. This creates a circular dependency: you need evals to validate the engine, but you need the engine to run evals. The roadmap acknowledges this ("Phase C can run in parallel with Phase B since it depends on the adapter interface") but developing against a mock adapter means the evals are not validated against real execution until both B and C are complete.
- **Evidence:** `roadmap.md` Phase C: "depends on the adapter interface (defined in Phase B's schemas) but can be developed against a mock adapter." `agent-evaluation.md` Section "Dependencies": "Requires the API adapter from the adapter architecture to call Anthropic directly (not through Claude Code)." This means the eval framework cannot produce trustworthy results until Phase B is production-ready. If Phase B ships with bugs, Phase C's eval results are unreliable.
- **Mitigation:** Build the simplest possible eval path first: a standalone script that sends compiled agent markdown to the Anthropic API as a system prompt and evaluates the response. This bypasses the full adapter/DAG machinery and gives immediate eval capability for the most critical agents (lu-router, lu-verifier). The full eval framework can come later; the immediate need is validation, not infrastructure.
- **Detection:** At the end of Phase C, if the eval suite has been run only against mocks and never against real API calls, it provides false confidence.

---

### Risk 13: XState State Machine Integration is Deeper Than It Appears

- **Category:** Architecture
- **Likelihood:** MEDIUM
- **Impact:** MEDIUM
- **Description:** The DAG engine design says it "uses the state machine for persistence" and "the state machine tracks which step the DAG is on." But the existing state machine (`machine.ts`, 615 lines) is an XState v5 machine with its own event system, guards, actions, and a phase actor (`phase-actor.ts`, 262 lines). It is not a passive persistence layer -- it actively manages workflow transitions, enforces valid state sequences, and fires side effects. The DAG executor needs to either (a) become the state machine's new orchestrator, sending events that the machine processes, or (b) bypass the state machine and manage its own state. Option (a) requires deep XState integration; option (b) creates two sources of truth.
- **Evidence:** `machine.ts` (615 lines) defines states: idle, preflight, routing, discussing, planning, executing, reviewing, verifying, learning, committing, suspended, failed. It has guards (`canTransition`, `isPhaseComplete`) and actions (`updateContext`, `persistState`). The bridge (`bridge.ts`, 1,494 lines) exposes 13 CLI subcommands that read/write this machine. All existing skills and agents interact with state through the bridge. The DAG executor cannot ignore this -- it must either drive the machine or replace it.
- **Mitigation:** Choose option (a): the DAG executor sends XState events, and the state machine remains the authority on valid transitions. This means the executor does NOT manage its own state -- it reads state from the machine and sends events to advance it. This is more work upfront but prevents the dual-state-machine problem. Map each DAG step completion to an XState event (e.g., step "classify" completes -> send `CLASSIFY_COMPLETE` event to machine).
- **Detection:** If the DAG executor starts maintaining its own `currentStep`/`completedSteps` state independent of the XState machine, the integration approach has drifted into option (b) and needs correction.

---

### Risk 14: The 8-12 Week Timeline Assumes Single-Track Development

- **Category:** Scope
- **Likelihood:** MEDIUM
- **Impact:** LOW
- **Description:** The roadmap shows phases A through E with dependencies. The "can overlap" column suggests B and C can run in parallel, but this assumes a developer (or AI agent) can context-switch between the adapter implementation and the eval framework simultaneously. For a solo developer + AI workflow (documented in `lu-workflow.md`: "You are the visionary/product owner, AI is the builder"), context switching between two deep technical tracks imposes a cognitive overhead that the timeline does not account for.
- **Evidence:** `lu-workflow.md` "Solo Developer + AI Workflow": "No teams, stakeholders, ceremonies, coordination overhead." The Quality Degradation Curve shows that context usage above 50% degrades quality. Running two parallel phases means the AI builder must hold context for both, pushing into the degradation zone faster. The context management config shows `clear_suggestion_threshold: 42` (42% context), confirming the project already aggressively manages context limits.
- **Mitigation:** Run phases strictly sequentially: A, then B, then C, then D. Accept the 12-week timeline rather than trying to compress to 8 weeks through parallelism. The risk of bugs from parallel development in a single-developer workflow outweighs the time saved.
- **Detection:** If attempting parallel phases, watch for increased MuninnDB `pitfall:*` entries, more harness failures, or requests to "start over" on a phase -- all signals of context overload.

---

## Top 5 Risks (Prioritized)

Ranked by likelihood x impact:

| Rank | Risk                                     | Likelihood | Impact | Score |
| ---- | ---------------------------------------- | ---------- | ------ | ----- |
| 1    | **Risk 5: Test Suite Absence**           | HIGH       | HIGH   | 9     |
| 2    | **Risk 1: Prose Behavioral Equivalence** | HIGH       | HIGH   | 9     |
| 3    | **Risk 4: Two Orchestration Systems**    | MEDIUM     | HIGH   | 6     |
| 4    | **Risk 2: ~790-Line Undercount**         | HIGH       | MEDIUM | 6     |
| 5    | **Risk 3: build:all Crash Pattern**      | HIGH       | MEDIUM | 6     |

The top two risks compound each other: the absence of tests (Risk 5) makes it impossible to detect the prose equivalence failures (Risk 1). Together, they mean the highest-risk moment of the initiative -- switching from hand-written to compiled prose -- will proceed blind.

---

## Recommended Risk Mitigations for Grooming

The grooming session should address these specific questions:

1. **Define "done" for behavioral equivalence.** What does it mean for the DAG-compiled prose to "match" the hand-written prose? Is "Claude Code completes the same 5 representative tasks without errors" sufficient? Make this explicit before Phase A starts.

2. **Reintroduce targeted tests for the DAG engine.** The `no-tests.md` rule exists because full-suite `bun test` orphaned processes. Pure-function DAG tests (topological sort, cycle detection, schema validation) have no process orphaning risk. Grant an exception for `src/workflow/__tests__/`.

3. **Build the targeted recompilation script in Phase A.** The `bun run build:domain` command (estimated 50 lines) eliminates the build:all crash problem for the entire initiative. It costs 1 day and saves weeks of friction.

4. **Decide the XState integration approach now.** Option (a) (DAG executor drives XState events) or option (b) (DAG executor manages its own state)? This decision affects every line of executor code. Do not defer it to implementation.

5. **Timebox aggressively.** Define a "minimum viable" scope: Phase A (DAG engine core) + Phase B (Claude adapter only, no API adapter) = ~5 weeks. This delivers the typed workflow definition, build-time validation, and Mermaid visualization without the riskiest parts (API adapter, eval framework, Studio). The API adapter and eval framework can follow in a separate milestone.

6. **Complete v5.4.0 first.** The branding/personalization branch has uncommitted work. Shipping it creates a clean baseline and avoids the cognitive overhead of maintaining two active feature branches during the architecture work.

---

## Kill Criteria

Stop the initiative and pivot if any of the following conditions are met:

1. **Phase A exceeds 5 weeks.** The DAG engine is the foundation. If it takes more than 5 weeks (vs. the estimated 2-3), the remaining phases are infeasible within the same milestone. Descope to DAG schemas + validator only (no executor) and ship as a documentation/validation tool.

2. **The Claude adapter produces prose that fails on 3+ representative tasks.** If compiled prose cannot replicate the current workflow for basic scenarios, the compilation approach is flawed. Pivot to using the DAG engine for validation and visualization only, keeping the hand-written prose as the execution path.

3. **Anthropic ships a Claude Code update that breaks the hook/skill/agent format.** The IDE ecosystem research shows all platforms are "rapidly evolving." If Claude Code's format changes during the initiative, the adapter work must be rearchitected. At that point, pause and reassess whether the adapter abstraction is premature.

4. **The build:all crash is not resolved by week 2.** If the targeted recompilation script is not working and developers are still manually restarting Claude Code sessions, development velocity will be too low to complete the initiative. Pause and fix the build pipeline first.

5. **Developer motivation drops.** This is a solo developer + AI project. 8-12 weeks of infrastructure work with no visible user-facing progress is a motivation risk. If the developer loses interest (signaled by multi-day gaps in commits), it is better to ship a partial result (Phase A only) than to abandon a half-complete architecture migration.
