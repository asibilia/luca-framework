# Phased Rollout

> Six-phase implementation plan for building v2 incrementally, with scope estimates, dependencies, and verification criteria for each phase.

---

## Phase Overview

```
Phase 1: Research Infrastructure ─────────────────────┐
                                                       │
Phase 2: Review Loop ─────────────────────────────────┤
                                                       │
Phase 3: MuninnDB Graduation ────────────────────────┤
                    │                                  │
                    ├──> Phase 4: Plan Enhancement     │
                    │                                  │
                    └──> Phase 5: Executor Enhancement │
                                                       │
Phase 6: Orchestrator Integration <────────────────────┘
```

Phases 4 and 5 can be implemented in parallel (both depend on Phase 3 but not on each other). All other phases are sequential.

---

## Phase 1: Research Infrastructure

> Foundation: parallel researcher agents and enhanced phase-research skill.

### Goal

Replace the single `lu-phase-researcher` with four parallel specialist researchers that produce focused research files in a phase-scoped `.planning/phases/NN-name/research/` directory.

### Scope

| Category       | Files | Details                                                                                               |
| -------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| New agents     | 4     | lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher |
| New helpers    | 1     | `src/agents/__helpers/researcher-shared-sections.ts`                                                  |
| Modified skill | 1     | `src/skills/general/phase-research.skill.ts` (enhanced)                                               |
| Modified infra | 2     | `build-agent-registry.ts`, `model-routing.ts`                                                         |
| **Total**      | **8** |                                                                                                       |

### Files to Create

| File                                                       | Purpose                                 |
| ---------------------------------------------------------- | --------------------------------------- |
| `src/agents/general/lu-architecture-researcher.agent.ts`   | Architecture patterns, system design    |
| `src/agents/general/lu-implementation-researcher.agent.ts` | APIs, code patterns, configuration      |
| `src/agents/general/lu-ecosystem-researcher.agent.ts`      | Library landscape, community patterns   |
| `src/agents/general/lu-risk-researcher.agent.ts`           | Pitfalls, failure modes, security       |
| `src/agents/__helpers/researcher-shared-sections.ts`       | Shared prompt constants for researchers |

### Files to Modify

| File                                           | Change                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/skills/general/phase-research.skill.ts`   | Add v2 branch: multi-agent spawning, research directory creation, v1 fallback |
| `src/agents/__helpers/build-agent-registry.ts` | Register 4 new researcher agents                                              |
| `src/skills/__helpers/build-skill-registry.ts` | Import and register enhanced `phase-research` skill (if export name changes)  |
| `src/complexity/__helpers/model-routing.ts`    | Add ROUTER preset entries for 4 researchers (Decision 10)                     |

### Dependencies

None. Phase 1 is the foundation.

### Pre-Implementation Check

Verify that `src/compilers/__helpers/compile.ts` handles all frontmatter fields used by new agents (e.g., `allowed_contexts`, `purpose`). If new fields require compiler awareness, add compiler modifications to this phase.

### Verification Criteria

- [ ] All 4 researcher agent files pass `bunx --bun tsc --noEmit`
- [ ] Agent registry imports and registers all 4 agents without errors
- [ ] Model routing table includes all 4 agents with ROUTER preset
- [ ] Enhanced `phase-research` skill compiles without errors
- [ ] Shared researcher sections file exports all expected constants
- [ ] When `workflow.version: "v1"`: skill behaves identically to current v1 (single researcher)
- [ ] When `workflow.version: "v2"`: skill creates phase-scoped `research/` directory and spawns 4 agents

### Build & Manual Validation

**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source.

1. Run `/phase-research 1` with `workflow.version: "v1"` -- should produce single RESEARCH.md (v1 behavior)
2. Run `/phase-research 1` with `workflow.version: "v2"` -- should produce `research/` directory with 4 numbered files

---

## Phase 2: Review Loop

> Quality gate: convergence-based research review with cold-isolated reviewers.

### Goal

Add a multi-reviewer quality gate that evaluates research output for completeness, accuracy, and actionability before it proceeds to graduation or planning.

### Scope

| Category       | Files | Details                                                                   |
| -------------- | ----- | ------------------------------------------------------------------------- |
| New agents     | 3     | lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer |
| New helpers    | 1     | `src/agents/__helpers/research-reviewer-shared-sections.ts`               |
| New skills     | 2     | phase-research-review, phase-research-expand                              |
| Modified infra | 2     | `build-agent-registry.ts`, `model-routing.ts`                             |
| **Total**      | **8** |                                                                           |

### Files to Create

| File                                                        | Purpose                                       |
| ----------------------------------------------------------- | --------------------------------------------- |
| `src/agents/general/lu-completeness-reviewer.agent.ts`      | Coverage gap assessment                       |
| `src/agents/general/lu-accuracy-reviewer.agent.ts`          | Source grounding verification                 |
| `src/agents/general/lu-actionability-reviewer.agent.ts`     | Planner usability evaluation                  |
| `src/agents/__helpers/research-reviewer-shared-sections.ts` | Shared cold isolation block, scoring protocol |
| `src/skills/general/phase-research-review.skill.ts`         | Review loop orchestration                     |
| `src/skills/general/phase-research-expand.skill.ts`         | Targeted deep expansion                       |

### Files to Modify

| File                                           | Change                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/agents/__helpers/build-agent-registry.ts` | Register 3 reviewer agents                                                     |
| `src/skills/__helpers/build-skill-registry.ts` | Import and register `phase-research-review` and `phase-research-expand` skills |
| `src/complexity/__helpers/model-routing.ts`    | Add DEEP_ANALYSIS preset entries for 3 reviewers                               |

