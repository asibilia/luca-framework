/**
 * phase-discuss skill — Gather phase context through adaptive questioning before creating execution plans.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-discuss/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'
import { INPHASE_TERSENESS_DIRECTIVE } from '../../shared/index.ts'

const BODY = `<main>
# Luca Discuss Phase

Extract implementation decisions that downstream agents need — researcher and planner will use context.md to know what to investigate and what choices are locked.

${INPHASE_TERSENESS_DIRECTIVE}

**Arguments:** \`<phase> [--auto]\`

## How It Works

### Interactive Mode (default)

1. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create context.md with decisions that guide research and planning

### Auto Mode (\`--auto\` flag)

1. Analyze the phase to identify gray areas (same as interactive)
2. Auto-select ALL gray areas (no user prompt)
3. Load project tech stack from MuninnDB
4. Spawn \`researcher\` agent per gray area question (web research)
5. Present research summary with citations before writing
6. Offer user override: accept all / override some / switch to interactive
7. Create context.md with researched decisions (annotated with source provenance)

Auto mode is useful when running via \`/lu\` in auto mode or when the user wants AI-researched decisions instead of manual discussion.

**Output:** \`{phase}-context.md\` — decisions clear enough that downstream agents can act without asking the user again

## Process

### Step 0 — Ensure pipelineStep (self-gate)

Run \`luca state read\`. This skill writes \`context.md\`, which the stage-gate hook permits **only** in the \`discuss\` pipelineStep. The single legal forward entry is \`research → discuss\`.

- \`pipelineStep === "discuss"\` → already there, proceed.
- \`pipelineStep === "research"\` → run \`luca state advance --to-step discuss\`, then proceed.
- anything else → STOP. The pipeline must reach \`research\` before discuss can run — point the user at \`/lu\`. Do NOT force the transition or write \`context.md\` from the wrong step (the hook will BLOCK it).

### Complexity-Aware Discussion

Read complexity from the canonical workflow state:

\`\`\`bash
COMPLEXITY=$(luca state read 2>/dev/null | jq -r '.complexity // "MODERATE"')
\`\`\`

**Always runs.** Discussion depth and model tier scale with complexity:

| Complexity | Discussion Depth | Model Tier (researcher) |
|------------|-----------------|-------------------------------------|
| TRIVIAL | Light (2 questions per area) | fast |
| SIMPLE | Light (2 questions per area) | balanced |
| MODERATE | Standard (4 questions per area) | balanced |
| COMPLEX | Extended (4+ questions per area) | capable |
| CRITICAL | Thorough (6+ questions per area) | capable |

The researcher model tier is set by the agent’s own definition.

1. **Validate phase number** (error if missing or not in roadmap)
2. **Check if context.md exists** (offer update/view/skip if yes)
3. **Detect mode** — If \`--auto\` flag is present, use auto mode (steps 4a-8a). Otherwise, use interactive mode (steps 4-7).

**Interactive Mode (default):**

4. **Analyze phase** — Identify domain and generate phase-specific gray areas
5. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
6. **Deep-dive each area** — 4 questions per area, then offer more/next
7. **Write context.md** — Sections match areas discussed
8. **Offer next steps** (research or plan)

**Auto Mode (\`--auto\`):**

4a. **Analyze phase** — Same gray area identification as interactive mode
5a. **Auto-select all gray areas** — No user prompt, select everything
6a. **Load project identity from MuninnDB** — Run \`luca brain recall-root --concept brain:project-identity\` and follow the emitted \`muninn_recall_tree\` procedure to extract project tech stack (languages, frameworks, conventions). Do NOT call \`muninn_recall_tree(id: "brain:project-identity")\` directly — recall_tree rejects a concept as root_id, and the brain tree lives in the repo vault (not \`default\`).
7a. **Spawn researcher per question** — For each gray area:
    - Formulate a focused question from the gray area topic
    - Spawn \`researcher\` via Task() with: question, phase context, tech stack from MuninnDB
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
10a. **Write context.md** — Include provenance annotations:
    - \`[researched]\` — Decision from web research with cited sources
    - \`[user-override]\` — User overrode the researched recommendation
    - \`[user-input]\` — Non-researchable item answered by user
11a. **Offer next steps** (research or plan)

## Critical: Scope Guardrail

- Phase boundary from roadmap.md is FIXED
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
- [ ] context.md captures decisions, not vague vision

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
</main>
`

export const phaseDiscussSkill = defineSkill({
    name: "phase-discuss",
    description: "Gather phase context through adaptive questioning before creating execution plans.",
    body: BODY,
})
