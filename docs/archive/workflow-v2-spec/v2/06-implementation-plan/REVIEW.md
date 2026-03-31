# Review: 06-implementation-plan

## Reviewer: Implementation Feasibility Reviewer (Cold Isolation)
## Date: 2026-03-22
## Iteration: 1

## Summary Assessment

The implementation plan is thorough, well-structured, and closely aligned with existing codebase patterns. The phased rollout is logically sequenced, config changes are backward-compatible, and agent/skill specifications are detailed enough for direct implementation. However, there are several notable gaps -- primarily around the build pipeline (compiler + skill registry updates), the `lu-config.schemas.ts` config parser that must actually consume the new config sections, and an inconsistency between the research config using `snake_case` property names versus the complexity matrix's existing `camelCase` convention. These issues are all fixable without architectural changes.

## Critical Findings

- **CRIT-IP-001**: [config-changes.md] -- **Research config schema uses `snake_case` but complexity matrix and existing config use `camelCase`.** The proposed `ResearchConfigSchema` uses snake_case keys (`parallel_researchers`, `review_loop`, `per_task_recall`), while the existing `.planning/config.json` complexity matrix uses camelCase (`planVerificationIterations`, `harnessFixIterations`, `verifyFixIterations`). The config is internal (not an API payload), so the api-snake-case rule does not apply. However, the result is a split convention within the same JSON file: `research.parallel_researchers` alongside `complexity.matrix.MODERATE.planVerificationIterations`. This will confuse implementers and consumers. -- **Resolution:** Standardize the research config to match the existing config convention. Either use camelCase throughout (`parallelResearchers`, `reviewLoop`, `perTaskRecall`, `maxResearchers`, etc.) or explicitly document the intentional convention split and justify it.

- **CRIT-IP-002**: [new-skills-needed.md, phased-rollout.md] -- **Skill registry file (`src/skills/__helpers/build-skill-registry.ts`) is never mentioned as a modified file.** The plan meticulously lists `build-agent-registry.ts` as modified in Phases 1, 2, and 3 for agent registration, but the equivalent `build-skill-registry.ts` is completely absent. New skills (`phase-research-expand`, `phase-research-review`, `phase-graduate`, `phase-plan-review`) must be imported and registered in the skill registry, or they will not be compiled into `.claude/` output. -- **Resolution:** Add `src/skills/__helpers/build-skill-registry.ts` to the "Files to Modify" table in Phases 2, 3, and 4 of phased-rollout.md (corresponding to when each new skill is created). Update the file counts accordingly.

- **CRIT-IP-003**: [phased-rollout.md, README.md] -- **No mention of `bun run build:all` as a required step between phases.** The plan states verification criteria like "agent registry imports and registers all 4 agents without errors" and "enhanced `phase-research` skill compiles without errors," but these only validate TypeScript compilation. The actual agent/skill definitions must be compiled to `.claude/` via `bun run build:all` before they can be invoked by Claude Code. The "Manual Validation" sections mention running skills (e.g., `/phase-research 1`), which requires the build to have run. Only Phase 1 mentions this (line 79: "After building (`bun run build:all`, run outside Claude Code session)") but Phases 2-6 do not. -- **Resolution:** Add a standard "Build" step to each phase's verification section, explicitly noting that `bun run build:all` must be run outside the Claude Code session before manual validation.

## Important Findings

- **IMP-IP-001**: [config-changes.md] -- **Existing config parser (`src/shared/__schemas/lu-config.schemas.ts`) must be updated to consume new sections, but is not listed as a modified file.** The plan proposes new Zod schemas for `WorkflowVersionSchema` and `ResearchConfigSchema` in `src/shared/__schemas/` but does not mention updating the existing config parser that reads `.planning/config.json`. The existing file `src/shared/__schemas/lu-config.schemas.ts` likely defines the top-level config shape and must be extended to include the new `research` section and `workflow.version` field. -- **Resolution:** Add `src/shared/__schemas/lu-config.schemas.ts` to the "Files to Modify" list in Phase 6 (or earlier if schema validation is needed during development). Verify the existing config parser's structure and determine whether the new schemas should be inlined there or imported from new files.

- **IMP-IP-002**: [new-agents-needed.md] -- **Agent frontmatter uses `cognition.default_tier: "T2"` for the graduator, which is higher than any existing agent's T1 maximum.** Reviewing the existing `lu-phase-researcher` agent, it uses `cognition.default_tier: "T1"` and `promotable_to: "T1"`. The proposed `lu-research-graduator` uses `cognition.default_tier: "T2"` and `context.promotable_to: "T2"`. While this is valid according to the schema (`CognitionTierSchema` supports T0-T3), no existing agent in the codebase uses T2 cognition. This may trigger untested code paths in `lu-cognition`. -- **Resolution:** Consider starting the graduator at T1 (matching existing agents) unless T2 cognition behavior has been validated. Document the rationale if T2 is intentionally chosen.

