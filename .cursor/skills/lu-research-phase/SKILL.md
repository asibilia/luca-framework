---
name: lu-research-phase
description: Comprehensive ecosystem research for niche/complex domains. Use when user needs deep domain research, mentions /lu-research-phase, or is working with specialized tech.
disable-model-invocation: true
---

<main>
<main>
# Luca Research Phase

Comprehensive ecosystem research for niche/complex domains.

**Arguments:** `<phase number>`

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

   - Location: `.planning/phases/XX-name/{phase}-RESEARCH.md`
   - Include: stack recommendations, architecture patterns, pitfalls

4. **Present findings:**

   ```
   ## Research Complete

   **Domain:** {domain}
   **File:** .planning/phases/XX-name/{phase}-RESEARCH.md

   ### Key Findings

   **Stack:** {recommended approach}
   **Patterns:** {standard architecture}
   **Watch Out:** {common pitfalls}

   ## ▶ Next Up

   /lu-plan-phase {N} — plan with research context
   ```

## Success Criteria

- [ ] Phase context loaded
- [ ] Researcher agent spawned
- [ ] RESEARCH.md created with domain knowledge
- [ ] Stack recommendations specific and versioned
- [ ] Pitfalls actionable with prevention strategies

## Next Steps

**Primary:** `/lu-plan-phase {phase}` — Create plans using research findings

**Also available:**

- `/lu-list-phase-assumptions {phase}` — Review what AI plans to do
- `/lu-progress` — Check overall project status
</main>
</main>