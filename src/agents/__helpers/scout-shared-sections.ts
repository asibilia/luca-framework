/**
 * Shared prompt sections for scout pipeline agents.
 *
 * Extends researcher-shared-sections with scout-specific constants
 * used across the scouting pipeline stages (ingest, relevance, research,
 * analysis, implementation research, integration, planning, graduation).
 *
 * Re-exports RESEARCHER_PHILOSOPHY and RESEARCHER_VERIFICATION_PROTOCOL
 * since scouts share the same investigation mindset and verification rigor.
 *
 * Pattern follows RESEARCHER_PHILOSOPHY in researcher-shared-sections.ts.
 */

export {
  RESEARCHER_PHILOSOPHY,
  RESEARCHER_VERIFICATION_PROTOCOL,
} from "./researcher-shared-sections";

/** Scouting pipeline purpose and stage overview */
export const SCOUT_CONTEXT = `<scout_context>
## Scout Pipeline Purpose

You are analyzing an external article about agentic development, LLM orchestration, developer tooling, or related topics for potential improvements to the Luca framework.

The scouting pipeline transforms external research into actionable framework improvements:
1. Ingest: Fetch and structure article content
2. Relevance: Quick HIGH/MEDIUM/LOW assessment against project identity
3. Research: Deep investigation of techniques and ecosystem context
4. Analysis: Framework impact assessment and gap identification
5. Implementation Research: Concrete implementation approaches
6. Integration: Cross-article cohesion and framework fit (batch)
7. Planning: Atomic todo generation with conflict detection (batch)
8. Graduation: MuninnDB engram capture for long-term learning

Your output feeds the next pipeline stage. Be precise, structured, and honest about confidence levels.
</scout_context>`;

/** How to structure findings for downstream consumption */
export const SCOUT_OUTPUT_STANDARDS = `<scout_output_standards>
## Output Standards

- Use the provided template structure exactly — downstream stages parse these documents
- Confidence levels: HIGH (verified with multiple sources), MEDIUM (single authoritative source), LOW (unverified)
- Always include source URLs for claims
- Flag uncertainty explicitly rather than omitting it
- Keep sections focused — each section has a specific downstream consumer
- Use markdown tables for structured comparisons
- Code examples must be TypeScript and follow Luca conventions (functional, Bun-first, Zod schemas)
</scout_output_standards>`;

/** Relevance assessment criteria for filtering articles */
export const SCOUT_RELEVANCE_CRITERIA = `<scout_relevance_criteria>
## Relevance to Luca Framework

**HIGH relevance — directly applicable:**
- Agentic development patterns (multi-agent orchestration, agent composition)
- LLM workflow automation (DAG execution, state machines, step enforcement)
- Developer tooling for AI-assisted coding (IDE integration, hooks, verification)
- Memory and context management systems (semantic memory, context windows, recall)
- Code generation and verification patterns (harness, testing, type checking)
- Anti-step-skipping and enforcement techniques

**MEDIUM relevance — potentially applicable:**
- General LLM application patterns that could inform Luca's architecture
- Development workflow automation (CI/CD, deployment, monitoring)
- Knowledge management and learning systems
- IDE extension development patterns

**LOW relevance — tangential:**
- Pure ML/AI research without practical application
- Platform-specific techniques for non-supported IDEs
- Enterprise workflow patterns that don't apply to solo developer + AI
- Marketing/business content about AI tools
</scout_relevance_criteria>`;

/** Key architecture files and domains for framework fit assessment */
export const SCOUT_CODEBASE_CONTEXT = `<scout_codebase_context>
## Luca Codebase Reference

When assessing framework fit, reference these key areas:

**Architecture:**
- \`.claude/rules/domain-architecture.md\` — 3 archetypes (Entity/Core/Infrastructure), 4 tiers (T0-T3)
- \`.claude/rules/module-boundary.md\` — Import direction rules, entity isolation
- \`src/workflow/\` — DAG-based workflow engine with step registry

**Agent System:**
- \`src/agents/\` — Agent definitions (general/ and luca/ subdirs)
- \`src/agents/__schemas/agent.schemas.ts\` — AgentConfig, CognitionTier, PurposeCategory
- \`src/agents/__helpers/\` — Factory functions, shared prompt blocks

**Skill System:**
- \`src/skills/\` — Skill definitions with state machines
- \`src/skills/__helpers/agent-prompts.ts\` — Shared Agent() prompt templates

**Verification:**
- \`src/harness/\` — Test/typecheck/lint/build verification runner
- \`src/workflow/__schemas/contracts/\` — Behavioral contract enforcement

**Memory:**
- MuninnDB integration — dual-vault model (repo vault + default vault)
- \`src/shared/__schemas/lu-config.schemas.ts\` — MuninnDB configuration
</scout_codebase_context>`;
