/**
 * Shared agent glue — string constants and assembly helpers prepended
 * to subagent and mode-agent instruction bodies.
 *
 * Mode-agents and subagents BOTH import from here. The values are
 * stable strings (no runtime branching), which keeps the rendered
 * artifact bytes deterministic — a prerequisite for the compiler's
 * idempotence guarantee.
 */
export { INPHASE_TERSENESS_DIRECTIVE } from './inphase-terseness.ts'
export { MEMORY_TIER_DISCIPLINE } from './memory-tier-discipline.ts'
export { SUBAGENT_SHARED_PREFIX } from './shared-prefix.ts'
export { VERIFICATION_DOCTRINE } from './verification-doctrine.ts'
export {
    CORE_OPERATING_RULES,
    HARD_CONSTRAINTS,
    RECENCY_REMINDERS,
    getAgentConstraints,
} from './agent-constraints.ts'
