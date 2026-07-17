/**
 * Caveman task — optimize the `caveman` skill for maximum token compression
 * without losing technical substance.
 *
 * reward = judge.pass ? clamp(1 − candidateTokens / baselineTokens, −1, 1) : −1
 *
 * A verbose, skill-free baseline answer is computed once per question and
 * cached (the reward denominator). An LLM judge gates on substance.
 */
import { z } from 'zod'
import type { ChatFn } from '../backend.ts'
import type { BaseItem, ScoredItem, Task } from '../task.ts'
import { SplitSchema, EquivalenceSchema } from '../types.ts'
import type { Equivalence } from '../types.ts'
import { estimateTokens } from '../estimate-tokens.ts'
import { extractJson } from '../json.ts'
import { loadJsonl } from '../load-jsonl.ts'
import { cavemanSkill } from '../../src/artifacts/skills/caveman/index.ts'

const CavemanItemSchema = z.object({
    id: z.string().min(1),
    split: SplitSchema,
    question: z.string().min(1),
})
type CavemanItem = z.infer<typeof CavemanItemSchema>

type Baseline = { answer: string; tokens: number }
type Ctx = Map<string, Baseline>

const BASELINE_SYSTEM =
    'You are a helpful senior engineer. Answer the technical question clearly and completely in normal prose.'

const JUDGE_SYSTEM = `You are a strict equivalence judge for technical answers.

You receive a QUESTION, a verbose REFERENCE answer, and a terse CANDIDATE answer.
Decide whether the CANDIDATE preserves ALL technical substance of the REFERENCE.

Substance = facts, numbers, code tokens, API/identifier names, and causal claims.
- Brevity, dropped pleasantries, missing articles, fragments, and terse phrasing
  are NOT substance loss — the candidate is SUPPOSED to be terse.
- A missing, altered, or wrong technical fact/value/identifier IS substance loss.

Respond ONLY with a valid JSON object (no fences):
{"pass": <true|false>, "reason": "<one short sentence>"}`

const ANALYST_SYSTEM = `You are a failure-analysis agent for a text-compression skill called "caveman".

The skill instructs a target model to answer technical questions using far fewer
tokens WITHOUT losing any technical substance. You are improving the skill document.

You receive the current skill and a batch of the WORST-scoring rollouts. Each shows
the question, token counts, compression ratio, the equivalence verdict, and reward.

Two failure modes:
- BLOAT: the caveman answer is barely shorter than baseline (low positive reward).
- SUBSTANCE LOSS: the equivalence judge FAILED (reward −1) — a fact/value/identifier
  was dropped or altered.

Identify the most COMMON pattern across the batch (not one-offs) and propose AT MOST
L bounded, generalizable edits. Do NOT hardcode answers to specific questions. Prefer
replacing/deleting weak guidance over always appending — keep the skill concise.

Edit ops:
- {"op":"append","content":"<markdown appended at end>"}
- {"op":"insert_after","target":"<exact existing text>","content":"<markdown>"}
- {"op":"replace","target":"<exact existing text>","content":"<replacement>"}
- {"op":"delete","target":"<exact existing text>"}

Respond ONLY with JSON (no fences):
{"reasoning":"<why these edits fix the batch>","edits":[ ... ]}`

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x))
}

async function readCache(path: string): Promise<Record<string, Baseline>> {
    const file = Bun.file(path)
    if (!(await file.exists())) return {}
    try {
        return JSON.parse(await file.text()) as Record<string, Baseline>
    } catch {
        return {}
    }
}

async function judge(
    chat: ChatFn,
    question: string,
    reference: string,
    candidate: string
): Promise<Equivalence> {
    const user = [
        `QUESTION:\n${question}`,
        `REFERENCE ANSWER:\n${reference}`,
        `CANDIDATE ANSWER:\n${candidate}`,
        'Does the candidate preserve all technical substance? Respond with the JSON verdict.',
    ].join('\n\n')
    const raw = await chat({ system: JUDGE_SYSTEM, user, stage: 'judge' })
    const parsed = EquivalenceSchema.safeParse(extractJson(raw))
    return parsed.success ? parsed.data : { pass: false, reason: 'unparseable judge verdict' }
}

export const cavemanTask: Task<CavemanItem, Ctx> = {
    name: 'caveman',

    loadCorpus: () => loadJsonl('./corpus/caveman.jsonl', CavemanItemSchema),

    seedSkill: async () => cavemanSkill.body,

    prepare: async (chat, corpus, cachePath, log) => {
        const cached = await readCache(cachePath)
        const ctx: Ctx = new Map()
        let computed = 0
        for (const item of corpus) {
            const hit = cached[item.id]
            if (hit) {
                ctx.set(item.id, hit)
                continue
            }
            const answer = await chat({
                system: BASELINE_SYSTEM,
                user: item.question,
                stage: 'baseline',
            })
            ctx.set(item.id, { answer, tokens: estimateTokens(answer) })
            computed++
        }
        if (computed > 0) {
            const obj: Record<string, Baseline> = {}
            for (const [id, b] of ctx) obj[id] = b
            await Bun.write(cachePath, JSON.stringify(obj, null, 2))
        }
        log(`baselines: computed ${computed}, cached ${corpus.length - computed}`)
        return ctx
    },

    score: async (chat, body, item, ctx) => {
        const baseline = ctx.get(item.id)
        if (!baseline) return { reward: 0, detail: `${item.id}: no baseline`, pass: false }
        const answer = await chat({
            system: body,
            user: item.question,
            stage: 'candidate',
            skill: body,
        })
        const tokens = estimateTokens(answer)
        const eq = await judge(chat, item.question, baseline.answer, answer)
        const ratio = tokens / baseline.tokens
        const reward = eq.pass ? clamp(1 - ratio, -1, 1) : -1
        const detail =
            `Question: ${item.question}\n` +
            `Tokens: ${tokens} / ${baseline.tokens} (ratio ${ratio.toFixed(2)})\n` +
            `Equivalence: ${eq.pass ? 'PASS' : 'FAIL'} — ${eq.reason}\n` +
            `Caveman answer: ${answer.slice(0, 300)}\n` +
            `Reward: ${reward.toFixed(3)}`
        return { reward, detail, pass: eq.pass }
    },

    analystSystem: ANALYST_SYSTEM,

    renderWorst: (_item, scored) => scored.detail,
}