### Dependencies

- **Phase 1**: Review loop evaluates research files produced by Phase 1 researchers.

### Verification Criteria

- [ ] All 3 reviewer agent files pass `bunx --bun tsc --noEmit`
- [ ] Both new skill files pass `bunx --bun tsc --noEmit`
- [ ] Agent registry includes all 3 reviewers
- [ ] Skill registry includes both new skills
- [ ] Model routing table includes all 3 reviewers with DEEP_ANALYSIS preset
- [ ] `phase-research-review` skill can be invoked after `phase-research` completes
- [ ] `phase-research-expand` skill can be invoked with `--from-review` flag
- [ ] REVIEW-LOG.md format matches specification
- [ ] Convergence logic terminates (either APPROVED, NEEDS_EXPANSION, or ESCALATE)

### Build & Manual Validation

**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source.

1. Run v2 research pipeline (`/phase-research 1` with v2 enabled)
2. Run `/phase-research-review 1` -- should spawn 3 reviewers and produce REVIEW-LOG.md
3. If NEEDS_EXPANSION: run `/phase-research-expand 1 --from-review` -- should create numbered expansion files (05+)
4. Re-run review -- should show reduction in CRITICAL/IMPORTANT gaps

---

## Phase 3: MuninnDB Graduation

> Memory bridge: distill verified research into persistent semantic memory.

### Goal

Bridge the gap between ephemeral research files and MuninnDB engrams. Verified findings become `research:*` engrams that executors can recall per-task.

### Scope

| Category       | Files | Details                                             |
| -------------- | ----- | --------------------------------------------------- |
| New agents     | 1     | lu-research-graduator                               |
| New skills     | 1     | phase-graduate                                      |
| Modified rules | 2     | vault-routing.md (project), vault-guard.md (global) |
| Modified infra | 2     | `build-agent-registry.ts`, `model-routing.ts`       |
| **Total**      | **6** |                                                     |

### Files to Create

| File                                                | Purpose                              |
| --------------------------------------------------- | ------------------------------------ |
| `src/agents/general/lu-research-graduator.agent.ts` | Distill research to MuninnDB engrams |
| `src/skills/general/phase-graduate.skill.ts`        | Graduation orchestration             |

### Files to Modify

