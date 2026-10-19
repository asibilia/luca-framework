import { z } from 'zod'

import type { AgentRole } from '../agents/role-results'
import {
    ModelNameSchema,
    modelsOf,
    ROUTED_ROLES,
    type EngineConfig,
    type ModelName,
    type ModelsConfig,
} from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'

/**
 * Which model each fresh agent launches on (#603): the pick rule, and the
 * decision model's answer it reads from the journal.
 */

/**
 * Why an agent launched on its model:
 * - `locked`: a reviewer, a lens, or a final-review fixer, always Opus.
 * - `floor`: its role's floor is Opus.
 * - `no_answer`: the decision model gave no answer (off, timed out,
 *   errored, or the ask was skipped).
 * - `unsure`: its confidence was below the bar or missing, or it picked a
 *   model the ask didn't offer.
 * - `decision_model`: the decision model's pick.
 */
export const ModelReasonSchema = z.enum([
    'locked',
    'floor',
    'no_answer',
    'unsure',
    'decision_model',
])

export type ModelReason = z.infer<typeof ModelReasonSchema>

/** The model an agent launches on, and why. */
export type ModelPick = { model: ModelName; model_reason: ModelReason }

/** Reviewers, lenses, and the final review's fixers: always Opus. */
export const LOCKED_PICK: ModelPick = { model: 'opus', model_reason: 'locked' }

export type RoutedRole = (typeof ROUTED_ROLES)[number]

/** Whether a role has a model floor, so the decision model may pick its model. */
export const isRoutedRole = (role: string): role is RoutedRole =>
    (ROUTED_ROLES as readonly string[]).includes(role)

/**
 * The models an `agent_model` ask offers for a role with this floor: the
 * floor and every stronger one. A floor of `opus` offers all three, since
 * that ask is shadow only.
 *
 * @example
 * offeredModels({ floor: 'sonnet' }) // ['opus', 'sonnet']
 */
export const offeredModels = ({ floor }: { floor: ModelName }): ModelName[] => {
    const all = ModelNameSchema.options
    return floor === 'opus' ? [...all] : all.slice(0, all.indexOf(floor) + 1)
}

/** The decision model's answer to an `agent_model` ask, and what it offered. */
export type ModelAnswer = {
    offered: string[]
    pick: string | number | null
    confidence: number | null
}

/**
 * The model a fresh agent launches on. Pure; the first match wins: a
 * reviewer or lens is `locked`; a floor of `opus` is `floor`; no answer is
 * `no_answer`; an answer below the bar, with no confidence, or not offered
 * is `unsure`; else the decision model's pick. Every fallback is Opus.
 *
 * @example
 * pickModel({ role: 'test-writer', models, answer: { offered: ['sonnet', 'opus'], pick: 'sonnet', confidence: 0.9 } })
 * // { model: 'sonnet', model_reason: 'decision_model' } with a sonnet floor and the 0.8 bar
 */
export const pickModel = ({
    role,
    models,
    answer,
}: {
    role: AgentRole
    models: ModelsConfig
    answer: ModelAnswer | null
}): ModelPick => {
    if (!isRoutedRole(role)) return LOCKED_PICK
    if (models.floors[role] === 'opus') {
        return { model: 'opus', model_reason: 'floor' }
    }
    if (answer === null) return { model: 'opus', model_reason: 'no_answer' }
    const pick = ModelNameSchema.safeParse(answer.pick)
    if (
        !pick.success ||
        !answer.offered.includes(pick.data) ||
        answer.confidence === null ||
        answer.confidence < models.confidence_bar
    ) {
        return { model: 'opus', model_reason: 'unsure' }
    }
    return { model: pick.data, model_reason: 'decision_model' }
}

/**
 * The answer to the `agent_model` ask journaled for this agent since its
 * role's last start on the ticket, or `null` with none: no ask (the decision
 * model is off, or the ask was skipped), or an ask that failed.
 */
export const modelAnswerOf = ({
    records,
    ticket,
    role,
}: {
    records: JournalRecord[]
    ticket: number | null
    role: AgentRole
}): ModelAnswer | null => {
    const lastStart = records.findLastIndex(
        (record) =>
            record.kind === 'agent_started' &&
            record.ticket === ticket &&
            record.role === role
    )
    const asked = records
        .slice(lastStart + 1)
        .findLast(
            (record) =>
                record.kind === 'jev_asked' &&
                record.content.job === 'agent_model' &&
                record.ticket === ticket &&
                record.role === role
        )
    if (asked?.kind !== 'jev_asked') return null
    const answered = records.find(
        (record) =>
            record.kind === 'jev_answered' &&
            record.content.asked_seq === asked.seq
    )
    if (answered?.kind !== 'jev_answered') return null
    const answer = answered.content.answers.model
    if (answer === undefined) return null
    const question = asked.content.request.questions.model
    return {
        offered:
            question?.type === 'choice' ? Object.keys(question.criteria) : [],
        pick: answer.value,
        confidence: answer.confidence,
    }
}

/**
 * The model a fresh agent launches on, from the run's config and the
 * answer the launch step just journaled.
 */
export const launchPick = ({
    records,
    config,
    ticket,
    role,
}: {
    records: JournalRecord[]
    config: EngineConfig
    ticket: number | null
    role: AgentRole
}): ModelPick =>
    pickModel({
        role,
        models: modelsOf({ config }),
        answer: modelAnswerOf({ records, ticket, role }),
    })
