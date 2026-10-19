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
 * - `after_failure`: its role already failed a try on its ticket on a
 *   cheaper model (#604).
 * - `floor`: its role's floor is Opus.
 * - `no_answer`: the decision model gave no answer (off, timed out,
 *   errored, or the ask was skipped).
 * - `unsure`: its confidence was below the bar or missing, or it picked a
 *   model the ask didn't offer.
 * - `decision_model`: the decision model's pick.
 */
export const ModelReasonSchema = z.enum([
    'locked',
    'after_failure',
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
 * reviewer or lens is `locked`; a role that failed a try on its ticket on a
 * cheaper model is `after_failure`; a floor of `opus` is `floor`; no answer
 * is `no_answer`; an answer below the bar, with no confidence, or not
 * offered is `unsure`; else the decision model's pick. Every fallback is
 * Opus.
 *
 * @example
 * pickModel({ role: 'test-writer', models, failed_cheaper: false, answer: { offered: ['sonnet', 'opus'], pick: 'sonnet', confidence: 0.9 } })
 * // { model: 'sonnet', model_reason: 'decision_model' } with a sonnet floor and the 0.8 bar
 */
export const pickModel = ({
    role,
    models,
    failed_cheaper,
    answer,
}: {
    role: AgentRole
    models: ModelsConfig
    /** Whether the role already failed a try on its ticket on a cheaper model. */
    failed_cheaper: boolean
    answer: ModelAnswer | null
}): ModelPick => {
    if (!isRoutedRole(role)) return LOCKED_PICK
    if (failed_cheaper) return { model: 'opus', model_reason: 'after_failure' }
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
 * Whether this role failed a try on this ticket on a model cheaper than
 * Opus (#604): a failure the decision step counts as a try (not an
 * `engine` one, so a crashed SDK doesn't count), in a turn whose
 * `agent_started` named a model other than `opus`.
 */
export const failedCheaper = ({
    records,
    ticket,
    role,
}: {
    records: JournalRecord[]
    ticket: number | null
    role: string
}): boolean => {
    let model: string | null = null
    for (const record of records) {
        if (record.ticket !== ticket) continue
        if (record.kind === 'agent_started' && record.content.role === role) {
            model = record.content.model
        }
        const failed =
            (record.kind === 'agent_failed' &&
                record.content.role === role &&
                record.content.failure !== 'engine') ||
            (record.kind === 'already_done_checked' &&
                !record.content.ok &&
                role === 'test-writer')
        if (failed && model !== null && model !== 'opus') return true
    }
    return false
}

/**
 * The model a launch step's earlier try journaled before a crash cut it
 * off, so its redo launches on it again (#604); `null` if none did.
 *
 * @param first_seq - The seq of the step's first try.
 */
export const redonePick = ({
    records,
    first_seq,
    ticket,
    role,
}: {
    records: JournalRecord[]
    first_seq: number
    ticket: number | null
    role: string
}): ModelPick | null => {
    const started = records.findLast(
        (record) =>
            record.seq >= first_seq &&
            record.kind === 'agent_started' &&
            record.ticket === ticket &&
            record.content.role === role
    )
    if (started?.kind !== 'agent_started') return null
    const model = ModelNameSchema.safeParse(started.content.model)
    const { model_reason } = started.content
    if (!model.success || model_reason === null) return null
    return { model: model.data, model_reason }
}

/** Which try of its step a launch is: a redo names its first try's seq. */
export type LaunchTry = { first_seq: number; redo: boolean }

/**
 * Whether a fresh agent's launch asks the decision model for its model: not
 * after its role failed a try on a cheaper model, and not on a redo whose
 * first try journaled its model.
 */
export const asksModel = ({
    records,
    ticket,
    role,
    step,
}: {
    records: JournalRecord[]
    ticket: number | null
    role: string
    step: LaunchTry | undefined
}): boolean =>
    !(
        (step?.redo === true &&
            redonePick({ records, first_seq: step.first_seq, ticket, role }) !==
                null) ||
        failedCheaper({ records, ticket, role })
    )

/**
 * The model a fresh agent launches on, from the run's config and the
 * answer the launch step just journaled. A redo launches on the model its
 * first try journaled.
 */
export const launchPick = ({
    records,
    config,
    ticket,
    role,
    step,
}: {
    records: JournalRecord[]
    config: EngineConfig
    ticket: number | null
    role: AgentRole
    step: LaunchTry
}): ModelPick =>
    (step.redo
        ? redonePick({ records, first_seq: step.first_seq, ticket, role })
        : null) ??
    pickModel({
        role,
        models: modelsOf({ config }),
        failed_cheaper: failedCheaper({ records, ticket, role }),
        answer: modelAnswerOf({ records, ticket, role }),
    })
