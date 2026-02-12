# Long-Term Memory

> Persistent learnings across sessions. Selectively recalled based on task context.

## Patterns

### Validated Approaches

<!-- Patterns that worked well — recall when similar tasks arise -->

- **Codebase mapping with parallel agents**: Spawn 4 lu-codebase-mapper agents in parallel (tech, arch, quality, concerns) — produces comprehensive analysis in ~1 minute
  Tags: [patterns, architecture]
- **Questioning before planning**: Deep questioning surfaces hidden requirements and constraints before committing to implementation
  Tags: [patterns, planning]
- **Wave-based parallelization**: Execute independent plans in parallel waves to reduce total execution time. Wave 2 (01-02 + 01-03) executed concurrently without conflicts, validated in Phase 1
  Tags: [patterns, planning, performance]
- **Dual-package CLI pattern**: Thin `create-*` scaffolder package delegates to main `*-framework` package. Enables separate versioning and smaller initial download. Pattern: `create-luca` → `luca-framework`
  Tags: [patterns, architecture]
- **Branding context pattern**: `createBrandingContext()` adds computed helpers like `commandSlash: "/${prefix}"` for template convenience. Centralizes branding logic with computed properties
  Tags: [patterns, conventions]
- **Manifest-based tracking**: SHA-256 hashes enable update conflict detection. `source: 'framework' | 'user'` distinguishes file origins for safe merging
  Tags: [patterns, architecture]
- **Template architecture separation**: Three-tier structure: `base/` (minimal scaffold) + `stacks/` (stack-specific) + `framework/` (full Luca framework). EJS for content substitution (`<%= branding.frameworkName %>`), `__variable__` pattern for filename substitution
  Tags: [patterns, architecture]
- **Discriminated union for adapter results**: Use `{ success: true, data: T } | { success: false, error: string }` for consistent error handling across different work tracker implementations. Validated in Phase 2
  Tags: [patterns, coding]
- **Optional method checking**: Check for optional adapter methods with `if (adapter.method)` before invocation to support heterogeneous feature sets across work trackers. Validated in Phase 2
  Tags: [patterns, coding]
- **Infrastructure-first doctor pattern**: Implement `doctor` command with a registry of independent checks. Enables easy extension and comprehensive system validation. Validated in Phase 3
  Tags: [patterns, architecture]

- **Zod safeParse at API boundaries**: Replace `as TypeName` casts with `zodSchema.safeParse()` for runtime validation of external API responses. Returns discriminated union matching AdapterResult pattern. Validated in Phase 6 (GitHub + Jira adapters)
  Tags: [patterns, coding, security]
- **Self-contained cross-package modules**: When root `src/shared/` utilities need to be used in `packages/*/`, create a self-contained copy in the package rather than cross-package imports. Validated in Phase 6 (sanitize.ts)
  Tags: [patterns, architecture]
- **Defense-in-depth validation**: Apply validation at both config ingestion (checkConfig) AND usage site (inline checks). Prevents regressions from future refactoring that might bypass config validation. Validated in Phase 6 (HTTPS enforcement)
  Tags: [patterns, security]
- **Credential sanitization pattern**: Use regex chain to strip `Basic`, `Bearer`, long Base64 (40+ chars), and `token=` patterns from error messages before returning to callers. Prevents credential leakage in error paths
  Tags: [patterns, security]
- **Surgical performance optimization**: For small CLI tools already meeting performance targets (23ms startup), apply targeted fixes rather than broad refactoring. Prioritize: lazy command loading (biggest gain) > dependency removal (if already small) > memory safety fixes. Avoid complex optimization unless bottleneck confirmed. Validated in Phase 8 (CLI already at 23ms)
  Tags: [patterns, performance]
- **Dynamic dependency loading for optional features**: Lazy-load heavy optional dependencies (e.g., update-notifier 1.0MB) only when needed. Use dynamic `import()` for optional commands/features. Enables smaller default bundle without sacrificing functionality. Validated in Phase 8 (reduced startup path)
  Tags: [patterns, performance]
- **SIGINT handler safety with process.once**: Use `process.once()` instead of `process.on()` to prevent handler accumulation when module re-imported. Reset mutable module state (e.g., `createdPaths`) at function entry. Validated in Phase 8 (fixed handler accumulation)
  Tags: [patterns, coding, debugging]
- **Constant extraction for repeated values**: Extract repeated magic strings/arrays into named constants (e.g., `TEMPLATE_EXTENSIONS`). Enables single-point-of-truth for validation values and reduces duplication. Validated in Phase 8 code review
  Tags: [patterns, conventions, coding]
- **EJS + JSON regex escaping**: When EJS templates output regex patterns into JSON strings, backslashes need double-escaping. Solution: computed `ticketPatternJson` property via `.replace(/\\/g, '\\\\')` to produce valid JSON. Validated in Phase 9 (init wizard fix)
  Tags: [patterns, coding, debugging]
- **Actionable error messages (three-part pattern)**: Every CLI error should include: (1) what failed, (2) why/cause, (3) what to do next. This is a DX multiplier — users never hit a dead end. Validated in Phase 9 (CLI error messages overhaul)
  Tags: [patterns, conventions]
- **Validation parity across config entry points**: If `createConfigFromArgs` validates stack/tracker values, `loadConfigFromFile` must too. All config entry points need identical validation to prevent invalid configs from slipping through file-based paths. Validated in Phase 9 (code review HIGH fix)
  Tags: [patterns, coding, security]
- **Documentation as code debt**: Stale docs (non-existent commands, wrong env vars, outdated coding standards) accumulate silently across milestones. Treat docs accuracy as a DX concern and audit during DX phases. Validated in Phase 9 (7 doc accuracy issues caught)
  Tags: [patterns, conventions]
- **Parallel agent execution without conflicts**: File-disjoint plans enable safe parallelism. 5 agents ran in parallel on non-overlapping file sets with zero merge conflicts. Key: ensure plan scope boundaries don't overlap at the file level. Validated in Phase 9 (5 parallel plans)
  Tags: [patterns, planning, performance]
- **Metadata registry for non-class entities**: When registry entries aren't class constructors (e.g. shell scripts), use metadata objects (`HookDefinition`) with platform-specific fields (`event`/`cursorEvent`, `matcher`/`cursorMatcher`). Config generators transform metadata into platform-specific output formats. Validated in Phase 11 (hookRegistry → settings.json + hooks.json)
  Tags: [patterns, architecture]
- **Dual-format stdin/stdout for cross-platform hooks**: Shell scripts can handle both Claude Code and Cursor stdin JSON by using nullish coalescing fallbacks (`data.tool_input?.file_path ?? data.file_path`). Platform detection via `!!process.env.CLAUDE_PROJECT_DIR` enables dual-format output. Validated in Phase 11 (5 hooks, 2 platforms)
  Tags: [patterns, coding]
- **Plan-checker bug prevention**: Running lu-plan-checker before execution caught 2 critical bugs (`|| true` swallowing exit codes) and 5 medium issues (echo vs printf, shell interpolation, wrong APIs). The checker pays for itself by preventing non-functional hooks from being deployed. Validated in Phase 11
  Tags: [patterns, verification, planning]
- **Layered verification (hooks + harness)**: Hooks provide lightweight, per-edit/commit verification (format, typecheck, pre-commit gate). Harness provides comprehensive verification at phase boundaries with structured output parsing and failure-to-fix loops. Two layers enforce quality at different frequencies: hooks catch problems immediately, harness catches integration issues. Validated in Phase 12 (6/6 requirements, 6/6 UAT tests)
  Tags: [patterns, verification, architecture]
- **Parser registry for diverse toolchains**: Structured output parsing across different tools (tsc, bun-test, eslint, generic) requires separate `OutputParser` implementations. Registry pattern (`Record<string, OutputParser>`) follows hookRegistry/ruleRegistry, enabling extensible parser composition. Each parser handles format-specific quirks (JSON flags, field mappings, multiline output). Validated in Phase 12 (4 parsers, 65 tests)
  Tags: [patterns, architecture, coding]