- **IMP-IP-003**: [phased-rollout.md] -- **Phase 5 claims "can be implemented in parallel with Phase 4" but has a data dependency on Phase 4.** Phase 5 (Executor Enhancement) states dependency on Phase 3 (graduation) and Phase 4 (planner produces `research_refs`). The plan acknowledges this by noting "The executor enhancement can use mock research refs during development." This is workable but the rollout table (line 469) says "Can Parallelize? Yes (with P5)" for Phase 4, which may give implementers a false sense of independence. -- **Resolution:** Clarify in the Phase 5 dependency section that full integration testing requires Phase 4 to be complete, and that parallel implementation requires mock data for the `research_refs` field.

- **IMP-IP-004**: [new-agents-needed.md] -- **Reviewer agents lack `WebSearch` and `WebFetch` tools but `lu-accuracy-reviewer` is tasked with "Source verification."** The shared reviewer frontmatter specifies only `["Read", "Grep", "Glob"]`. Yet the accuracy reviewer's role includes "Are sources authoritative?", "Version currency", and verifying source quality. Without `WebSearch`/`WebFetch`, the accuracy reviewer can only assess whether sources are cited, not actually verify them. -- **Resolution:** Either add `WebSearch`/`WebFetch` to `lu-accuracy-reviewer`'s tool list (breaking from the shared frontmatter), or clarify in the agent spec that accuracy review is document-based assessment, not live source verification. The latter aligns better with cold isolation semantics.

- **IMP-IP-005**: [config-changes.md] -- **Proposed complexity matrix extension adds `researcherCount` and `reviewerCount` per complexity level, but these overlap with the top-level `research.max_researchers` and `research.max_reviewers`.** The plan defines researcher/reviewer counts in two places: the `research` config section (global defaults) and the `complexity.matrix` entries (per-level overrides). The precedence relationship is not specified -- which wins? -- **Resolution:** Document the precedence: complexity matrix values override research config defaults when both are present. Or remove the overlap by making counts configurable only in one location.

- **IMP-IP-006**: [phased-rollout.md] -- **The compiler system (`src/compilers/`) is never mentioned.** The build pipeline (`bun run build:all`) uses compilers to transform agent/skill source files into `.claude/` output. If the compiler needs changes to handle new agent frontmatter fields (like `background_spawnable`, `purpose`, `allowed_contexts`), those changes are not planned. -- **Resolution:** Verify whether `src/compilers/__helpers/compile.ts` handles all frontmatter fields used by new agents. If new fields require compiler awareness, add compiler modifications to Phase 1.

## Minor Findings

- **MIN-IP-001**: [new-agents-needed.md] -- **`sharedResearcherFrontmatter` includes `allowed_contexts` field, which is not in the current `AgentFrontmatterSchema`.** The schema at `src/agents/__schemas/agent.schemas.ts` defines: `name`, `description`, `tools`, `color`, `cognition`, `context`, `model_routing`, `model_tier`, `background_spawnable`, `purpose`. The field `allowed_contexts` is not present. It would need to be added to the schema or removed from the proposed agent configs. -- **Resolution:** Check if `allowed_contexts` is consumed anywhere in the codebase. If not, either add it to `AgentFrontmatterSchema` (schema extension) or remove it from the proposed agent configs.

- **MIN-IP-002**: [migration-from-v1.md] -- **The `--v2` CLI flag is described but no implementation location is specified.** The migration doc describes `--v2` as a per-invocation override, but no file is identified for parsing this flag. The orchestrator `lu.skill.ts` is a skill (prompt text), not executable code with argument parsing. -- **Resolution:** Clarify that `--v2` would be parsed by the orchestrator's prompt (instruction to check for the flag in args) rather than by compiled CLI code, or identify the actual parsing location.

- **MIN-IP-003**: [config-changes.md, migration-from-v1.md] -- **The example configs in migration-from-v1.md and config-changes.md show slightly different field orders and nesting, which could confuse implementers.** Migration doc (line 33-39) shows `workflow.version` in a config block that also has `research: true`, while config-changes.md (line 50-63) shows the same. Both are consistent, but the `research` field in `workflow` (boolean, v1) could be confused with the `research` top-level section (object, v2). -- **Resolution:** Add a brief callout noting that `workflow.research` (boolean) controls whether v1 research runs at all, while `research.*` (object) controls v2 research behavior. These are orthogonal.