| File                                           | Change                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `src/agents/__helpers/build-agent-registry.ts` | Register graduator agent                                   |
| `src/skills/__helpers/build-skill-registry.ts` | Import and register `phase-graduate` skill                 |
| `src/complexity/__helpers/model-routing.ts`    | Add ORCHESTRATOR preset entry for graduator (Decision 10)  |
| `.claude/rules/vault-routing.md`               | Add `research:*` to write routing table and recall routing |
| `~/.claude/rules/vault-guard.md`               | Mirror `research:*` routing in global vault guard          |

### Dependencies

- **Phase 2**: Graduation requires REVIEW-LOG.md status = APPROVED (produced by Phase 2 review loop).

### Verification Criteria

- [ ] Graduator agent file passes `bunx --bun tsc --noEmit`
- [ ] Graduate skill file passes `bunx --bun tsc --noEmit`
- [ ] Agent registry includes graduator
- [ ] Skill registry includes `phase-graduate`
- [ ] Model routing table includes graduator with ORCHESTRATOR preset
- [ ] Vault routing rules include `research:*` prefix
- [ ] GRADUATION-REPORT.md format matches specification
- [ ] Graduated engrams use `research:*` concept prefix (Decision 4)
- [ ] Graduation scoring uses weighted sum formula (Decision 5): `score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25`, threshold 0.55
- [ ] Only HIGH and MEDIUM confidence findings graduate (LOW filtered)
- [ ] Engrams are written to repo vault (not default vault)

### Build & Manual Validation

**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source.

1. Complete Phase 1 + Phase 2 pipeline (research + review = APPROVED)
2. Run `/phase-graduate 1`
3. Verify engrams in MuninnDB: `mcp__muninn__muninn_recall(vault: "luca-framework", context: "research:")`
4. Verify GRADUATION-REPORT.md maps files to engrams correctly

---

## Phase 4: Plan Enhancement

> Planning quality: planner references research, plan review loop gates plan quality.

### Goal

Enhance the planner to reference graduated research engrams in PLAN.md tasks, and add a plan review loop that verifies plans against the research corpus.

### Scope

| Category        | Files | Details                                     |
| --------------- | ----- | ------------------------------------------- |
| New skills      | 1     | phase-plan-review                           |
| Modified agents | 1     | lu-planner (enhanced to reference research) |
| Modified skills | 1     | phase-plan (may integrate research refs)    |
| **Total**       | **3** |                                             |

### Files to Create

| File                                            | Purpose                        |
| ----------------------------------------------- | ------------------------------ |
| `src/skills/general/phase-plan-review.skill.ts` | Plan review loop orchestration |

### Files to Modify

| File                                           | Change                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/agents/luca/lu-planner.agent.ts`          | Add section on referencing research engrams, `research_refs` in task frontmatter |
| `src/skills/general/phase-plan.skill.ts`       | Pass GRADUATION-REPORT.md research refs list to planner                          |
| `src/skills/__helpers/build-skill-registry.ts` | Import and register `phase-plan-review` skill                                    |

### Dependencies

- **Phase 3**: Planner needs GRADUATION-REPORT.md (produced by graduation) to know which research refs to embed.

### Verification Criteria

- [ ] Enhanced planner agent passes `bunx --bun tsc --noEmit`
- [ ] Plan review skill passes `bunx --bun tsc --noEmit`
- [ ] Skill registry includes `phase-plan-review`
- [ ] PLAN.md tasks include `research_refs` field when v2 is enabled
- [ ] Plan review loop uses existing reviewer agents (code-architect, dx-advocate, security-auditor) in cold isolation
- [ ] Plan review loop terminates by approval or budget exhaustion

### Build & Manual Validation

**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source.

1. Complete Phases 1-3 pipeline (research + review + graduation)
2. Run `/phase-plan 1` with v2 -- PLAN.md should include `research_refs` in tasks
3. Run `/phase-plan-review 1` -- should evaluate plan against research corpus
4. Verify reviewer feedback references specific research findings

### PLAN.md Task Enhancement (Example)

```markdown
### 1. Implement WebSocket reconnection manager