- **CLI entry point pattern with import.meta.main**: For standalone executables, use `if (import.meta.main) { runCLI(); }` guard instead of CJS `require.main === module`. This is the ESM equivalent and works correctly in Bun. Entry point handler receives process args and manages CLI flow independently from module exports. Validated in Phase 12 (harness runner CLI)
  Tags: [patterns, coding, stack]
- **[Phase 13] N-level to M-tier compression**: Map N granular levels to M behavioral tiers (N > M) to preserve classification precision while reducing implementation complexity. Phase 13: 5 complexity levels mapped to 3 behavioral tiers (lightweight, standard, thorough). Code gates on tier, not level, avoiding 5-way branches in every gated location. Pattern: `const as const` for levels + `Record<Level, Tier>` for mapping
  Tags: [patterns, architecture, complexity]
- **[Phase 13] Always-on vs gated step separation**: Explicitly categorize pipeline steps as always-on (cannot be disabled) vs gated (activate at complexity thresholds). Always-on steps form the safety floor; gated steps provide the scaling dimension. Prevents accidental disabling of critical pipeline infrastructure. Validated in Phase 13 (9 always-on, 8 gated steps)
  Tags: [patterns, architecture, complexity]
- **[Phase 13] Self-gating agents via always-apply rules**: Instead of wiring complexity checks into agent code, create an `alwaysApply: true` rule containing the full gating matrix. Agents read the rule and self-gate. This is "soft enforcement" but avoids hard-coded conditionals scattered across many agents. Backward-compatible: when no complexity is set, behavior defaults to pre-gating
  Tags: [patterns, architecture, complexity]
- **[Phase 13] Wave restructuring from dependency analysis**: Plan checker identified dependency conflicts in original wave structure (Wave 1 had plans with mutual dependency). Restructuring from 2 waves to 3 waves resolved the conflict. Always validate wave assignments against inter-plan dependencies before execution
  Tags: [patterns, planning]
- **[Phase 14] Verification signal taxonomy (T1-T4)**: Classify every verification signal by reliability tier: T1 (Deterministic — tests, tsc, file existence), T2 (Schema/Structural — grep, line count, export checks), T3 (LLM-Judge — code review, verifier reasoning), T4 (Self-Assessment — executor claims). This taxonomy enables systematic identification of verification blind spots and prioritization of improvements toward higher-tier signals
  Tags: [patterns, verification]
- **[Phase 14] Specification anchoring prevents goal drift**: Re-inject PLAN.md objectives at verification checkpoints (Step 2.5) and re-evaluate them after verification (Step 9.5). Without anchoring, the verifier derives must-haves from ROADMAP goal only, which can drift from individual plan objectives. Pattern: compare derived must-haves ↔ plan objectives, flag untraced/uncovered items, enrich must-haves
  Tags: [patterns, verification, planning]
- **[Phase 14] Additive verification steps (insert-between pattern)**: When extending a verification pipeline, insert new steps between existing ones using decimal numbering (2.5, 9.5) rather than renumbering. This preserves backward compatibility — existing documentation, references, and training data remain valid. New steps degrade gracefully when their inputs are absent (e.g., no PLAN.md → skip with note)
  Tags: [patterns, architecture, verification]
