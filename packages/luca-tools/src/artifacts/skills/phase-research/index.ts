/**
 * phase-research skill — Conduct comprehensive ecosystem research for niche or complex technical domains.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-research/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
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

### Step 0 — Ensure pipelineStep (self-gate)

Run \`luca state read\`. This skill writes \`research.md\`, which the stage-gate hook permits **only** in the \`research\` pipelineStep. The single legal forward entry is \`triage → research\`.

- \`pipelineStep === "research"\` → already there, proceed.
- \`pipelineStep === "triage"\` → run \`luca state advance --to-step research\`, then proceed.
- anything else → STOP. The pipeline must reach \`triage\` before research can run — point the user at \`/lu\` to drive it there. Do NOT force the transition or let the researcher write \`research.md\` from the wrong step (the hook will BLOCK it).

1. **Load phase context:**

   - Read \`.luca/roadmap.md\` for phase goal
   - Recall project identity from MuninnDB (\`brain:project-identity\`) for project context
   - Read existing research at \`.luca/phases/<slug>/research.md\` (if any)

2. **Spawn researcher:**

   - Use researcher agent
   - Focus on ecosystem knowledge for the domain

3. **Create research.md:**

   - Location: \`.luca/phases/XX-name/{phase}-research.md\`
   - Include: stack recommendations, architecture patterns, pitfalls

4. **Present findings:**

   \`\`\`
   ## Research Complete

   **Domain:** {domain}
   **File:** .luca/phases/XX-name/{phase}-research.md

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
- [ ] research.md created with domain knowledge
- [ ] Stack recommendations specific and versioned
- [ ] Pitfalls actionable with prevention strategies

## Next Steps

**Primary:** \`/phase-plan {phase}\` — Create plans using research findings

**Also available:**

- \`/phase-assumptions {phase}\` — Review what AI plans to do
- \`/progress\` — Check overall project status
</main>
`

export const phaseResearchSkill = defineSkill({
    name: 'phase-research',
    description:
        'Conduct comprehensive ecosystem research for niche or complex technical domains.',
    body: BODY,
})