**Type:** auto
**TDD:** false
**Depends on:** none
**Research refs:** research:approach-ws-reconnect, research:api-bun-websocket, research:pitfall-ws-memory-leak

[Task description informed by research...]
```

---

## Phase 5: Executor Enhancement

> Execution quality: per-task MuninnDB recall gives executors targeted context.

### Goal

Enhance the executor to recall only the MuninnDB engrams referenced by its specific task's `research_refs`, providing targeted context without loading the full research corpus.

### Scope

| Category        | Files | Details                                                    |
| --------------- | ----- | ---------------------------------------------------------- |
| Modified agents | 1     | lu-executor (enhanced with per-task recall)                |
| Modified skills | 1     | phase-execute (enhanced to pass research refs to executor) |
| **Total**       | **2** |                                                            |

### Files to Modify

| File                                        | Change                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `src/agents/luca/lu-executor.agent.ts`      | Add section on per-task MuninnDB recall protocol              |
| `src/skills/general/phase-execute.skill.ts` | Extract research_refs from task frontmatter, pass to executor |

### Dependencies

- **Phase 3**: Executor needs graduated engrams in MuninnDB to recall.
- **Phase 4**: Executor needs `research_refs` in PLAN.md tasks (produced by enhanced planner).

> **Parallelism note (IMP-IP-003)**: Phase 5 can be implemented in parallel with Phase 4 for the TypeScript source changes, since both depend on Phase 3 but not on each other. However, **full integration testing requires Phase 4 to be complete** because the executor needs real `research_refs` in PLAN.md tasks. During parallel development, use mock research refs for testing (e.g., hard-coded `research:approach-test` concepts with pre-seeded MuninnDB engrams).

### Verification Criteria

- [ ] Enhanced executor agent passes `bunx --bun tsc --noEmit`
- [ ] Enhanced phase-execute skill passes `bunx --bun tsc --noEmit`
- [ ] Executor receives only task-specific research context (not full corpus)
- [ ] When `research_refs` are present: executor recalls matching engrams
- [ ] When `research_refs` are absent: executor behaves like v1 (no recall, full plan context)
- [ ] Recalled engrams are injected into executor prompt context

### Build & Manual Validation

**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source.

1. Complete Phases 1-4 pipeline (research + review + graduation + planning with refs)
2. Run `/phase-execute 1` with v2 enabled
3. Verify executor output references research findings
4. Verify executor context size is smaller than v1 (targeted recall vs. full context)

### Per-Task Recall Protocol (Executor Addition)

````markdown
## Per-Task Research Recall

Before executing a task, check its `research_refs` field:

1. If `research_refs` is present and non-empty:
   - For each concept in research_refs:
     ```
     mcp__muninn__muninn_recall(
       vault: "{repo_vault}",
       context: "{concept}"
     )
     ```
   - Inject recalled engrams into your working context
   - Use these findings as authoritative guidance for implementation

2. If `research_refs` is absent or empty:
   - Proceed with standard context (v1 behavior)
   - No MuninnDB recall for research context

3. Fallback: If recall returns no results for a concept:
   - Log warning: "Research engram not found: {concept}"
   - Continue execution without that engram
   - Do NOT halt execution due to missing research
````

---

## Phase 6: Orchestrator Integration

> Full pipeline: wire everything together in the `/lu` entry point.

### Goal

Enhance `lu.skill.ts` to conditionally run the v2 pipeline when `workflow.version: "v2"` is configured. This is the final integration phase that connects all previous phases into a single workflow.

### Scope

| Category        | Files   | Details                                                     |
| --------------- | ------- | ----------------------------------------------------------- |
| Modified skills | 1       | lu.skill.ts (v2 pipeline branching)                         |
| Modified config | 1       | .planning/config.json (add research section, version field) |
| New schemas     | 1-2     | Research config schema, workflow version schema             |
| **Total**       | **3-4** |                                                             |

### Files to Create

| File                                               | Purpose                              |
| -------------------------------------------------- | ------------------------------------ |
| `src/shared/__schemas/research-config.schemas.ts`  | ResearchConfigSchema Zod definition  |
| `src/shared/__schemas/workflow-version.schemas.ts` | WorkflowVersionSchema Zod definition |

These schema files may be created earlier in Phase 1 if needed for type safety during development.

### Files to Modify

| File                                             | Change                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `src/skills/luca/lu.skill.ts`                    | Add v2 pipeline branch after complexity classification                 |
| `src/shared/__schemas/lu-config.schemas.ts`      | Extend config parser with `research` section, `workflow.version` field |
| `src/complexity/__schemas/complexity.schemas.ts` | Extend ComplexityMatrixEntrySchema with v2 fields                      |
| `.planning/config.json`                          | Add `workflow.version`, `research` section                             |

### Dependencies

- **All previous phases**: Phase 6 integrates everything.

### Orchestrator Enhancement (lu.skill.ts)

The v2 pipeline branch in `lu.skill.ts` follows this flow.

> **Note on step numbering**: The step numbers below refer to the canonical 10-step pipeline (Decision 1), not to execution order. Steps 4 (Deep Expand) and 10 (Verify+UAT) are not shown here because Step 4 is invoked within the review loop (via `phase-research-expand`) and Step 10 runs after execution as part of the existing v1 pipeline. Step 1 (Ideate) is handled by the orchestrator before this branch.

```
# After complexity classification and ideation (Step 1):