- **[Phase 15] 4-tier cognition profiling for agent roster**: Classify agents into T0 (Stateless), T1 (Memory-Reader), T2 (Session-Aware), T3 (Fully-Cognitive) based on their role and output quality impact. Use audit matrix (5 feature columns: BRAIN, MEMORY, WORKING, Pre-flight, Learning) to assess current state, then gap analysis to identify promotions. Applied to 25 agents: 2 T3, 3 T2, 5 T1, 15 T0 in recommended state. Pattern: combine boolean feature matrix with behavioral tier grouping (same N-to-M compression as Phase 13)
  - **When to use**: When evaluating which agents should receive memory context and at what depth
  - **Agent**: lu-cognition
  - **Relevant to**: [lu-cognition, lu-router, all agents]
  - **Tags**: [architecture, complexity, patterns]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 15] Tag-based selective MEMORY recall**: Pre-filter MEMORY.md entries by domain tags before applying keyword scoring. Agent's `memory_tags` define which knowledge domains are relevant. Coarse tags (~14) provide filtering; keyword scoring within filtered set provides specificity. Legacy entries (no tags) always included for backward compatibility. Tier-scaled entry limits: T1 gets 3-5 entries, T2 gets 5-7, T3 gets 7-10
  - **When to use**: When lu-cognition performs selective recall for any agent at T1 or above
  - **Agent**: lu-cognition
  - **Relevant to**: [lu-cognition, lu-learner]
  - **Tags**: [architecture, patterns, performance]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 15] Metadata-driven cognition configuration**: Place per-agent cognition config (default_tier, promotable_to, memory_tags) in agent frontmatter rather than hardcoding behavior in the orchestrator. The compiler emits YAML frontmatter into compiled .md files, making config machine-readable at runtime. lu-cognition reads frontmatter, resolves tier via complexity promotion, and adapts behavior. Avoids N-way conditional branches in orchestrator code
  - **When to use**: When adding per-entity configuration that varies across a roster of similar entities (agents, hooks, rules)
  - **Agent**: lu-cognition
  - **Relevant to**: [lu-cognition, lu-executor, lu-planner, all agents]
  - **Tags**: [architecture, patterns, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 15] Retroactive metadata migration with backward compatibility**: Adding Tags to ~108 existing MEMORY.md entries without breaking recall for any agent. Strategy: entries without Tags field are included in ALL agent recalls (legacy treatment). As lu-learner tags new entries and existing entries are retroactively tagged, precision improves over time. No migration script needed -- coexistence by default, gradual improvement
  - **When to use**: When extending an existing data format with new metadata fields across a large corpus
  - **Agent**: lu-learner
  - **Relevant to**: [lu-learner, lu-cognition]
  - **Tags**: [patterns, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Parallel module + integration wave pattern**: Creating a standalone module (src/context/) in Wave 1, integrating with existing schemas in Wave 2, and wiring all consumers in Wave 3 produces clean dependency chains. Validated in Phase 16 (5 plans across 4 waves)
  - **When to use**: When adding a new cross-cutting module that needs to integrate with multiple existing systems
  - **Agent**: lu-planner
  - **Relevant to**: [lu-planner, lu-executor]
  - **Tags**: [patterns, architecture, planning]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Zod schema-first for dual-track configs**: Using Zod schemas with `z.infer` for both context AND cognition configs (parallel but independent tracks) prevents type drift and enables runtime validation of agent frontmatter. Validated in Phase 16 (contextConfigSchema paralleling cognitionConfigSchema)
  - **When to use**: When creating parallel configuration schemas that share structural patterns but serve different domains
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-cognition, all agents]
  - **Tags**: [patterns, coding, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Result envelope with fallback-to-raw**: Universal `{ status, summary, artifacts[], issues[], metadata }` envelope with safe parsing (JSON.parse + safeParse, fallback to raw text) handles both structured and unstructured sub-agent outputs without breaking orchestrator flow. Validated in Phase 16
  - **When to use**: When aggregating outputs from multiple sub-agents with varying output formats
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-execute-phase]
  - **Tags**: [patterns, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Isolation mode as first-class config**: Declaring isolation (`cold`/`warm`/`none`) in agent frontmatter alongside context tiers makes writer/reviewer separation explicit and compiler-propagated rather than implicit orchestrator knowledge
  - **When to use**: When agents need different levels of context access based on their role (writer vs reviewer)
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-verifier, lu-cognition]
  - **Tags**: [patterns, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Independent promotion tracks**: Context and cognition promoting independently at different complexity thresholds (context at MODERATE, cognition at COMPLEX) gives fine-grained control without coupling the two systems
  - **When to use**: When multiple configuration dimensions need complexity-driven scaling but at different thresholds
  - **Agent**: lu-router
  - **Relevant to**: [lu-router, lu-cognition, lu-executor]
  - **Tags**: [patterns, complexity, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-11

### Pattern: Ralph Wiggum Decision-Support Architecture

**Tags:** [iteration, workflow, architecture]
**Phase:** 17
**Insight:** The lu-execute-phase skill IS the loop controller; src/iteration/ provides CLI-callable decision-support utilities (convergence, classification, checkpoint, budget). This avoids building a standalone TypeScript loop orchestrator that would be hard to debug and modify. The skill text is the "program" and Claude is the "runtime."
**When to apply:** Any time iteration behavior needs to change -- modify the skill text, not TypeScript code. TypeScript handles computation (fingerprinting, Jaccard similarity); the skill handles flow control (when to stop, rollback, or proceed).

### Pattern: Multi-Signal Convergence with 2-of-3 Stale Rule

**Tags:** [iteration, verification]
**Phase:** 17
**Insight:** No single signal reliably detects "stuck" iterations. Error count can stay constant while the set changes (churn). Fingerprint overlap can be high for coincidental reasons. Artifact delta can be zero when only non-code files change. Requiring 2 of 3 signals to agree prevents false positive convergence declarations.
**When to apply:** Any convergence or no-progress detection system. The 2-of-N composite pattern generalizes beyond iteration loops.

### Pattern: Error Fingerprint Normalization

**Tags:** [iteration, harness]
**Phase:** 17
**Insight:** Normalizing numbers in error messages (replacing digits with "N") before fingerprinting catches "same error, different line number" across iterations. The fingerprint combines file:line:code:normalizedMessage to balance specificity (same file+code) with generality (line numbers change as code is edited).
**When to apply:** Any error deduplication or tracking across time. The file:line:code triple is the strongest grouping signal.

### Pattern: Source-of-Truth Build Pipeline

**Tags:** [architecture, conventions, drift]
**Phase:** 17
**Insight:** `src/` is the single source of truth for all compiled output files. The pipeline is: `src/(agents|skills|rules|hooks)/` → `bun run build:all` (via `scripts/build-all.ts`) → `.claude/` + `.cursor/` output directories (182+ files). Registries in `src/*/index.ts` map entity names to TypeScript classes/metadata. The compiler reads registries and emits platform-specific output (markdown for agents/skills/rules, shell scripts for hooks, JSON configs for settings). Additionally, `packages/luca-framework/templates/hooks/` mirrors `src/hooks/scripts/` for the `luca init` scaffolder.
**When to apply:** ANY time you need to modify content in `.claude/` or `.cursor/` directories. NEVER edit output files directly — always modify the corresponding `src/` source file and run `bun run build:all`. The drift detection system (`bun run check:drift`, pre-commit hook, drift test suite in `scripts/check-drift.test.ts`) will block commits that bypass this pipeline.

### Pattern: Skill Source Files Required for Build Pipeline

**Tags:** [architecture, conventions, drift]
**Phase:** 18
**Insight:** Skills MUST have source files in `src/skills/` for the build pipeline (`bun run build:all`) to compile them. If a skill is created directly as a compiled output (e.g., `.claude/skills/name/SKILL.md`) without a corresponding source file, `build:all` will delete it on next run because the pipeline regenerates ALL outputs from source. The build pipeline treats `src/skills/` as the single source of truth.
**When to apply:** Any time a new skill is created. Always create the source `.skill.ts` file first, register it in `src/skills/index.ts`, then run `build:all`.

### Pattern: Big Rock Selection Requires Minimum Effort Threshold

**Tags:** [planner, scheduling]
**Phase:** 18
**Insight:** Big Rock First scheduling must filter by minimum effort (>= 3, i.e., MODERATE or above) in addition to dependency-free status. Without the effort threshold, TRIVIAL (effort=1) or SIMPLE (effort=2) items can be selected as the session's Big Rock, defeating the purpose of anchoring the session around a meaningful piece of work.
**When to apply:** Any scheduling algorithm that uses Big Rock First strategy. The threshold ensures the anchor task is substantive enough to justify the focused session slot.

### Pattern: Token Cost Calibration with Rolling Average

**Tags:** [planner, performance]
**Phase:** 18
**Insight:** Cold-start cost estimates for different complexity levels can be calibrated over time using a rolling average: `(estimated * count + actual) / (count + 1)`. This handles the cold-start problem gracefully — initial estimates from config are used until real data accumulates, then the model self-corrects. The `formatCostTableForMemory()` function produces a table suitable for MEMORY.md storage.
**When to apply:** Any estimation system that starts with configured defaults but should improve with actual usage data.

- **[Phase 19] Plugin compiler via format delegation**: When a new compilation target (plugin) uses the same content format as an existing target (Claude), delegate to existing format methods (`toClaudeFormat()`) rather than creating new entity methods (`toPluginFormat()`). The compiler handles structural differences (directory layout, manifest), not content format differences. Avoids modifying all entity classes for zero content change. Validated in Phase 19 (PluginCompiler delegates to toClaudeFormat for all 3 entity types, parity confirmed via 6 comparison tests)
  - **When to use**: When adding a new compilation target that shares content format with an existing target
  - **Tags**: [patterns, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 19] Exported build function + import.meta.main guard**: Build scripts that may be called both standalone (`bun ./scripts/build-plugin.ts`) and as imported modules (`import { buildPlugin } from './build-plugin'`) should export the main function and use `import.meta.main` guard for standalone entry. The exported function returns a typed result object for downstream consumers. Validated in Phase 19 (build-plugin.ts exports buildPlugin(), build-all.ts imports and calls it)
  - **When to use**: When creating build scripts that need both standalone and library usage
  - **Tags**: [patterns, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 19] Platform-specific path generators from shared registry**: When the same entity registry (hookRegistry) needs different path prefixes per platform (`$CLAUDE_PROJECT_DIR/.claude/hooks/`, `.cursor/hooks/`, `${CLAUDE_PLUGIN_ROOT}/scripts/`), create per-platform config generators from the same registry rather than duplicating the registry. Each generator produces the platform-specific output format. Validated in Phase 19 (generateHooksConfig, generateCursorHooksConfig, generatePluginHooksConfig all consume hookRegistry)
  - **When to use**: When the same registry data needs to produce output for multiple platform targets
  - **Tags**: [patterns, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 20] Command exclusion set over opt-in flags**: When most registry entries qualify for a compilation target but a few don't, maintain a small `ReadonlySet<string>` exclusion set rather than adding opt-in boolean flags to every entry. Simpler to reason about, fewer source files to modify, and the exclusion list documents intent explicitly. Validated in Phase 20 (COMMAND_EXCLUDED_SKILLS: 6 entries from 44 skills, `!COMMAND_EXCLUDED_SKILLS.has(name)` filter)
  - **When to use**: When filtering a registry for a compilation target and the majority of entries qualify
  - **Tags**: [patterns, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 20] Routing skill pattern (Skill tool + Task tool delegation)**: A routing skill that classifies input and delegates to sub-skills (via `Skill(skill: "name", args: "...")`) and sub-agents (via `Task(agent: "name", prompt: "...")`) keeps the router lightweight and each sub-skill self-contained with its own SKILL.md. The router never executes workflow steps itself. Validated in Phase 20 (/lu rewrite: 18 Skill tool invocations, 5 Task tool invocations, 9 routing scenarios)
  - **When to use**: When building a unified entry point that needs to dispatch to multiple specialized workflows
  - **Tags**: [patterns, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 20] Rules-as-skills conversion for plugin distribution**: Plugins can't inject rules into the host IDE. Convert critical framework rules to skills with `disable-model-invocation: true` frontmatter. Prefix with `rule-` for discoverability. The skill body contains the full rule text, making it available via lazy-loaded skill discovery. Validated in Phase 20 (5 rules converted: complexity-gating, file-naming, harness-verification, hook-skill-boundary, lu-workflow)
  - **When to use**: When distributing rules via a plugin system that only supports skills/commands/agents
  - **Tags**: [patterns, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 22] Shared build module for single source of truth across build, drift, and test**: When build logic (constants, generators) is needed by multiple scripts (build, drift detection, tests), extract to a dedicated `build-shared.ts` module that all consumers import from. This guarantees byte-identical output between the build and the drift checker, eliminates code duplication, and makes the module dependency graph a clean DAG (build-shared → build-all, check-drift, check-drift.test). Validated in Phase 22 (8 exports shared across 3 consumers, SHA-256 checksums match across 118 plugin files)
  - **When to use**: When the same build logic is needed by both the builder and verifier
  - **Tags**: [patterns, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 22] Checksum-based before/after verification for build refactoring**: When refactoring build scripts (consolidation, extraction), capture SHA-256 checksums of all output files before and after the refactoring, then diff. Zero differences confirms the refactoring is behavior-preserving. More reliable than manual inspection for large output sets. Validated in Phase 22 (118 files, 0 diffs after build consolidation)
  - **When to use**: When restructuring build scripts without intending to change output
  - **Tags**: [patterns, verification, testing]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 22] Category-based README generation from registries**: Generate README documentation at build time by classifying registry entries into human-curated category maps (static), then counting dynamically from actual registry contents. Unknown entries fall through to "Other" so new additions don't break the build. Produces accurate, auto-updating documentation without hardcoded numbers. Validated in Phase 22 (44 skills across 9 categories, 26 agents across 5 categories, zero "Other" entries)
  - **When to use**: When generating documentation from source registries that change over time
  - **Tags**: [patterns, documentation, architecture]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 23] Spec-conformance layer separate from drift detection**: Two complementary test layers — drift tests verify compiler output matches source (parity), spec tests verify plugin format matches what Claude Code expects (conformance). Neither duplicates the other. Enables catching two distinct failure modes: "output drifted from source" vs "output doesn't match external spec." Drift catches internal regression; spec catches external incompatibility. Validated in Phase 23 (41 spec tests + 720 drift tests, zero overlap)
  - **When to use**: When output files must satisfy both an internal build pipeline AND an external consumer specification
  - **Tags**: [patterns, verification, testing]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 23] Comprehensive E2E summary test as final gate**: A single "load readiness" test that aggregates ALL validation checks (manifest, structure, frontmatter, hooks, marketplace consistency) into one pass/fail with structured issue reporting provides a definitive answer. Individual tests catch specific issues in isolation; the summary test catches integration-level failures across components. The structured issues array enables detailed debugging when the gate fails
  - **When to use**: When multiple component-level tests exist but a single integration-level confidence gate is also needed
  - **Tags**: [patterns, verification, testing]
  - **Confidence**: High
  - **Added**: 2026-02-12

