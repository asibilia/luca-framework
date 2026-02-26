/**
 * phase-research Skill - Conduct comprehensive ecosystem research for niche or complex technical domains.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the phase-research skill configuration
const phaseResearchConfig: SkillConfig = {
  frontmatter: {
    name: "phase-research",
    description: `Conduct comprehensive ecosystem research for niche or complex technical domains.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Research Phase

Comprehensive ecosystem research for niche/complex domains.

**Arguments:** \`<phase number>\`

## When to Use

Use for:

- 3D, games, audio, shaders, ML
- Specialized domains with non-obvious patterns
- Tech stacks you're unfamiliar with

Goes beyond "which library" to ecosystem knowledge:

- Standard architectures in the domain
- Expected features and behaviors
- Common pitfalls and anti-patterns

## Process

1. **Load phase context:**

   - Read ROADMAP.md for phase goal
   - Read PROJECT.md for project context
   - Read existing research (if any)

2. **Spawn researcher:**

   - Use lu-phase-researcher agent
   - Focus on ecosystem knowledge for the domain

3. **Create RESEARCH.md:**

   - Location: \`.planning/phases/XX-name/{phase}-RESEARCH.md\`
   - Include: stack recommendations, architecture patterns, pitfalls

4. **Present findings:**

   \`\`\`
   ## Research Complete

   **Domain:** {domain}
   **File:** .planning/phases/XX-name/{phase}-RESEARCH.md

   ### Key Findings

   **Stack:** {recommended approach}
   **Patterns:** {standard architecture}
   **Watch Out:** {common pitfalls}

   ## ▶ Next Up

   /phase-plan {N} — plan with research context
   \`\`\`

## Success Criteria

- [ ] Phase context loaded
- [ ] Researcher agent spawned
- [ ] RESEARCH.md created with domain knowledge
- [ ] Stack recommendations specific and versioned
- [ ] Pitfalls actionable with prevention strategies

## Next Steps

**Primary:** \`/phase-plan {phase}\` — Create plans using research findings

**Also available:**

- \`/phase-assumptions {phase}\` — Review what AI plans to do
- \`/progress\` — Check overall project status
</main>`,
      order: 1,
    },
  ],
};

export const phaseResearchSkill = createSkill(phaseResearchConfig);
