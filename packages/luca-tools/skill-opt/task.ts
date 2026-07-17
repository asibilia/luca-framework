/**
 * The Task interface — what makes the SkillOpt loop reusable across skills.
 *
 * The loop (rollout → reflect → bounded edit → gate) is skill-agnostic. What
 * varies per skill is: the corpus, the seed skill body, how one item is scored
 * into a reward, the analyst prompt, and how a bad rollout is described back to
 * the analyst. A Task supplies exactly those. Adding a new SkillOpt target =
 * writing one Task, no loop changes.
 */
import type { ChatFn } from './backend.ts'
import type { Split } from './types.ts'

export type BaseItem = { id: string; split: Split }

/** One scored rollout: a reward in [-1, 1] plus a line for the analyst. */
export type ScoredItem = {
    reward: number
    /** Human-readable summary of this rollout for the reflect prompt. */
    detail: string
    /** Optional exact-correct flag, for accuracy-style report metrics. */
    pass?: boolean
}

export type ReportMetric = {
    label: string
    /** Compute a headline string (e.g. exact-match accuracy) from scored splits. */
    value: (scoredBySplit: Map<Split, ScoredItem[]>) => string
}

export type Task<I extends BaseItem, Ctx = unknown> = {
    name: string
    loadCorpus: () => Promise<I[]>
    /** The skill body under optimization (the live, shipping skill text). */
    seedSkill: () => Promise<string>
    /** One-time precomputation (e.g. cache baseline answers). Ctx feeds score. */
    prepare: (
        chat: ChatFn,
        corpus: I[],
        cachePath: string,
        log: (m: string) => void
    ) => Promise<Ctx>
    /** Roll out and score ONE item under a candidate skill body. */
    score: (chat: ChatFn, body: string, item: I, ctx: Ctx) => Promise<ScoredItem>
    /** Task-specific analyst system prompt (failure analysis → bounded edits). */
    analystSystem: string
    /** Render one worst-scoring rollout for the analyst prompt. */
    renderWorst: (item: I, scored: ScoredItem) => string
    /** Optional headline metric shown in the report. */
    reportMetric?: ReportMetric
}

export function meanReward(scored: ScoredItem[]): number {
    if (scored.length === 0) return 0
    return scored.reduce((sum, r) => sum + r.reward, 0) / scored.length
}

const GATE_EPS = 1e-6

/** Strict validation gate: accept a candidate only on a real improvement. */
export function gateAccepts(candidate: number, current: number): boolean {
    return candidate > current + GATE_EPS
}
