/**
 * Complexity-classification task — optimize the triage "classify complexity"
 * instruction. The target reads a development request and must output one of
 * five levels. Grading is EXACT-MATCH on the label (with ordinal partial
 * credit), so there is no LLM judge and far less noise than caveman.
 *
 * reward = pred == gold ? 1 : clamp(1 − |rank(pred) − rank(gold)| × 0.5, −1, 1)
 * (unparseable → −1). "pass" (for the accuracy metric) is exact match only.
 */
import { z } from 'zod'
import type { ScoredItem, Task } from '../task.ts'
import type { Split } from '../types.ts'
import { SplitSchema } from '../types.ts'
import { loadJsonl } from '../load-jsonl.ts'

const LEVELS = ['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'] as const
type Level = (typeof LEVELS)[number]

const ComplexityItemSchema = z.object({
    id: z.string().min(1),
    split: SplitSchema,
    question: z.string().min(1),
    label: z.enum(LEVELS),
})
type ComplexityItem = z.infer<typeof ComplexityItemSchema>

/** Faithful standalone port of the triage complexity rubric (triage.ts). */
const SEED_SKILL = `# Classify Complexity

Classify a development request into exactly one level.

| Level        | Description                                          | Examples                                      |
| ------------ | ---------------------------------------------------- | --------------------------------------------- |
| **TRIVIAL**  | Single-file, mechanical change. No design decisions. | Fix a typo, update a version, rename a symbol |
| **SIMPLE**   | Small, well-scoped change. Minimal risk.             | Add a utility function, fix a known bug       |
| **MODERATE** | Multi-file change requiring research or design.      | Add a new API endpoint, refactor a module     |
| **COMPLEX**  | Cross-cutting change with architectural implications.| New subsystem, major refactor, migration      |
| **CRITICAL** | High-risk change to core infrastructure or data.     | Auth system changes, data model migration     |

## Signals

- 1 file → TRIVIAL/SIMPLE; 5+ → MODERATE+; 10+ → COMPLEX+.
- Cascading dependencies, new test infrastructure, deep domain knowledge → increase complexity.
- Hard-to-reverse changes (DB migrations, API contracts) → COMPLEX/CRITICAL.

When uncertain, err toward the higher level.`

function rank(level: Level): number {
    return LEVELS.indexOf(level)
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x))
}

/** Pull the first level token out of a model response. */
function parseLevel(text: string): Level | null {
    const upper = text.toUpperCase()
    let best: { level: Level; at: number } | null = null
    for (const level of LEVELS) {
        const at = upper.indexOf(level)
        if (at !== -1 && (best === null || at < best.at)) best = { level, at }
    }
    return best?.level ?? null
}

const ANALYST_SYSTEM = `You are a failure-analysis agent for a complexity-CLASSIFICATION skill.

The skill instructs a target model to label a development request as exactly one of:
TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL.

You receive the current skill and a batch of the WORST-scoring rollouts, each showing
the request, the GOLD label, and the PREDICTED label.

Find the most COMMON systematic confusion (e.g. a fuzzy SIMPLE↔MODERATE boundary, or
under-rating hard-to-reverse changes) and propose AT MOST L bounded, generalizable
edits that sharpen the decision boundaries. Do NOT hardcode answers to specific
requests. Prefer clarifying/replacing weak guidance over always appending.

Edit ops:
- {"op":"append","content":"<markdown appended at end>"}
- {"op":"insert_after","target":"<exact existing text>","content":"<markdown>"}
- {"op":"replace","target":"<exact existing text>","content":"<replacement>"}
- {"op":"delete","target":"<exact existing text>"}

Respond ONLY with JSON (no fences):
{"reasoning":"<why these edits fix the confusion>","edits":[ ... ]}`

export const complexityTask: Task<ComplexityItem, null> = {
    name: 'complexity',

    loadCorpus: () => loadJsonl('./corpus/complexity.jsonl', ComplexityItemSchema),

    seedSkill: async () => SEED_SKILL,

    prepare: async () => null,

    score: async (chat, body, item) => {
        const raw = await chat({
            system: body,
            user: `Request:\n${item.question}\n\nRespond with ONLY the complexity level in UPPERCASE (one word).`,
            stage: 'classify',
            skill: body,
        })
        const pred = parseLevel(raw)
        const gold = item.label as Level
        const exact = pred === gold
        const reward =
            pred === null
                ? -1
                : exact
                  ? 1
                  : clamp(1 - Math.abs(rank(pred) - rank(gold)) * 0.5, -1, 1)
        const detail = `Request: ${item.question}\nGold: ${gold} | Predicted: ${pred ?? '<unparsed>'} | Reward: ${reward.toFixed(2)}`
        return { reward, detail, pass: exact }
    },

    analystSystem: ANALYST_SYSTEM,

    renderWorst: (_item, scored) => scored.detail,

    reportMetric: {
        label: 'exact-match accuracy (TEST)',
        value: (scoredBySplit: Map<Split, ScoredItem[]>) => {
            const test = scoredBySplit.get('test') ?? []
            if (test.length === 0) return 'n/a'
            const acc = test.filter((s) => s.pass).length / test.length
            return `${(acc * 100).toFixed(1)}%`
        },
    },
}
