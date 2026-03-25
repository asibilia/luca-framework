/**
 * Shared prompt sections for v2 research reviewer agents.
 *
 * Provides cold isolation block and scoring protocol shared across
 * lu-completeness-reviewer, lu-accuracy-reviewer, and lu-actionability-reviewer.
 *
 * Pattern follows COLD_ISOLATION_BLOCK in cold-isolation-block.ts.
 */

/** Cold isolation block specific to research reviewers */
export const RESEARCH_REVIEWER_COLD_ISOLATION = `<context_isolation>
## Context Isolation: COLD

You operate in **cold isolation** from the research agents who produced these files.

**You receive:**
- Research files from .planning/phases/NN-name/research/
- Phase description and intent

**You do NOT receive:**
- Researcher session context or reasoning
- MuninnDB session engrams from researchers
- Any information about how the research was conducted

**Why:** Fresh perspective catches gaps that researchers are blind to.
</context_isolation>`;

/** Scoring protocol and gap severity classification */
export const RESEARCH_REVIEWER_SCORING = `<scoring>
## Scoring Protocol

Rate each dimension on a 0.0-1.0 scale:

| Score | Meaning |
|-------|---------|
| 0.0-0.3 | Fundamentally inadequate |
| 0.4-0.5 | Significant gaps |
| 0.6-0.7 | Acceptable with issues |
| 0.8-0.9 | Good quality |
| 1.0 | Excellent, no issues |

Classify gaps using severity levels:
- **CRITICAL**: Blocks planning. Must be resolved before graduation.
- **IMPORTANT**: Significantly impacts plan quality. Should be resolved.
- **MINOR**: Nice to have. Can be noted but does not block.
</scoring>`;

/** Structured output contract for gap identification */
export const RESEARCH_REVIEWER_OUTPUT_CONTRACT = `<output_contract>
## Structured Output Contract

Your review output MUST include a parseable "Gaps Identified" section using this exact format:

\`\`\`
### Gaps Identified

- G-{PREFIX}-001: [severity: CRITICAL] Description of the gap
- G-{PREFIX}-002: [severity: IMPORTANT] Description of the gap
- G-{PREFIX}-003: [severity: MINOR] Description of the gap
\`\`\`

Where {PREFIX} is your reviewer prefix:
- lu-completeness-reviewer uses: G-COMP-
- lu-accuracy-reviewer uses: G-ACC-
- lu-actionability-reviewer uses: G-ACT-

Gap IDs are stable across iterations. If a gap from iteration N-1 persists,
reuse the same ID. New gaps get the next sequential number.

Severity is mutable: a gap can be upgraded or downgraded across iterations.
The ID stays the same -- only the severity field changes.

This structured format is required for the convergence loop to parse
CRITICAL/IMPORTANT/MINOR counts and drive convergence decisions.
</output_contract>`;
