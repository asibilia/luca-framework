/**
 * The SkillOpt training loop, generic over a Task:
 *
 *   rollout(train) → reflect(worst) → bounded edits → gate(val) → accept/reject
 *
 * - VAL/TEST are k-averaged (`evalRollouts`) to damp backend nondeterminism;
 *   TRAIN uses a single rollout (it only selects which items to reflect on).
 * - All rollouts in a pass run with bounded concurrency.
 * - A candidate is accepted only when its mean VAL reward strictly beats the
 *   current skill (unless the gate is disabled). TEST is scored once at the end
 *   for both seed and best, so the reported lift is honest.
 */
import type { ChatFn } from './backend.ts'
import type { Edit, Split } from './types.ts'
import type { BaseItem, ScoredItem, Task } from './task.ts'
import { gateAccepts, meanReward } from './task.ts'
import { pMap } from './pmap.ts'
import { reflect } from './reflect.ts'
import { applyEdits } from './apply-edits.ts'

export type LoopConfig<I extends BaseItem, Ctx> = {
    task: Task<I, Ctx>
    chat: ChatFn
    epochs: number
    editBudget: number
    minibatch: number
    gate: boolean
    /** k rollouts per item on VAL/TEST, averaged. */
    evalRollouts: number
    concurrency: number
    cachePath: string
    log: (msg: string) => void
}

export type EpochRecord = {
    epoch: number
    candidateValScore: number
    currentValScore: number
    accepted: boolean
    appliedEdits: Edit[]
    skippedEdits: Edit[]
    reasoning: string
}

export type LoopResult = {
    seedValScore: number
    bestValScore: number
    seedTestScore: number
    bestTestScore: number
    seedTestScored: ScoredItem[]
    bestTestScored: ScoredItem[]
    bestSkill: string
    epochs: EpochRecord[]
    rejected: Edit[]
}

/** Score a split with k rollouts per item, aggregated by mean reward. */
async function scoreSet<I extends BaseItem, Ctx>(
    task: Task<I, Ctx>,
    chat: ChatFn,
    body: string,
    items: I[],
    ctx: Ctx,
    k: number,
    concurrency: number
): Promise<ScoredItem[]> {
    // Flatten (item × replicate) so items and replicates share the pool.
    const jobs = items.flatMap((item, idx) =>
        Array.from({ length: k }, () => ({ item, idx }))
    )
    const raw = await pMap(
        jobs,
        async (job) => {
            try {
                return await task.score(chat, body, job.item, ctx)
            } catch (err) {
                // A rollout that fails even after backend retries degrades to a
                // sentinel rather than aborting the whole run.
                console.error(`[skill-opt] rollout failed (${job.item.id}): ${String(err).slice(0, 160)}`)
                return { reward: -1, detail: `rollout error: ${job.item.id}`, pass: false }
            }
        },
        concurrency
    )

    return items.map((_, idx) => {
        const runs = raw.filter((_r, n) => jobs[n]?.idx === idx)
        const reward = runs.reduce((s, r) => s + r.reward, 0) / runs.length
        const passes = runs.filter((r) => r.pass).length
        return {
            reward,
            detail: runs[0]?.detail ?? '',
            pass: passes > runs.length / 2,
        }
    })
}

export async function runLoop<I extends BaseItem, Ctx>(
    cfg: LoopConfig<I, Ctx>
): Promise<LoopResult> {
    const { task, chat, log, evalRollouts: k, concurrency } = cfg

    const corpus = await task.loadCorpus()
    const bySplit = (s: Split) => corpus.filter((i) => i.split === s)
    const train = bySplit('train')
    const val = bySplit('val')
    const test = bySplit('test')

    const ctx = await task.prepare(chat, corpus, cfg.cachePath, log)

    const seed = await task.seedSkill()
    let current = seed
    let currentValScore = meanReward(
        await scoreSet(task, chat, current, val, ctx, k, concurrency)
    )
    const seedValScore = currentValScore
    log(`seed VAL reward: ${seedValScore.toFixed(3)}`)

    const epochs: EpochRecord[] = []
    const rejected: Edit[] = []

    for (let e = 1; e <= cfg.epochs; e++) {
        const trainScored = await scoreSet(task, chat, current, train, ctx, 1, concurrency)
        const worst = train
            .map((item, i) => ({ item, scored: trainScored[i] }))
            .filter((x): x is { item: I; scored: ScoredItem } => x.scored !== undefined)
            .sort((a, b) => a.scored.reward - b.scored.reward)
            .slice(0, cfg.minibatch)

        const patch = await reflect(
            chat,
            task.analystSystem,
            current,
            worst.map((w) => task.renderWorst(w.item, w.scored)),
            cfg.editBudget
        )
        const { body: candidate, applied, skipped } = applyEdits(current, patch.edits)

        if (applied.length === 0) {
            log(`epoch ${e}: no applicable edits — skipping`)
            epochs.push({
                epoch: e,
                candidateValScore: currentValScore,
                currentValScore,
                accepted: false,
                appliedEdits: [],
                skippedEdits: skipped,
                reasoning: patch.reasoning,
            })
            continue
        }

        const valBefore = currentValScore
        const candidateValScore = meanReward(
            await scoreSet(task, chat, candidate, val, ctx, k, concurrency)
        )
        const accepted = !cfg.gate || gateAccepts(candidateValScore, currentValScore)

        log(
            `epoch ${e}: ${applied.length} edit(s), VAL ${valBefore.toFixed(3)} → ` +
                `${candidateValScore.toFixed(3)} ⇒ ${accepted ? 'ACCEPT' : 'REJECT'}`
        )

        if (accepted) {
            current = candidate
            currentValScore = candidateValScore
        } else {
            rejected.push(...applied)
        }

        epochs.push({
            epoch: e,
            candidateValScore,
            currentValScore: valBefore,
            accepted,
            appliedEdits: applied,
            skippedEdits: skipped,
            reasoning: patch.reasoning,
        })
    }

    const seedTestScored = await scoreSet(task, chat, seed, test, ctx, k, concurrency)
    const bestTestScored = await scoreSet(task, chat, current, test, ctx, k, concurrency)

    return {
        seedValScore,
        bestValScore: currentValScore,
        seedTestScore: meanReward(seedTestScored),
        bestTestScore: meanReward(bestTestScored),
        seedTestScored,
        bestTestScored,
        bestSkill: current,
        epochs,
        rejected,
    }
}