### Established Conventions

<!-- Conventions to maintain consistency -->

- **No raw JSON.parse on external data**: Use `sanitizeJsonParse()` for all user/external data to prevent prototype pollution. Internal data (own package.json) can use raw `JSON.parse()`
  Tags: [conventions, security]
- **EJS restricted to safe output only**: All EJS templates sanitized before rendering — `<%- %>` auto-converted to `<%= %>`, `<% %>` stripped. Only `<%= %>` (escaped output) is supported
  Tags: [conventions, security]
- **YAML generation via js-yaml**: All YAML frontmatter generation uses `js-yaml` `dump()` for proper escaping. No manual string concatenation for YAML
  Tags: [conventions, coding]
- **Shell script conventions for hooks**: Use `printf '%s'` (not `echo`) for JSON piping, `set +e`/`set -e` (not `|| true`) for exit code capture, env vars (not shell interpolation) for passing values to `bun -e`, `${CLAUDE_PROJECT_DIR:-.}` for project dir fallback
  Tags: [conventions, coding]

## Decisions

### Architectural Choices

<!-- Past decisions with rationale — recall to avoid re-debating -->

| Decision                                               | Context                      | Tags                                    | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                          | Date       |
| ------------------------------------------------------ | ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| CLI installer over npm                                 | Distribution model           | [decisions, architecture]               | Better UX for setup wizard, can prompt for config                                                                                                                                                                                                                                                                                                                                                                                                  | 2026-02-04 |
| Branded skin over rebrand                              | Customization approach       | [decisions, architecture]               | Cursor file name limitations, enables upgradability                                                                                                                                                                                                                                                                                                                                                                                                | 2026-02-04 |
| React+TS template only v1                              | Stack templates              | [decisions, stack]                      | Ship one excellent template, prove pattern                                                                                                                                                                                                                                                                                                                                                                                                         | 2026-02-04 |
| UnJS ecosystem for CLI                                 | Tooling stack                | [decisions, stack]                      | citty, consola, unbuild, pathe, @clack/prompts all worked seamlessly. Validated in Phase 1 execution                                                                                                                                                                                                                                                                                                                                               | 2026-02-04 |
| Adapter factory pattern                                | Multi-tracker support        | [decisions, architecture]               | Type-based switch returns appropriate implementation, decoupling CLI from specific tracker logic                                                                                                                                                                                                                                                                                                                                                   | 2026-02-04 |
| Security-first documentation                           | Enterprise readiness         | [decisions, security]                   | Created SECURITY.md and SECURITY_QUESTIONNAIRE.md early to establish compliance baseline                                                                                                                                                                                                                                                                                                                                                           | 2026-02-05 |
| js-yaml over manual YAML                               | Template safety              | [decisions, coding, security]           | Manual string concatenation breaks on special chars (quotes, colons, newlines). js-yaml handles all edge cases                                                                                                                                                                                                                                                                                                                                     | 2026-02-10 |
| Zod for API response validation                        | Runtime safety               | [decisions, coding, security]           | TypeScript `as` casts provide zero runtime protection. Zod safeParse catches malformed responses before they propagate                                                                                                                                                                                                                                                                                                                             | 2026-02-10 |
| EJS restriction (escaped only)                         | Template safety              | [decisions, security]                   | Unescaped output (`<%-`) enables XSS; code blocks (`<%`) enable arbitrary code execution. Restrict to `<%=` only                                                                                                                                                                                                                                                                                                                                   | 2026-02-10 |
| Native mkdir over fs-extra                             | Dependency minimization      | [decisions, performance]                | fs-extra was used only for `ensureDir({recursive:true})`. Node.js/Bun native APIs suffice. 99KB saved, reduced distribution size                                                                                                                                                                                                                                                                                                                   | 2026-02-10 |
| Lazy loading for optional commands                     | Bundle optimization          | [decisions, performance]                | Heavy optional features (update-notifier 1.0MB) loaded dynamically. Reduces default startup path without sacrificing features. Tradeoff: adds dynamic import wrapper                                                                                                                                                                                                                                                                               | 2026-02-10 |
| import.meta.main over require.main                     | Bun ESM compatibility        | [decisions, stack, coding]              | Bun ESM files should use `import.meta.main` (boolean) instead of CJS `require.main === module` pattern. Consistent with ESM module system and Bun runtime conventions                                                                                                                                                                                                                                                                              | 2026-02-10 |
| Hooks on both Claude Code and Cursor                   | Cross-platform enforcement   | [decisions, architecture]               | Both platforms now support hooks with similar semantics (stdin JSON, exit codes, matchers). Different config formats (settings.json vs hooks.json) and event names (PascalCase vs camelCase) but same shell scripts with dual-format parsing                                                                                                                                                                                                       | 2026-02-10 |
| Metadata registry over class registry for hooks        | Hook architecture            | [decisions, architecture]               | Hooks are shell scripts, not TypeScript classes. Using HookDefinition metadata objects with platform-specific fields (event/cursorEvent) and separate config generators per platform. Cleaner than forcing class pattern on non-class entities                                                                                                                                                                                                     | 2026-02-10 |
| Transcript file size as context proxy                  | Context monitoring           | [decisions, architecture]               | Claude Code doesn't expose context window usage %. Transcript file size (bytes) is a reasonable proxy with configurable thresholds (100KB/200KB/300KB). Imperfect but functional                                                                                                                                                                                                                                                                   | 2026-02-10 |
| Two-layer verification (hooks + harness)               | Quality enforcement strategy | [decisions, verification, architecture] | Lightweight hooks (format, typecheck, pre-commit) run frequently. Comprehensive harness (full test suite, integration checks, structured parsing) runs at phase boundaries. Asymmetric cost model: hooks are fast/cheap, harness is thorough/expensive. Harness failures trigger failure-to-fix loops within phase execution. Validated in Phase 12                                                                                                | 2026-02-10 |
| Config fallback for optional sections                  | Framework configuration      | [decisions, architecture]               | Harness config is optional in framework projects. Provide DEFAULT_HARNESS_CONFIG constant and fall back to it when harness section is missing from config.json. Enables progressive adoption without requiring config updates                                                                                                                                                                                                                      | 2026-02-10 |
| Bun.spawn with manual timeout implementation           | Process execution            | [decisions, stack, coding]              | Bun.spawn has no built-in timeout like Node's child_process. Implement via `setTimeout` + `proc.kill()` + `Promise.race`. Also: (1) pass commands as `["sh", "-c", cmd]` string array (not string), (2) stdout/stderr are ReadableStreams — collect via `new Response(stream).text()`, (3) `.exited` is a Promise<number>, not synchronous                                                                                                         | 2026-02-10 |
| [Phase 13] 5-level complexity with 3 behavioral tiers  | Complexity gating            | [decisions, architecture, complexity]   | 5 levels (TRIVIAL-CRITICAL) provide classification precision; 3 tiers (lightweight/standard/thorough) reduce implementation branching. Levels for routing decisions, tiers for behavioral gating. Avoids N-way switches in every gated step                                                                                                                                                                                                        | 2026-02-11 |
| [Phase 13] Backward-compatible flag aliasing           | CLI flag migration           | [decisions, conventions]                | `--force-complex` retained as alias for `--complexity=COMPLEX`. New `--complexity=<level>` flag added alongside, not replacing, the old flag. Users with existing workflows are not broken                                                                                                                                                                                                                                                         | 2026-02-11 |
| [Phase 13] Soft enforcement via self-gating rules      | Gating architecture          | [decisions, architecture, complexity]   | Rather than hard-coding complexity conditionals into every agent/skill, a single `alwaysApply: true` rule provides the full matrix. Agents read and self-gate. Reduces implementation surface, enables matrix updates without touching multiple files                                                                                                                                                                                              | 2026-02-11 |
| [Phase 14] Specification anchoring via additive steps  | Verification extension       | [decisions, verification, architecture] | Extended lu-verifier with Steps 2.5 and 9.5 (decimal numbering) rather than renumbering existing steps. PLAN.md content re-injected at verification time via lu-execute-phase Step 7. Chose additive insertion to preserve all existing references, documentation, and backward compatibility                                                                                                                                                      | 2026-02-11 |
| [Phase 14] Signal taxonomy as audit framework          | Verification audit           | [decisions, verification]               | Created 4-tier reliability taxonomy (T1 Deterministic → T4 Self-Assessment) to systematically classify 38 verification signals. Taxonomy enables gap analysis: if a step relies only on T3/T4 signals, it's a blind spot. Framework reusable for future audit phases                                                                                                                                                                               | 2026-02-11 |
| [Phase 15] 4-tier cognition system (T0-T3)             | Per-agent cognition          | [decisions, architecture, complexity]   | Classified 25 agents into 4 tiers: T0 (Stateless, 0 tokens), T1 (Memory-Reader, ~200-500 tokens), T2 (Session-Aware, ~500-1000 tokens), T3 (Fully-Cognitive, ~1000-2000 tokens). Dynamic tier with fixed default: complexity-driven promotion with ceiling cap via `promotable_to` field. Numeric ordering (T0=0, T1=1, T2=2, T3=3) enables threshold comparisons. Follows N-to-M compression pattern from Phase 13 (5 boolean features → 4 tiers) | 2026-02-11 |
| [Phase 15] YAML frontmatter for compiled agents        | Agent runtime config         | [decisions, architecture]               | Compiler emits cognition config as YAML frontmatter in compiled .md files (`---\ncognition:\n  default_tier: T2\n  ...`). Machine-readable at runtime without TypeScript imports. lu-cognition reads frontmatter via `head -20` + parse. Agents without cognition config default to T0. Chosen over: (a) separate JSON config file (too many files), (b) TypeScript imports in compiled .md (not portable)                                         | 2026-02-11 |
| [Phase 15] Tag vocabulary size at ~14 tags             | Memory recall precision      | [decisions, architecture, complexity]   | 14 domain tags balance recall precision vs vocabulary maintenance overhead. Too few tags = poor filtering. Too many = high maintenance + over-tagging + tag synonyms. Each entry gets 1-3 tags. Keyword scoring inside lu-cognition handles fine-grained matching within tag-filtered sets. Wildcard `["*"]` used only by lu-cognition (serves all agents)                                                                                         | 2026-02-11 |
| [Phase 16] Advisory budget, not enforced               | Token budget allocation      | [decisions, architecture]               | Token budget allocation is documented as advisory guidance (25-50% output reservation) rather than hard enforcement. Enforcement requires runtime token counting infrastructure that does not exist yet. Avoids premature optimization                                                                                                                                                                                                             | 2026-02-11 |
| [Phase 16] Keep all findings, tag with source          | Multi-reviewer aggregation   | [decisions, architecture]               | When multiple reviewers find overlapping issues, keep all findings tagged with source_agent rather than auto-resolving conflicts. Auto-resolution risks discarding valid but differently-phrased findings                                                                                                                                                                                                                                          | 2026-02-11 |
| [Phase 16] Context assembly in orchestrator, not agent | Context responsibility       | [decisions, architecture]               | Clean separation where agents define WHAT context they need (frontmatter config) but the orchestrator assembles HOW to provide it (document assembly). Agents never load their own context documents. Keeps agents focused on their task domain                                                                                                                                                                                                    | 2026-02-11 |
| [Phase 20] 38 commands from 44 skills (exclusion set)  | Command compilation scope    | [decisions, architecture]               | 6 skills excluded from command generation: `workflow-start` (internal), 5 `rule-*` skills (informational, not invocable). Exclusion set pattern chosen over per-skill opt-in flag to minimize source changes. Commands use YAML frontmatter format with `allowed_tools: []` and `disable_model_invocation: true` for non-interactive skills                                                                                                        | 2026-02-12 |
| [Phase 20] /lu as routing orchestrator, not executor   | Skill architecture           | [decisions, architecture]               | /lu rewritten from monolithic inline workflow to lightweight router using two delegation mechanisms: Skill tool for sub-skills (lu-discuss-phase, etc.) and Task tool for agents (lu-cognition, lu-router, etc.). Router never executes workflow steps itself. Each sub-skill loads its own SKILL.md. Enables independent sub-skill iteration without touching the router                                                                          | 2026-02-12 |

