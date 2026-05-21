---
title: "Skill Eval Framework: Test, Measure, and Refine Agent Skills"
area: skills
created: 2026-03-05
source: conversation
reference: https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills
---

## Context

Research from Anthropic's skill-creator blog post (2026-03) identified three high-impact improvements for agent skill quality: eval testing, description optimization, and parallel A/B evaluation. Mapped these to Luca's 47-skill system and identified concrete implementation paths.

## Two Skill Categories (Classification)

Luca skills fall into two categories that require different validation approaches:

**Capability uplift** (complex workflows, high quality variance):

- `phase-execute`, `autopilot`, `debug`, `pr-address`, `session-resume`, `milestone-audit`
- These encode multi-step techniques and patterns beyond Claude's base abilities
- Priority targets for eval testing (quality varies most here)

**Encoded preference** (convention enforcement, low variance):

- `git-commit`, `code-lint`, `code-typecheck`, `test-run`, `git-pr`
- These sequence existing Claude abilities per Luca conventions
- Simpler evals, mainly checking correct command usage

## Task 1: Add Evals to SkillConfigSchema

Extend `src/skills/__schemas/skill.schemas.ts` with an optional `evals` field:

```ts
export const SkillEvalSchema = z.object({
  prompt: z.string(), // Input prompt to test the skill
  expected: z.string(), // Description of expected outcome
  criteria: z.array(z.string()), // Specific pass/fail checks
});

export const SkillConfigSchema = z.object({
  frontmatter: SkillFrontmatterSchema,
  sections: z.array(SectionSchema),
  evals: z.array(SkillEvalSchema).optional(),
});
```

## Task 2: Write Evals for High-Value Skills First

Priority order (capability uplift skills with highest quality variance):

1. `phase-execute` - verify wave parallelization, harness runs, state transitions
2. `autopilot` - verify phase sequencing, specialist swarm spawning, plan review
3. `debug` - verify hypothesis generation, root cause identification
4. `pr-address` - verify reviewer swarming, concern validation, fix application
5. `session-resume` - verify cognitive context restoration, WORKING.md loading

Each skill gets 3-5 evals covering:

- Happy path (standard invocation)
- Edge cases (missing state, partial context)
- Regression cases (known past failures)

## Task 3: Audit All 47 Skill Descriptions for Trigger Precision

Blog found description optimization improved activation on 5/6 skills. Audit each description for:

- **False positive risk**: Would unrelated user prompts accidentally trigger this skill?
- **False negative risk**: Would valid user prompts fail to trigger this skill?
- **Overlap**: Do multiple skills have descriptions that could match the same prompt?

Known candidates for refinement:

- `note` - "Add a new phase to the roadmap (default), or queue a developer note" is ambiguous
- `lu` - broad entry point, intentionally so but may over-trigger
- `choose` - good specificity, use as model
- `quick` - needs verification

## Task 4: Create `bun run eval:skills` Script

Build a script (likely `scripts/eval-skills.ts`) that:

1. Loads all skills with defined evals
2. Runs each eval in an isolated context (no cross-contamination between tests)
3. Uses parallel evaluation (multi-agent) for independence
4. Reports pass/fail per eval with structured JSON output
5. Integrates with existing harness verification layer
6. Supports A/B: skill-loaded vs baseline (no skill) comparison

## Task 5: Model Upgrade Regression Testing

When upgrading Claude models (e.g., Sonnet -> Opus, or version bumps):

1. Run full eval suite before and after model change
2. Compare pass rates, execution time, token usage
3. If baseline (no skill) passes capability uplift evals, skill may be redundant
4. Flag skills that degrade on new model versions

## Task 6: Parallel A/B Evaluation Infrastructure

Extend existing autopilot parallel agent infrastructure to support:

- Comparator agents that run skill-vs-baseline
- Skill v1 vs v2 comparison when iterating on skill content
- Structured diff output showing where versions diverge

Luca already has the parallel spawning infrastructure in `autopilot.skill.ts` (specialist swarms, parallel planning/execution). This extends that pattern to skill evaluation.

## Implementation Notes

- Gate evals to CI or explicit `bun run eval:skills` invocation (not every commit)
- Store eval results locally, compatible with dashboard/CI integration
- Follow existing patterns: Zod schema-first, functional API, bun runtime
- Evals are metadata alongside skills, not separate test files (colocation principle)

## Notes

Blog post key insight: "Skill descriptions trigger agent selection -- too broad creates false positives, too narrow prevents activation." This maps directly to Luca's skill routing via `lu.skill.ts` and the description field in `SkillFrontmatterSchema`.

The eval framework also enables the debate pattern opportunity already captured in MEMORY.md -- evals provide the measurement layer that debates need to resolve disagreements objectively.
