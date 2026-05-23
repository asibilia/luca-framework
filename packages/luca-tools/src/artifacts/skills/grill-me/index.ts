/**
 * grill-me skill — Interview the user relentlessly about a plan or design until reaching shared understanding. Walks each branch of the decision tree, resolving dependencies one-by-one. Updates docs/CONTEXT.md and offers ADRs when decisions crystallize. Use when user says "grill me", "stress-test this plan", "poke holes", "challenge my design", or invokes /grill-me.
 *
 * Ported from ~/.claude/skills/grill-me/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# Grill Me

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions **one at a time**, waiting for feedback before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.

## During the Session

### Challenge against the glossary

If a \`docs/context.md\` exists, read it first — it is the project's domain glossary. (Check the repo root for a legacy \`context.md\` as a fallback.) When the user uses a term that conflicts with the existing language, call it out immediately: "Your glossary defines 'X' as Y, but you seem to mean Z — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code does X, but you just said Y — which is right?"

### Update the glossary inline

When a term is resolved, update \`docs/context.md\` right there — don't batch these up. Create the file lazily at \`docs/context.md\` if it doesn't exist. The glossary is a plain project doc, not a \`.luca/\` pipeline artifact — \`docs/\` keeps it out of the strict \`.luca/\` contract and out of repo-root markdown debris.

Don't couple the glossary to implementation details. Only include terms meaningful to domain experts.

### Offer ADRs sparingly

Only offer to create an ADR when **all three** are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR.
`

export const grillMeSkill = defineSkill({
    name: "grill-me",
    description: "Interview the user relentlessly about a plan or design until reaching shared understanding. Walks each branch of the decision tree, resolving dependencies one-by-one. Updates docs/CONTEXT.md and offers ADRs when decisions crystallize. Use when user says \"grill me\", \"stress-test this plan\", \"poke holes\", \"challenge my design\", or invokes /grill-me.",
    body: BODY,
})