### Decision: WSJF Scoring with LLM-Inferred Inputs (T3 Signal)

**Tags:** [planner, decisions, architecture]
**Phase:** 18
**Context:** WSJF scoring requires Business Value (BV), Time Criticality (TC), and Risk Reduction (RR) inputs for each backlog item.
**Choice:** PM agent (lu-pm-planner) infers BV/TC/RR from todo context, ROADMAP, and dependency graph using LLM judgment (T3 signal). These are advisory, not deterministic.
**Rationale:** No automated source of truth for business value exists. LLM inference from project context produces reasonable relative ordering. The planner output is advisory (session plan suggestions), not enforced, so T3 signal quality is acceptable. More accurate than random or uniform scoring.
**Alternatives rejected:** Manual scoring by user (too slow for automated planning), uniform scoring (defeats purpose of prioritization), dependency count as proxy (doesn't capture business value).

### Decision: Read-Only Agent Archetype via Tools Whitelist

**Tags:** [planner, decisions, architecture]
**Phase:** 18
**Context:** lu-pm-planner needs to read backlog, roadmap, and state files but must never modify them.
**Choice:** Enforce read-only behavior via tools whitelist: `["Read", "Glob", "Grep", "WebFetch"]` only. Orchestrator handles all file writes based on agent output.
**Rationale:** Output-only enforcement at the tools level is the most reliable mechanism available. The agent literally cannot call Write/Edit/Bash tools. Combined with ResultEnvelope for structured output, the orchestrator receives the plan and decides what to persist.
**Alternatives rejected:** Honor system (unreliable), post-hoc validation (too late), separate process sandbox (over-engineered for advisory agent).

### Decision: Verify Loop Limits Lower Than Harness Loop

**Tags:** [iteration, complexity]
**Phase:** 17
**Context:** Phase 17 added verifyFixIterations alongside harnessFixIterations in ComplexityGate.
**Choice:** Verify limits are intentionally 40-60% lower than harness limits (e.g., COMPLEX: harness=3, verify=2; CRITICAL: harness=5, verify=3).
**Rationale:** Semantic gaps (verifier Loop B) are harder and more expensive to auto-fix than mechanical failures (harness Loop A). Each verify iteration re-runs the full verifier + targeted executor, consuming significantly more tokens. If the verifier still finds gaps after 2-3 tries, human intervention is more effective than burning budget.
**Alternatives rejected:** Same limits for both (too expensive for verify), verify = harness/2 (too aggressive for TRIVIAL/SIMPLE).

### Decision: Iteration Count as Budget Proxy

**Tags:** [iteration, workflow]
**Phase:** 17
**Context:** Claude Code has no API for querying remaining token budget or exact consumption.
**Choice:** Use iteration count divided by max iterations as the cost proxy. Soft stop at 80%.
**Rationale:** Without token counting, iterations-completed/iterations-allowed is the best available approximation. The 80% threshold leaves 20% headroom for the final iteration to complete cleanly. More sophisticated duration-based estimation can be added later without changing the BudgetState schema.
**Alternatives rejected:** Duration-based estimation (unreliable, varies by task complexity), no budget enforcement (risks hitting hard limits mid-iteration).

### Decision: Inline plugin generation over separate build-plugin.ts

**Tags:** [architecture, build]
**Phase:** 22
**Context:** Plugin build logic existed in a separate `build-plugin.ts` file (553 lines) that was called via `import { buildPlugin } from "./build-plugin"`. Both build-all.ts and build-plugin.ts needed the same constants and helpers.
**Choice:** Inline plugin logic into build-all.ts and extract shared constants/functions to build-shared.ts. Delete build-plugin.ts entirely.
**Rationale:** Having a separate file created import coupling (build-all depends on build-plugin) and made the shared module extraction for drift detection harder. Inlining the plugin section into build-all.ts puts all three build targets (.claude/, .cursor/, dist/plugin/) in a single file with a clear sequential flow, while build-shared.ts provides the reusable pieces needed by check-drift.ts and tests.
**Alternatives rejected:** Keeping build-plugin.ts as a standalone module (creates an extra layer of indirection), extracting all build logic to build-shared.ts (build-shared would become too large and gain I/O responsibilities).

### Decision: Marketplace manifest structure follows Anthropic reference

**Tags:** [architecture, conventions]
**Phase:** 22
**Context:** Claude Code marketplace spec was inferred from Anthropic's own marketplace.json reference.
**Choice:** Flat root-level fields (`name`, `owner`, `plugins[]`), `source: "."` since marketplace.json lives inside the plugin directory, `category: "development"`, `$schema` URL included even though it doesn't resolve.
**Rationale:** Following the reference implementation exactly reduces the chance of incompatibility with Claude Code's plugin system.
**Alternatives rejected:** Nested `metadata` wrapper (not seen in reference), omitting `$schema` (loses spec compliance signal).

### Trade-offs Made

<!-- Explicit trade-offs — recall when similar decisions arise -->

(None yet — will accumulate during development)

## Pitfalls

### Known Issues

<!-- Problems encountered — recall to prevent repetition -->

- **Hardcoded paths break packageability**: Found 10+ locations with hardcoded PT-/ENG- prefixes, company references, absolute paths — all need abstraction
  Tags: [pitfalls, coding]
- **Package version mismatches**: Always verify package versions exist before committing. citty ^0.2.1 doesn't exist (use ^0.2.0), @clack/prompts ^0.10.0 doesn't exist (use ^1.0.0). Check npm registry before specifying versions
  Tags: [pitfalls, stack]
- **Undefined values override defaults**: In `mergeBranding()`, undefined values can override schema defaults. Filter out undefined values before merging to preserve defaults
  Tags: [pitfalls, coding]
- **Template paths break in bundled context**: `__dirname` doesn't work in bundled executables. Use `import.meta.url` with `fileURLToPath()` and `dirname()` to resolve template directories correctly
  Tags: [pitfalls, coding, stack]
- **Missing leading dots on directory names**: Template directories like `.planning` and `.cursor` must include leading dots in their names. Rename template directories to match expected hidden directory pattern
  Tags: [pitfalls, conventions]

- **js-yaml quoting change propagation**: Switching from manual YAML (always quotes strings) to js-yaml (only quotes when needed) affects ALL downstream tests that assert on frontmatter output. Search for `": "` patterns in test assertions when changing YAML generation
  Tags: [pitfalls, testing]
- **Cross-package import failures**: TypeScript resolves `src/shared/` imports from `packages/luca-framework/` at compile time but module resolution fails at runtime. Always use self-contained modules or npm package imports
  Tags: [pitfalls, architecture, coding]
- **Pre-existing test failures mask new ones**: The 6 pre-existing failures in executeDoctor/configValidationCheck are caused by process.cwd() mocking issues in concurrent test runs. Track these separately to avoid masking new regressions
  Tags: [pitfalls, testing, debugging]
- **Module-level mutable state in CLIs**: Exporting command modules from index creates mutable `createdPaths` at module scope. Reusing the module in tests/scripts causes state to persist across invocations. Always reset mutable state at function entry point, not module load time
  Tags: [pitfalls, coding, debugging]
- **Code review false-positives on intentional patterns**: Static analysis flagged 3 high-severity issues in optimized CLI code (guard clauses without explicit else, aggressive string joining, conditional imports). These were intentional architectural choices, not defects. Document intent comments for static analysis tools
  Tags: [pitfalls, conventions, verification]
- **Declared but unwired CLI flags**: citty allows declaring `args` without wiring them to the `run()` function body. The `--verbose` flag existed for months without working because `run({ args })` destructuring was missing. Always verify flag wiring by testing CLI flags end-to-end after declaration
  Tags: [pitfalls, coding, testing]
- **Non-existent commands in fix suggestions**: Doctor check suggested `--force` and `--repair` flags that don't exist in the CLI. Fix suggestions must reference actual working commands — never suggest flags or subcommands that haven't been implemented
  Tags: [pitfalls, conventions]
- **validateBranding skips undefined fields by design**: `validateBranding()` only validates fields that are present (for partial validation support). For installed configs where required branding subfields are mandatory, check field presence separately before calling validateBranding. Validated in Phase 9 (code review HIGH fix)
  Tags: [pitfalls, coding]
- **`|| true` swallows exit codes**: `TSC_OUTPUT=$(cmd) || true; TSC_EXIT=$?` always sets `TSC_EXIT=0` because `$?` captures exit code of `true`, not `cmd`. Must use `set +e; TSC_OUTPUT=$(cmd); TSC_EXIT=$?; set -e` instead. Caught by plan checker, would have produced non-functional pre-commit gate
  Tags: [pitfalls, coding, debugging]
- **`echo` corrupts JSON on some platforms**: `echo "$INPUT"` can interpret backslash sequences differently across shells. Always use `printf '%s' "$INPUT"` for piping JSON data through shell scripts
  Tags: [pitfalls, coding]
- **Shell variable interpolation in bun -e strings**: `${FILE_PATH}` inside `bun -e "..."` JS strings breaks if path contains quotes or backslashes. Pass values via env vars: `HOOK_FILE_PATH="$FILE_PATH" bun -e "const fp = process.env.HOOK_FILE_PATH;"`
  Tags: [pitfalls, coding, security]
- **Assuming platform exclusivity for features**: Phase 11 initially assumed hooks were Claude Code-only. Cursor added hooks support with a similar API. Always verify competitor/alternative platform capabilities before declaring features platform-exclusive
  Tags: [pitfalls, decisions]
- **Bun.spawn command passing quirk**: `Bun.spawn(cmd)` with a string fails silently. Must pass as `["sh", "-c", cmd]` to execute multi-word commands. Single-word commands like `["ls"]` work, but anything requiring shell interpretation needs the `["sh", "-c", ...]` wrapper. Caught by plan checker before deployment
  Tags: [pitfalls, stack, coding]
- **Bun.spawn has no built-in timeout**: Unlike Node.js child_process with `{ timeout }` option, Bun.spawn doesn't support timeouts. Implemented via `setTimeout` → `proc.kill()` → `Promise.race` pattern. Must use this pattern for all subprocess execution with timeout requirements
  Tags: [pitfalls, stack, coding]
- **Bun.spawn stdout/stderr are ReadableStreams**: In Node, you get buffer/string directly. In Bun, `.stdout` and `.stderr` are ReadableStreams. Must collect with `new Response(proc.stdout).text()` pattern. This is a footgun because it looks like a string property but needs streaming collection
  Tags: [pitfalls, stack, coding]
- **Bun.spawn .exited is async Promise**: `proc.exited` returns `Promise<number>`, not synchronous. Code checking `if (proc.exited === 0)` will fail. Must `await proc.exited` or use it in Promise chains
  Tags: [pitfalls, stack, coding]
- **ESLint parser requires --format json**: ESLint by default outputs human-readable format. Parser must inject `--format json` flag into the command to get JSON output that can be parsed. Generic parser can't handle ESLint output without this flag
  Tags: [pitfalls, coding]
- **Diverse toolchain output formats require multiple parsers**: tsc outputs to stderr with line:col notation, bun-test outputs to stdout with JSON, eslint outputs JSON, generic tools may output anything. No single parser handles all. Registry pattern enables composition — add parsers incrementally for new tools
  Tags: [pitfalls, architecture, coding]
- **Failure-to-fix loops need iteration limits**: Phase 12 runs harness, detects failures, applies fixes (e.g., format with prettier), re-runs harness. Without `maxIterations` limit (set to 3), infinite loops are possible if fix doesn't resolve failure. Always include escape hatch in retry loops
  Tags: [pitfalls, coding, verification]
- **[Phase 13] Plan checker catches wave dependency conflicts**: Original Phase 13 plan had plans 13-01 and 13-02 both in Wave 1 despite 13-02 depending on 13-01's types. Plan checker caught this before execution. Always run plan checker when plans have cross-references or shared file targets
  Tags: [pitfalls, planning, verification]
- **[Phase 13] Registry entries are class constructors, not instances**: When checking registry entries (e.g., ruleRegistry), `entry.slug` doesn't work because the registry stores constructors, not instantiated objects. Must check by registry key name or instantiate first. Caught during test assertion for rule count validation
  Tags: [pitfalls, coding, architecture]
- **[Phase 13] Executor modifying orchestrator-owned files**: Plan 13-04 executor modified STATE.md with formatting changes and a new todo. STATE.md is managed by the orchestrator (Step 8). Had to reset STATE.md since executor changes would be overwritten. Executors should never modify orchestrator-owned files (STATE.md, WORKING.md)
  Tags: [pitfalls, conventions, planning]
- **[Phase 13] Wrong assertion counts from stale analysis**: Plan checker flagged wrong rule count assertion (expected 23 rules but actual was 20, becoming 21 after adding the new rule). Stale counts from earlier analysis propagate into plan assertions. Always verify current counts at execution time, not planning time
  Tags: [pitfalls, testing, verification]
- **[Phase 14] Verifier goal drift when must-haves derived from ROADMAP only**: lu-verifier derived must-haves from the ROADMAP goal text, not from individual PLAN.md objectives. This means individual plan objectives could be missed if the ROADMAP goal is a higher-level summary. The fix (Steps 2.5 + 9.5) re-injects PLAN.md and checks per-objective achievement. Always anchor verification to the most specific specification available, not a summary
  Tags: [pitfalls, verification, planning]
- **[Phase 14] Self-assessment gap between executor and verifier**: Executor writes SUMMARY.md claiming task completion (T4 signal), but nothing validates these claims until the harness/verifier runs at phase boundary. In the gap, the orchestrator trusts T4 signals to proceed. Mitigation: harness runs immediately after wave completion, but the gap still exists within wave execution
  Tags: [pitfalls, verification]
- **[Phase 15] Context bloat from aggressive memory recall**: At CRITICAL complexity with cognition promotions, up to 14 agents could receive memory context (5000-10000 extra tokens total). If too many agents are promoted to T2/T3, the aggregate context budget explodes across parallel agent invocations. Mitigation: tier-scaled entry limits (T1: 3-5, T2: 5-7, T3: 7-10), promotable_to ceilings that cap most agents, and tag-based pre-filtering that reduces candidate sets. Monitor: if context window pressure appears, first check agent tier distribution at the active complexity level
  - **Agent**: lu-cognition
  - **Relevant to**: [lu-cognition, lu-router]
  - **Tags**: [pitfalls, performance, complexity]
  - **Confidence**: Medium
  - **Added**: 2026-02-11
- **[Phase 15] Stale tags on MEMORY.md entries**: Domain tags are static labels on knowledge that evolves. An entry tagged `[coding, patterns]` may become relevant to `[architecture]` as the project grows, but the tag will not update itself. Over time, tag-based filtering may miss entries that have drifted in relevance. Mitigation: legacy entries (no tags) always included in all recalls for backward compatibility. lu-learner can re-tag entries when confidence is updated. Periodic tag audits recommended at major milestone boundaries
  - **Agent**: lu-learner
  - **Relevant to**: [lu-learner, lu-cognition]
  - **Tags**: [pitfalls, conventions]
  - **Confidence**: Medium
  - **Added**: 2026-02-11
- **[Phase 15] Cognition config dual source of truth**: Cognition configuration exists in both `.agent.ts` source files AND compiled `.md` output files. The compiler is the bridge -- it reads from `.agent.ts` and emits YAML frontmatter into `.md`. If an agent's `.agent.ts` is updated but `build:all` is not re-run, the compiled `.md` will have stale config. lu-cognition reads the compiled `.md` at runtime, not the source. Mitigation: always run `bun run build:all` after modifying agent cognition config. Plan 15-04 validated this by running build:all after all 27 agent updates
  - **Agent**: lu-cognition
  - **Relevant to**: [lu-cognition, lu-executor]
  - **Tags**: [pitfalls, architecture, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 15] Research data requires independent verification**: 15-RESEARCH.md classified lu-planner, lu-executor, and lu-verifier as T0 (stateless). Direct grep verification found all three have cognition references, yielding a 12% error rate on 25 agents. Any audit using prior research as primary data should spot-check at least 20% of entries against source files. Phase 15 caught this by running a second pass with direct file inspection
  - **Agent**: general
  - **Relevant to**: [lu-phase-researcher, lu-plan-checker, lu-verifier]
  - **Tags**: [pitfalls, verification, planning]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Verifier WORKING.md bias**: Before Phase 16, lu-verifier received WORKING.md content, which created confirmation bias -- the verifier could see the executor's reasoning and unconsciously validate it rather than independently checking outcomes. Warm isolation (removing WORKING.md from verifier context) addresses this
  - **Agent**: lu-verifier
  - **Relevant to**: [lu-verifier, lu-executor, lu-execute-phase]
  - **Tags**: [pitfalls, verification]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Complexity module circular import risk**: When `src/complexity/types.ts` imports from `src/context/types.ts` (for ContextTier in contextPromotions), and `src/context/resolve-context-tier.ts` imports from `src/complexity/defaults.ts`, there is a potential circular dependency. Resolved by importing from specific files (not barrel index.ts) and keeping the import chain unidirectional
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, all agents]
  - **Tags**: [pitfalls, architecture, coding]
  - **Confidence**: High
  - **Added**: 2026-02-11
