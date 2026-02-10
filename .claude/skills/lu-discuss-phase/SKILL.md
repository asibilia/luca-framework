# lu-discuss-phase

Gather phase context through adaptive questioning before planning. Use when user wants to discuss a phase, clarify vision, or asks about /lu-discuss-phase.

## main

# Luca Discuss Phase

Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**Arguments:** `<phase>`

## How It Works

1. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create CONTEXT.md with decisions that guide research and planning

**Output:** `{phase}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again

## Execution Context

Read these reference files before executing:

- `.cursor/luca/workflows/discuss-phase.md`
- `.cursor/luca/templates/context.md`

## Process

1. **Validate phase number** (error if missing or not in roadmap)
2. **Check if CONTEXT.md exists** (offer update/view/skip if yes)
3. **Analyze phase** — Identify domain and generate phase-specific gray areas
4. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
5. **Deep-dive each area** — 4 questions per area, then offer more/next
6. **Write CONTEXT.md** — Sections match areas discussed
7. **Offer next steps** (research or plan)

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
| Context gathered, niche domain    | Research the domain | `/lu-research-phase {phase}`         |
| Context gathered, standard domain | Plan the phase      | `/lu-plan-phase {phase}`             |
| Want to review assumptions        | List assumptions    | `/lu-list-phase-assumptions {phase}` |

**Primary:** `/lu-plan-phase {phase}` — Create execution plans using gathered context

**Also available:**

- `/lu-research-phase {phase}` — Deep research for niche/complex domains
- `/lu-progress` — Check overall project status