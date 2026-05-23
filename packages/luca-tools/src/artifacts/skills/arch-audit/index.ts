/**
 * arch-audit skill — Find deepening opportunities — shallow modules, premature abstractions, misplaced seams. Uses the deletion test and promotion model to surface architectural friction. Use when user says "audit architecture", "find refactoring opportunities", "what's shallow", "improve structure", or invokes /arch-audit.
 *
 * Ported from ~/.claude/skills/arch-audit/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# arch-audit

Surface architectural friction and propose deepening opportunities — refactors that turn shallow modules into deep ones, improve testability, and increase locality of change.

## Vocabulary

Use these terms exactly in every finding. Consistent language prevents drift into vague terms like "component," "service," or "boundary."

- **Module** — anything with an interface and implementation (function, class, file, package). Scale-agnostic.
- **Interface** — what a caller must know: types, invariants, error modes, ordering. Not just the type signature.
- **Depth** — leverage at the interface. **Deep** = significant behavior behind a small interface. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where behavior can be altered without editing in place. A boundary that accepts different adapters.
- **Deletion test** — imagine deleting the module. Complexity vanishes → pass-through (shallow). Complexity reappears across callers → earning its keep (deep).
- **Promotion tier** — where code lives based on caller count. Tier 1 (single caller, private). Tier 2 (shared within feature). Tier 3 (shared across features).

## Step 1: Recall architectural context

Query MuninnDB for past decisions so you don't re-suggest rejected refactors:

\`\`\`
mcp__muninn__muninn_recall({
  vault: "<repo_vault>",
  context: ["architectural decisions", "rejected refactors", "module structure"],
  tags: ["decision"],
  limit: 15
})
\`\`\`

Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`.

If a \`docs/context.md\` exists, read it for project constraints and domain terminology (check the repo root for a legacy \`context.md\` as a fallback).

**Guard**: if a past decision explicitly rejected a refactor you'd otherwise suggest, skip it. Only resurface if friction has materially worsened since the decision was recorded.

## Step 2: Explore for friction

Spawn one or more codebase-exploration subagents (the \`Explore\` agent, via the \`Agent\` tool) to walk the codebase. Provide this brief:

> Walk the codebase and report friction. Look for:
>
> 1. **Shallow modules** — interface nearly as complex as implementation. Apply the deletion test: would removing this module concentrate complexity (earning its keep) or just redistribute it (pass-through)?
> 2. **Concept bouncing** — understanding one concept requires reading across many small files
> 3. **Premature abstractions** — interfaces/abstract types with a single implementation
> 4. **Leaked coupling** — tightly-coupled modules that share internal details across their seam
> 5. **Misplaced code** — helpers/utilities at promotion tier 3 (shared across features) that have only 1-2 callers
> 6. **Untestable surfaces** — code that's hard to test through its current public interface
>
> For each finding, report: file path, what the friction is, deletion test result (if applicable), caller count.

If the codebase is large, scope the exploration to specific areas the user mentions, or split into multiple focused subagents (e.g., one per package in a monorepo).

Do NOT follow rigid heuristics. Explore organically. Note where you experience friction — where understanding breaks down, where you bounce between files, where interfaces feel heavier than what they hide.

## Step 3: Present deepening candidates

Synthesize subagent findings into a numbered list of **deepening opportunities**. For each candidate:

\`\`\`
### <N>. <Short description>

- **Files**: <paths involved>
- **Problem**: <what the friction is — use vocabulary precisely>
- **Deletion test**: <result — "vanishes" or "reappears across N callers">
- **Promotion check**: <current tier vs appropriate tier based on caller count>
- **Proposed direction**: <one sentence — what "deeper" looks like here>
- **Risk**: <what could go wrong if refactored>
\`\`\`

Order by impact (most friction first). Limit to 5-7 candidates — more than that is noise.

**Do NOT propose interfaces or implementations yet.** Present candidates only.

Ask: "Which of these would you like to explore?"

## Step 4: Design alternatives (design-it-twice)

For the candidate the user selects:

1. **Frame the problem** — write a short explanation for the user:
   - What constraints any new interface must satisfy
   - What dependencies exist and their nature
   - A rough illustrative sketch (not a proposal — just grounding)

2. **Spawn 2-3 \`Explore\` / \`Plan\` subagents in parallel** (via the \`Agent\` tool) — each must produce a *radically different* interface design for the deepened module. Brief each subagent with:
   - File paths and current coupling
   - Caller list and their expectations
   - The vocabulary (Module, Interface, Depth, Seam)
   - Constraint: "Your design must be fundamentally different from the others"

3. **Present designs sequentially** — let the user absorb each one:
   - Interface signature (public surface)
   - Usage example (how callers use it)
   - What it hides (complexity kept internal)
   - Trade-offs (what this design makes easy vs hard)

4. **Compare and recommend** — contrast by:
   - Depth (leverage at the interface)
   - Locality (where change concentrates)
   - Seam placement (where behavior can be swapped)
   - Testability (how easy to test through the interface)

   Give your recommendation. If elements from different designs combine well, propose a hybrid.

5. **User decides** — they pick a design (or request iteration).

## Step 5: Record the outcome

After the user decides, store the result in MuninnDB.

**If the refactor is accepted:**

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "decision:arch-audit-<descriptive-slug>",
  content: "Accepted deepening: <what was refactored, which design was chosen, why>. Files: <paths>. Date: <ISO>.",
  tags: ["decision", "architecture", "refactor"]
})
\`\`\`

Capture the returned id and promote this user-confirmed decision to the verified tier: \`mcp__muninn__muninn_trust({ id: <returned-id>, trust: "verified", vault: "<repo_vault>" })\`.

**If the refactor is rejected:**

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "decision:arch-audit-rejected-<descriptive-slug>",
  content: "Rejected deepening of <module>. Reason: <user's reason>. Friction level at time of rejection: <description>. Re-evaluate if: <conditions that would change the decision>.",
  tags: ["decision", "architecture", "rejected"]
})
\`\`\`

Capture the returned id and promote it to the verified tier: \`mcp__muninn__muninn_trust({ id: <returned-id>, trust: "verified", vault: "<repo_vault>" })\`.

The rejected decision prevents re-suggestion on future runs (Step 1 guard).

Note: \`decision:*\` memories are project-scoped — they route to the **repo** vault.

## Step 6: Plan the refactor (optional)

If the user wants to proceed with implementation:

- Ask: "Want me to create a plan for this refactor, or do it directly?"
- If plan → suggest invoking \`/lu\` with the chosen design as context
- If direct → proceed with implementation in the current session

The chosen interface from Step 4 becomes the first test's target (interface-first task boundaries).

## Behavioral Notes

- **This is ad-hoc** — invoked when the user feels friction, not on a schedule
- **No file dependencies** — everything lives in MuninnDB or is inlined in this skill
- **Scope** — if the user doesn't specify an area, ask before exploring the entire codebase. For monorepos, start with one package.
- **Vocabulary discipline** — use Module/Interface/Depth/Seam/Deletion Test consistently. Don't drift into "component," "service," "API," "boundary," "layer."
- **Don't be prescriptive about tooling** — the skill identifies friction and proposes designs. It doesn't force a specific architecture style (DDD, hexagonal, etc.) unless the project already uses one.
`

export const archAuditSkill = defineSkill({
    name: "arch-audit",
    description: "Find deepening opportunities — shallow modules, premature abstractions, misplaced seams. Uses the deletion test and promotion model to surface architectural friction. Use when user says \"audit architecture\", \"find refactoring opportunities\", \"what's shallow\", \"improve structure\", or invokes /arch-audit.",
    body: BODY,
})