- **[Phase 16] Dual source of truth between .agent.ts and compiled .md**: Adding context config to .agent.ts source files requires `bun run build:all` to propagate to compiled output. Forgetting to build leaves compiled agents stale. Always run build after modifying agent source files
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-cognition, all agents]
  - **Tags**: [pitfalls, coding, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-11

### Pitfall: Editing .claude/ or .cursor/ Directly Causes Three-Way Drift

**Tags:** [architecture, conventions, drift]
**Phase:** 17
**Issue:** Editing files in `.claude/` or `.cursor/` directly (instead of their `src/` source) causes three-way divergence: source tells one story, Claude output tells another, Cursor output tells a third. The next `bun run build:all` overwrites manual changes with whatever is in `src/`, silently losing work.
**Solution:** ALWAYS edit `src/` source files and run `bun run build:all`. Three drift prevention layers exist: (1) `pre-commit-drift-check.sh` hook blocks commits with drifted outputs, (2) `bun run check:drift` for manual verification, (3) `scripts/check-drift.test.ts` runs in `bun test` CI. If drift is detected, run `bun run build:all` to regenerate from source.
**Impact:** Critical — Phase 17 lost ~465 lines of lu-execute-phase iteration content and a complexity-gating row because they were edited in `.claude/` output files instead of `src/` source files.

### Pitfall: Git Detached HEAD from git checkout <tag>

**Tags:** [iteration, checkpoint]
**Phase:** 17
**Issue:** Using `git checkout <tag>` for rollback puts the repository in detached HEAD state. Subsequent commits would be on no branch, easily lost.
**Solution:** Use `git reset --hard <tag>` instead, which moves the current branch pointer back to the tagged commit. This keeps the branch association intact and avoids the detached HEAD problem.
**Impact:** Critical -- would break all subsequent git operations (commits, pushes) if not caught.

### Pitfall: Convergence False Positive on First Iteration

**Tags:** [iteration, verification]
**Phase:** 17
**Issue:** Convergence detection comparing current errors to "previous" errors on the first iteration would always show perfect overlap (both empty or current vs empty = 0.0 overlap), producing misleading signals.
**Solution:** Skip convergence check on iteration 1. Only assess convergence from iteration 2 onward, when a meaningful previous exists.
**Impact:** Medium -- would cause premature loop termination or incorrect stale counts if not handled.

### Pitfall: Big Rock Selection Without Effort Filter

**Tags:** [planner, scheduling, verification]
**Phase:** 18
**Issue:** `selectBigRock()` initially filtered only by `dependency_free === true` without checking effort size. This allowed TRIVIAL (effort=1) or SIMPLE (effort=2) items to be selected as the session's Big Rock anchor, defeating the scheduling strategy.
**Solution:** Added `BIG_ROCK_MIN_EFFORT = 3` constant and `item.wsjf_inputs.effort_points >= BIG_ROCK_MIN_EFFORT` filter. Caught by lu-verifier during PLAN-04 requirements check.
**Impact:** Medium — would produce suboptimal session plans with trivial items in the anchor slot.

- **[Phase 20] Background executor agent permission loops**: Background executor agents (spawned via `Task(run_in_background: true)`) can enter permission denial loops when their Bash tool calls are auto-denied (prompts unavailable). The agent retries the same command indefinitely. Impact: agent appears stuck despite all substantive work being complete. Mitigation: orchestrator should check agent output periodically and manually complete any remaining administrative tasks (summary files, state updates) if the agent is stuck on non-critical operations
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-execute-phase]
  - **Tags**: [pitfalls, planning, conventions]
  - **Confidence**: High
  - **Added**: 2026-02-12