if workflow.version == "v2":
    # Step 2: Enhanced Research
    if research.parallelResearchers:
        Skill(skill: "phase-research", args: "{phase_number}")  # v2 multi-agent

    # Step 5: Research Review Loop (Step 4 Deep Expand runs within this loop)
    if research.reviewLoop:
        Skill(skill: "phase-research-review", args: "{phase_number}")

    # Step 6: Graduation (if enabled and review approved)
    if research.graduation:
        Skill(skill: "phase-graduate", args: "{phase_number}")

    # Step 3: Discussion (unchanged, but now research-informed)
    Skill(skill: "phase-discuss", args: "{phase_number}")

    # Step 7: Planning (unchanged, but planner references research)
    Skill(skill: "phase-plan", args: "{phase_number}")

    # Step 8: Plan Review Loop (if enabled)
    if research.planReviewLoop:
        Skill(skill: "phase-plan-review", args: "{phase_number}")

    # Step 9: Execution (unchanged, but executor uses per-task recall)
    Skill(skill: "phase-execute", args: "{phase_number}")

    # Step 10: Verify + UAT (runs via existing v1 pipeline)

else:
    # v1 pipeline (unchanged)
    Skill(skill: "phase-discuss", args: "{phase_number}")
    Skill(skill: "phase-plan", args: "{phase_number}")
    Skill(skill: "phase-execute", args: "{phase_number}")
