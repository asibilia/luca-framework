/**
 * phase-discuss Skill - Gather phase context through adaptive questioning before creating execution plans.
 */
import { createSkill } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.schemas";

// Define the phase-discuss skill configuration
const phaseDiscussConfig: SkillConfig = {
  frontmatter: {
    name: "phase-discuss",
    description: `Gather phase context through adaptive questioning before creating execution plans.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Discuss Phase

Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**Arguments:** \`<phase> [--auto]\`

## How It Works

### Interactive Mode (default)

1. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create CONTEXT.md with decisions that guide research and planning

### Auto Mode (\`--auto\` flag)

1. Analyze the phase to identify gray areas (same as interactive)
2. Auto-select ALL gray areas (no user prompt)
3. Read BRAIN.md for project tech stack
4. Spawn \`lu-discuss-researcher\` agent per gray area question (web research)
5. Present research summary with citations before writing
6. Offer user override: accept all / override some / switch to interactive
7. Create CONTEXT.md with researched decisions (annotated with source provenance)

Auto mode is useful when running via \`/autopilot\` or when the user wants AI-researched decisions instead of manual discussion.

**Output:** \`{phase}-CONTEXT.md\` — decisions clear enough that downstream agents can act without asking the user again

## Execution Context

Read these reference files before executing:

- \`.cursor/luca/workflows/discuss-phase.md\`
- \`.cursor/luca/templates/context.md\`

## Process

### Complexity Gate

Read complexity from bridge (falls back to STATE.md \`Task Complexity:\` field):

\`\`\`bash
COMPLEXITY=$(bun run packages/luca-state/src/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
\`\`\`

| Complexity | Discussion |
|------------|-----------|
| TRIVIAL | Skip entirely — proceed to /phase-plan |
| SIMPLE | Skip entirely — proceed to /phase-plan |
| MODERATE | Optional — run with standard depth (4 questions per area) |
| COMPLEX | Recommended — run with extended depth (4+ questions per area) |
| CRITICAL | Required — run with thorough depth (6+ questions per area) |

If complexity is TRIVIAL or SIMPLE:
\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► DISCUSSION SKIPPED (TRIVIAL/SIMPLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task complexity is {TRIVIAL|SIMPLE}. Discussion is not needed.

▶ Next Up
/phase-plan {phase}
\`\`\`

1. **Validate phase number** (error if missing or not in roadmap)
2. **Check if CONTEXT.md exists** (offer update/view/skip if yes)
3. **Detect mode** — If \`--auto\` flag is present, use auto mode (steps 4a-8a). Otherwise, use interactive mode (steps 4-7).

**Interactive Mode (default):**

4. **Analyze phase** — Identify domain and generate phase-specific gray areas
5. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
6. **Deep-dive each area** — 4 questions per area, then offer more/next
7. **Write CONTEXT.md** — Sections match areas discussed
8. **Offer next steps** (research or plan)

**Auto Mode (\`--auto\`):**

4a. **Analyze phase** — Same gray area identification as interactive mode
5a. **Auto-select all gray areas** — No user prompt, select everything
6a. **Read BRAIN.md** — Extract project tech stack (languages, frameworks, conventions)
7a. **Spawn lu-discuss-researcher per question** — For each gray area:
    - Formulate a focused question from the gray area topic
    - Spawn \`lu-discuss-researcher\` via Task() with: question, phase context, tech stack from BRAIN.md
    - Collect the \`<research_result>\` response with recommendation, confidence, and sources
    - If \`researchable: false\`: flag for user input (even in auto mode)
8a. **Present research summary** — Show consolidated results:
    \`\`\`
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Luca ► AUTO-DISCUSS RESULTS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    | # | Gray Area | Recommendation | Confidence | Sources |
    |---|-----------|---------------|------------|---------|
    | 1 | {area}    | {rec}         | HIGH       | 2 cited |
    | 2 | {area}    | {rec}         | MEDIUM     | 1 cited |
    | 3 | {area}    | Not researchable | N/A     | —       |
    \`\`\`

    **Non-researchable items:** {list questions that need user input}
9a. **User override** — Even in auto mode, give user a chance to adjust:
    - Accept all: Use all researched recommendations
    - Override some: User provides answers for specific questions
    - Discuss instead: Switch to interactive mode for remaining items
10a. **Write CONTEXT.md** — Include provenance annotations:
    - \`[researched]\` — Decision from web research with cited sources
    - \`[user-override]\` — User overrode the researched recommendation
    - \`[user-input]\` — Non-researchable item answered by user
11a. **Offer next steps** (research or plan)

## Critical: Scope Guardrail

- Phase boundary from ROADMAP.md is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own phase. I'll note it for later."
- Capture deferred ideas — don't lose them, don't act on them

## Domain-Aware Gray Areas

Gray areas depend on what's being built. Analyze the phase goal:

- Something users SEE → layout, density, interactions, states
- Something users CALL → responses, errors, auth, versioning
- Something users RUN → output format, flags, modes, error handling
- Something users READ → structure, tone, depth, flow
- Something being ORGANIZED → criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

## Probing Depth

Scale probing depth by complexity:
- MODERATE: 4 questions per area (standard)
- COMPLEX: 4-6 questions per area (extended)
- CRITICAL: 6+ questions per area (thorough)

Default:
- Ask 4 questions per area before checking
- "More questions about [area], or move to next?"
- If more → ask 4 more, check again
- After all areas → "Ready to create context?"

## Do NOT Ask About (AI handles these)

- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

## Success Criteria

- [ ] Gray areas identified through intelligent analysis
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] CONTEXT.md captures decisions, not vague vision

## Next Steps

| Condition                         | Action              | Command                                 |
| --------------------------------- | ------------------- | --------------------------------------- |
| Context gathered, niche domain    | Research the domain | \`/phase-research {phase}\`         |
| Context gathered, standard domain | Plan the phase      | \`/phase-plan {phase}\`             |
| Want to review assumptions        | List assumptions    | \`/phase-assumptions {phase}\` |

**Primary:** \`/phase-plan {phase}\` — Create execution plans using gathered context

**Also available:**

- \`/phase-research {phase}\` — Deep research for niche/complex domains
- \`/progress\` — Check overall project status
</main>`,
      order: 1,
    },
  ],
};

export const phaseDiscussSkill = createSkill(phaseDiscussConfig);