- **MIN-IP-004**: [new-skills-needed.md] -- **Skill config shapes use `SkillConfig` type but the actual type in the codebase is imported from `~/skills/__schemas/skill.schemas`.** This is consistent with existing pattern (e.g., `phase-research.skill.ts` line 5), so no action needed. Noting for completeness.

- **MIN-IP-005**: [README.md] -- **Line 36 says schemas go in `src/shared/__schemas/` "or inline in new files."** The "or inline" option contradicts the domain-architecture rule that schema files live in `__schemas/` directories. -- **Resolution:** Remove the "or inline" option and commit to placing schemas in `__schemas/` directories per the structural invariant.

## Missing Implementation Items

1. **Skill registry updates**: `src/skills/__helpers/build-skill-registry.ts` must import and register all 4 new skills. This is entirely absent from the plan.

2. **Config parser updates**: `src/shared/__schemas/lu-config.schemas.ts` must be extended to parse the new `research` section and `workflow.version` field. Without this, the Zod schemas defined in config-changes.md are dead code -- nothing would actually read and validate the config.

3. **Compiler verification**: No analysis of whether `src/compilers/__helpers/compile.ts` handles all new agent/skill frontmatter fields. The build pipeline must correctly emit new agents/skills to `.claude/`.

4. **Hook script updates**: If `lu.skill.ts` changes significantly (Phase 6), and if there are pre/post hooks that reference skill names, those hook scripts in `src/hooks/scripts/` may need updates.

5. **Dependency graph updates**: `src/skills/__helpers/dependency-graph.ts` and `validate-skill-order.ts` may need updates to include new skill dependency relationships (e.g., `phase-research-review` depends on `phase-research`).

6. **PLAN.md format specification**: The `research_refs` field added to PLAN.md task frontmatter is mentioned but the PLAN.md parser (wherever it lives) is not identified as needing modification.

7. **Token cost analysis**: The plan references token cost monitoring in post-implementation but provides no estimates for per-phase token costs. Given that v2 spawns 4 researchers + 3 reviewers (7 parallel agents minimum), the token impact could be significant for MODERATE+ tasks.

8. **Context7 MCP tool availability**: The researcher agents list `mcp__context7__*` in their tools. No verification that this MCP server is available or required in the project setup.

## Architecture Compliance Check

**Agent file locations**: All proposed agents are placed in `src/agents/general/` with `*.agent.ts` naming -- **compliant** with domain-architecture.md entity naming (`{name}.{type-singular}.ts`).

**Skill file locations**: All proposed skills are placed in `src/skills/general/` with `*.skill.ts` naming -- **compliant**.

**Helper file locations**: Shared prompt constants placed in `src/agents/__helpers/` -- **compliant** with `__helpers/` convention.

**Schema file locations**: New schemas proposed for `src/shared/__schemas/` (T0) and `src/complexity/__schemas/` (T0) -- **compliant** with tier rules. Config schemas are T0 Foundation, consumed by higher tiers.

**Module boundary compliance**: New agents (T2) import from T0 (shared) helpers and schemas. No cross-entity imports (agents never import from skills or rules). -- **compliant**.

**Barrel index invariant**: Not directly addressed, but new agents/skills would be registered via their respective registries (not via index.ts logic). -- **compliant** as long as `src/agents/index.ts` and `src/skills/index.ts` only re-export.

**Naming convention**: All proposed file names use kebab-case -- **compliant** with file-naming.md.

**No-classes rule**: All agent definitions use `createAgent()` factory function pattern -- **compliant**.

**No-tests rule**: No test files proposed -- **compliant** with `.claude/rules/no-tests.md`.

**Generated file guard**: Plan correctly identifies that `.claude/` is generated and should not be edited directly. -- **compliant**.

**Bun preference**: Verification criteria use `bunx --bun tsc --noEmit` (not `npx`). Build commands use `bun run build:all`. -- **compliant**.

## Verdict: NEEDS REVISION

The plan is strong and close to implementable, but the three critical findings must be resolved before implementation begins:

1. Fix the naming convention split between research config (`snake_case`) and existing config (`camelCase`).
2. Add skill registry (`build-skill-registry.ts`) to the modified files list across relevant phases.
3. Add explicit build step (`bun run build:all`) to each phase's verification criteria.

The important findings (config parser updates, cognition tier validation, count precedence, compiler verification) should ideally be addressed as well, but could be resolved during implementation if documented as known gaps.