```

### Gate Integration

Each v2 step is gated by its config flag (fail-closed):

```bash
# Orchestrator reads config and passes flags
PARALLEL_RESEARCHERS=$(cat .planning/config.json 2>/dev/null | ...)
REVIEW_LOOP=$(cat .planning/config.json 2>/dev/null | ...)
GRADUATION=$(cat .planning/config.json 2>/dev/null | ...)
PLAN_REVIEW=$(cat .planning/config.json 2>/dev/null | ...)
```

### Verification Criteria

- [ ] Enhanced lu.skill.ts passes `bunx --bun tsc --noEmit`
- [ ] Config with `workflow.version: "v1"` runs v1 pipeline (no v2 steps)
- [ ] Config with `workflow.version: "v2"` and all features enabled runs full v2 pipeline
- [ ] Config with `workflow.version: "v2"` and individual features disabled skips those steps
- [ ] `--v2` flag overrides config for single invocation
- [ ] Fallback: v2 step failure gracefully degrades to v1 behavior
- [ ] End-to-end: full v2 pipeline produces code with research-informed quality

### Manual Validation (End-to-End)

1. Set `workflow.version: "v2"` with all features enabled in config
2. Run `/lu "Add WebSocket reconnection with exponential backoff"`
3. Verify pipeline runs all 10 steps:
   - Ideation (intent captured)
   - Research (4 parallel researchers, `.planning/phases/NN-name/research/` populated)
   - Review (3 reviewers, REVIEW-LOG.md, convergence achieved)
   - Graduation (engrams in MuninnDB, GRADUATION-REPORT.md)
   - Discussion (research-informed, CONTEXT.md)
   - Planning (PLAN.md with research_refs)
   - Plan review (reviewer feedback, convergence)
   - Execution (per-task recall, targeted context)
   - Verification (harness + verifier)
   - Learning (lu-learner captures patterns)
4. Compare output quality with v1 pipeline on same task

---

## Implementation Timeline Summary

| Phase | Name                     | Estimated Files | Cumulative | Can Parallelize? |
| ----- | ------------------------ | --------------- | ---------- | ---------------- |
| 1     | Research Infrastructure  | 8               | 8          | No (foundation)  |
| 2     | Review Loop              | 8               | 16         | No (needs P1)    |
| 3     | MuninnDB Graduation      | 6               | 22         | No (needs P2)    |
| 4     | Plan Enhancement         | 3               | 25         | Yes (with P5)    |
| 5     | Executor Enhancement     | 2               | 27         | Yes (with P4)    |
| 6     | Orchestrator Integration | 3-4             | 30-31      | No (needs all)   |

**Total new/modified files: ~30**

### Risk Assessment

| Phase | Risk   | Mitigation                                                               |
| ----- | ------ | ------------------------------------------------------------------------ |
| 1     | Low    | Pattern is well-established (mirrors existing agent/skill creation)      |
| 2     | Medium | Convergence logic may need tuning; start with generous thresholds        |
| 3     | Medium | MuninnDB write patterns need careful vault routing validation            |
| 4     | Low    | Small changes to existing planner, reuses existing reviewer agents       |
| 5     | Low    | Small changes to existing executor, graceful fallback if recall fails    |
| 6     | High   | Integration of all phases; most likely place for unexpected interactions |

### Phase 6 Risk Mitigation

Phase 6 is the highest-risk phase because it integrates all previous work. Mitigation strategies:

1. **Incremental integration**: Wire one v2 step at a time in `lu.skill.ts`, testing after each
2. **Feature flags**: Each v2 step is independently toggleable -- if one breaks, disable it
3. **v1 fallback**: Every v2 step has a v1 fallback path that is tested first
4. **End-to-end testing**: Run a MODERATE-complexity real task through both v1 and v2 pipelines

---

## Post-Implementation

### Monitoring

After v2 is deployed, monitor:

- **Research quality**: Are graduated engrams accurate? Sample-check periodically.
- **Review loop efficiency**: How many iterations does convergence typically take? Tune thresholds.
- **Token cost**: Compare v1 vs. v2 token usage. Verify the break-even analysis.
- **Execution quality**: Do v2 executors produce fewer hallucinations? Track verification failure rates.

### Future Enhancements (Not Part of Initial v2)

- **Adaptive researcher count**: Complexity-based scaling (2 researchers for MODERATE, 4 for COMPLEX)
- **Research caching**: Skip research for phases similar to previously researched ones
- **Cross-session research**: Recall research engrams from previous sessions on similar topics
- **Research expiry**: Automatically flag stale research engrams (> 30 days for stable tech, > 7 days for fast-moving)
- **V1 code removal**: Once v2 is validated, remove v1 code paths (far future)

---

## Related Documentation

- [README.md](README.md) -- Implementation overview
- [migration-from-v1.md](migration-from-v1.md) -- Backward compatibility strategy
- [new-skills-needed.md](new-skills-needed.md) -- Skill specifications for each phase
- [new-agents-needed.md](new-agents-needed.md) -- Agent specifications for each phase
- [config-changes.md](config-changes.md) -- Config changes supporting each phase