- **[Phase 22] Marketplace manifest duplication between build and drift check**: The marketplace manifest object literal is defined inline in both `build-all.ts` and `check-drift.ts`. Unlike other shared items extracted to `build-shared.ts`, this was not extracted because it contains the `version` variable (resolved at runtime). If the manifest structure changes, both files must be updated. Consider extracting a `generateMarketplaceManifest(version)` function to `build-shared.ts` in a future phase
  - **Agent**: code-simplifier
  - **Relevant to**: [lu-executor, lu-verifier]
  - **Tags**: [pitfalls, architecture, conventions]
  - **Confidence**: Medium
  - **Added**: 2026-02-12
- **[Phase 23] hooks.json wrapper key mismatch**: hooks.json has a `{"hooks": {...}}` wrapper — the actual event types are under `.hooks`, not at the root. Forgetting this level causes tests to validate the wrong structure (finding just one key "hooks" instead of event types). Always access `hooksFile.hooks` before iterating event types. This is easy to miss because the file is named hooks.json and you expect the root to be the hooks config
  - **Agent**: lu-executor
  - **Relevant to**: [lu-executor, lu-verifier]
  - **Tags**: [pitfalls, testing, coding]
  - **Confidence**: High
  - **Added**: 2026-02-12

### Anti-patterns

