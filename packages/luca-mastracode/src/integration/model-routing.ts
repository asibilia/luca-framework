/**
 * Complexity-aware model routing for Luca's Mastra Code distribution.
 *
 * Ported from `src/complexity/__helpers/model-routing.ts`.
 * Maps (subagent type, complexity level, profile) → Mastra model ID string.
 */
import type { ComplexityLevel, ProfileLevel } from '../state/state.js'

// ---------------------------------------------------------------------------
// Model tier → Mastra model ID mapping
// ---------------------------------------------------------------------------

export type ModelTier = 'fast' | 'balanced' | 'capable'

const MODEL_IDS: Record<ModelTier, string> = {
    fast: 'anthropic/claude-haiku-4-5',
    balanced: 'anthropic/claude-sonnet-4-6',
    capable: 'anthropic/claude-opus-4-7',
}

// ---------------------------------------------------------------------------
// Routing presets — complexity → model tier ramp
// ---------------------------------------------------------------------------

type RoutingRow = Record<ComplexityLevel, ModelTier>

const ALWAYS_FAST: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'fast',
    MODERATE: 'fast',
    COMPLEX: 'fast',
    CRITICAL: 'fast',
}

const FAST_PROMOTED: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'fast',
    MODERATE: 'fast',
    COMPLEX: 'fast',
    CRITICAL: 'balanced',
}

const ROUTER: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'fast',
    MODERATE: 'balanced',
    COMPLEX: 'balanced',
    CRITICAL: 'balanced',
}

const ORCHESTRATOR: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'balanced',
    MODERATE: 'balanced',
    COMPLEX: 'capable',
    CRITICAL: 'capable',
}

const DEEP_ANALYSIS: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'balanced',
    MODERATE: 'capable',
    COMPLEX: 'capable',
    CRITICAL: 'capable',
}

const DEFAULT_ROW: RoutingRow = {
    TRIVIAL: 'fast',
    SIMPLE: 'fast',
    MODERATE: 'balanced',
    COMPLEX: 'capable',
    CRITICAL: 'capable',
}

// ---------------------------------------------------------------------------
// Agent → routing preset mapping
// ---------------------------------------------------------------------------

const AGENT_ROUTING: Record<string, RoutingRow> = {
    // Classifier
    'lu-cognition': ALWAYS_FAST,

    // Fast-promoted
    'lu-learner': FAST_PROMOTED,
    'shadow-scanner': FAST_PROMOTED,
    'lu-verifier-fast': FAST_PROMOTED,
    'lu-process-data': FAST_PROMOTED,

    // Router
    'lu-architecture-researcher': ROUTER,
    'lu-implementation-researcher': ROUTER,
    'lu-ecosystem-researcher': ROUTER,
    'lu-risk-researcher': ROUTER,
    'lu-reassessor': ROUTER,

    // Orchestrator
    'lu-executor': ORCHESTRATOR,
    'lu-planner': ORCHESTRATOR,
    'lu-pm-planner': ORCHESTRATOR,
    'lu-plan-checker': ORCHESTRATOR,
    'lu-discuss-researcher': ORCHESTRATOR,
    'lu-research-synthesizer': ORCHESTRATOR,
    'lu-phase-researcher': ORCHESTRATOR,
    'lu-research-graduator': ORCHESTRATOR,

    // Deep analysis
    'lu-reviewer': ORCHESTRATOR,
    'lu-verifier': DEEP_ANALYSIS,
    'lu-premortem': DEEP_ANALYSIS,
    'code-architect': DEEP_ANALYSIS,
    'dx-advocate': DEEP_ANALYSIS,
    'code-simplifier': DEEP_ANALYSIS,
    'security-auditor': DEEP_ANALYSIS,
    'lu-completeness-reviewer': DEEP_ANALYSIS,
    'lu-accuracy-reviewer': DEEP_ANALYSIS,
    'lu-actionability-reviewer': DEEP_ANALYSIS,
}

// ---------------------------------------------------------------------------
// Profile-aware tier adjustment
// ---------------------------------------------------------------------------

/** Agents protected from budget demotion. */
const PROTECTED_AGENTS = new Set([
    'lu-executor',
    'lu-discuss-researcher',
    'code-architect',
    'dx-advocate',
    'security-auditor',
    'code-simplifier',
    'lu-learner',
])

const TIER_ORDER: ReadonlyArray<ModelTier> = ['fast', 'balanced', 'capable']

function adjustTier({
    tier,
    profile,
    agentName,
}: {
    tier: ModelTier
    profile: ProfileLevel
    agentName: string
}): ModelTier {
    if (profile === 'balanced') return tier

    const idx = TIER_ORDER.indexOf(tier)

    if (profile === 'quality') {
        return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)] as ModelTier
    }

    // budget — demote unless protected
    if (PROTECTED_AGENTS.has(agentName)) return tier
    return TIER_ORDER[Math.max(idx - 1, 0)] as ModelTier
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a Mastra model ID for a given subagent type at a complexity/profile.
 *
 * @example
 * resolveModel({ subagentType: 'lu-executor', complexity: 'CRITICAL', profile: 'balanced' })
 * // → 'anthropic/claude-opus-4-7'
 */
export function resolveModel({
    subagentType,
    complexity,
    profile = 'balanced',
}: {
    subagentType: string
    complexity: ComplexityLevel
    profile?: ProfileLevel
}): string {
    const row = AGENT_ROUTING[subagentType] ?? DEFAULT_ROW
    const baseTier = row[complexity]
    const adjustedTier = adjustTier({
        tier: baseTier,
        profile,
        agentName: subagentType,
    })
    return MODEL_IDS[adjustedTier]
}

/**
 * Get the Mastra model ID string for a given tier.
 */
export function modelIdForTier(tier: ModelTier): string {
    return MODEL_IDS[tier]
}

/**
 * Exported presets for observability.
 */
export const ROUTING_PRESETS = {
    ALWAYS_FAST,
    FAST_PROMOTED,
    ROUTER,
    ORCHESTRATOR,
    DEEP_ANALYSIS,
} as const