<!-- What NOT to do — recall when approaching similar areas -->

- **TypeScript `as` casts for external data**: Never use `as TypeName` to cast data from external APIs, user input, or file reads. Use Zod schemas with `.safeParse()` instead
  Tags: [pitfalls, coding, security]
- **Raw JSON.parse for user data**: Never use raw `JSON.parse()` on user-provided or external data without `sanitizeJsonParse()` wrapper
  Tags: [pitfalls, coding, security]
- **Shell string interpolation**: Never interpolate user values into shell commands. Use array-form arguments with `--` end-of-options markers
  Tags: [pitfalls, coding, security]
- **`|| true` for exit code capture**: Never use `cmd || true; EXIT=$?` — it always yields `EXIT=0`. Use `set +e; cmd; EXIT=$?; set -e` instead
  Tags: [pitfalls, coding]
- **`echo` for JSON piping**: Never use `echo "$VAR"` to pipe JSON. Use `printf '%s' "$VAR"` to prevent backslash interpretation
  Tags: [pitfalls, coding]
- **Editing .claude/ or .cursor/ output files directly**: Never modify compiled output files. Always edit the `src/` source and run `bun run build:all`. Output files are generated artifacts — manual edits will be overwritten on next build and cause drift detection failures
  Tags: [pitfalls, architecture, conventions, drift]

## Preferences

### User Preferences

<!-- Learned from feedback — recall for consistency -->

(None yet — will accumulate during development)

### Project Preferences

<!-- Project-specific patterns — recall for consistency -->

- **Enterprise focus**: Prioritize compliance, security, configurability over convenience
  Tags: [conventions, security]
- **Notify don't auto-update**: Teams control when they update framework
  Tags: [conventions, decisions]
- **Surgical optimization over broad refactoring**: For performance work, target specific bottlenecks (lazy loading, unused dependencies) rather than redesigning systems. CLI is already performant at 23ms startup — avoid gold-plating
  Tags: [conventions, performance]
- **Extract repeated values to constants**: Use named constants for validation sets (TEMPLATE_EXTENSIONS), magic strings, and repeated literals. Single point of truth, aids readability and maintenance
  Tags: [conventions, coding]
- **Toolchain-agnostic harness**: Verification harness must support multiple tools (tsc, bun-test, eslint, generic). Use parser registry + pluggable architecture. Each tool has different output format — don't try to normalize; embrace diversity with separate parsers
  Tags: [conventions, verification, architecture]
- **Layered enforcement cadence**: Hooks run at every edit/commit (fast feedback). Harness runs at phase boundaries (comprehensive validation). This asymmetry enables both speed and thoroughness. Don't run harness on every keystroke; let hooks provide fast feedback
  Tags: [conventions, verification]
- **Config progressive adoption**: Optional config sections (like harness) should ship with sensible defaults. Projects without explicit config should still work — fallback to DEFAULT_HARNESS_CONFIG. Enables rollout without forcing all projects to update config immediately
  Tags: [conventions, architecture]
- **[Phase 13] Module pattern consistency**: New domain modules (complexity, harness, etc.) follow identical structure: `types.ts` (types + constants + utilities), `defaults.ts` (default configuration), `index.ts` (public API barrel). Maintain this pattern for all new `src/<domain>/` modules
  Tags: [conventions, architecture]
- **[Phase 13] Mirror changes across skill variants**: When updating `src/skills/general/lu.skill.ts`, always mirror changes to `src/skills/luca/lu.skill.ts`. The two variants must stay in sync for consistent behavior across branded deployments
  Tags: [conventions, coding]

---

---

_Memory Statistics_

- Total patterns: 63 (+2 Phase 23: spec-conformance layer, E2E summary gate)
- Total decisions: 37 (no change)
- Total pitfalls: 46 (+1 Phase 23: hooks.json wrapper key)
- Total conventions: 4 (no change)
- Total anti-patterns: 6 (no change)
- Total preferences: 9 (no change)
- Last updated: 2026-02-12

_Entries added by: lu-execute-phase (Phase 23 learning extraction)_
_Last curated: 2026-02-12_
