import { z } from 'zod'

import type { AgentRole } from '../agents/role-results'
import {
    DEFAULT_MODEL,
    ModelNameSchema,
    modelsOf,
    ROUTED_ROLES,
    type EngineConfig,
    type ModelName,
    type ModelsConfig,
} from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'

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
 * - `trial`: an unsure but cheaper pick that runs anyway, in a model
 *   trial's trial group (#698).
 */
export const ModelReasonSchema = z.enum([
    'locked',
    'after_failure',
    'floor',
    'no_answer',
    'unsure',
    'decision_model',
    'trial',
])

export type ModelReason = z.infer<typeof ModelReasonSchema>

/**
 * A model trial's group (#698): `trial` runs Clef's unsure but cheaper
 * pick, `control` stays on Opus.
 */
export const TrialGroupSchema = z.enum(['trial', 'control'])

export type TrialGroup = z.infer<typeof TrialGroupSchema>

/**
 * The model an agent launches on, why, and its model trial group (`null`
 * when the launch isn't eligible for a trial).
 */
export type ModelPick = {
    model: ModelName
    model_reason: ModelReason
    trial_group: TrialGroup | null
}

/** Reviewers, lenses, and the final review's fixers: always Opus. */
export const LOCKED_PICK: ModelPick = {
    model: DEFAULT_MODEL,
    model_reason: 'locked',
    trial_group: null,
}

/**
 * A launch's model trial group (#698), the same for the same key every
 * time: the first 8 hex digits of the key's SHA-256, over `0x100000000`,
 * below `share` is `trial`, else `control`.
 *
 * @example
 * trialGroupOf({ key: 'luca-20261028-202119-k6q1:697:test-writer', share: 0.5 }) // 'trial'
 */
export const trialGroupOf = ({
    key,
    share,
}: {
    key: string
    share: number
}): TrialGroup => {
    const hex = new Bun.CryptoHasher('sha256').update(key).digest('hex')
    return parseInt(hex.slice(0, 8), 16) / 0x100000000 < share
        ? 'trial'
        : 'control'
}

/**
 * The text a launch's model trial group is hashed from: the run folder's
 * name, the ticket's bare number and the role; `null` for a launch that
 * can't be in a trial (the learner, or one with no ticket).
 *
 * @example
 * trialKeyOf({ run_id: 'luca-20261028-202119-k6q1', ticket: 697, role: 'test-writer' })
 * // 'luca-20261028-202119-k6q1:697:test-writer'
 */
export const trialKeyOf = ({
    run_id,
    ticket,
    role,
}: {
    run_id: string
    ticket: number | null
    role: AgentRole
}): string | null =>
    ticket === null || (role !== 'test-writer' && role !== 'implementer')
        ? null
        : `${run_id}:${ticket}:${role}`

export type RoutedRole = (typeof ROUTED_ROLES)[number]

/** Whether a role has a model floor, so the decision model may pick its model. */
export const isRoutedRole = (role: string): role is RoutedRole =>
    ROUTED_ROLES.some((routed) => routed === role)

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
 * An `unsure` pick is in a model trial (#698) when `trial_share` is above
 * 0, the launch has a `trial_key`, its only fault is a confidence below
 * the bar, and it picked an offered model at or above the floor and
 * cheaper than Opus: its trial group runs the pick as `trial`, its control
 * group stays on Opus as `unsure`.
 *
 * @example
 * pickModel({ role: 'test-writer', models, failed_cheaper: false, answer: { offered: ['sonnet', 'opus'], pick: 'sonnet', confidence: 0.9 }, trial_key: null })
 * // { model: 'sonnet', model_reason: 'decision_model', trial_group: null } with a sonnet floor and the 0.5 bar
 */
export const pickModel = ({
    role,
    models,
    failed_cheaper,
    answer,
    trial_key,
}: {
    role: AgentRole
    models: ModelsConfig
    /** Whether the role already failed a try on its ticket on a cheaper model. */
    failed_cheaper: boolean
    answer: ModelAnswer | null
    /** The text hashed for the trial group; `null` if it can't be in one. */
    trial_key: string | null
}): ModelPick => {
    const opus = (model_reason: ModelReason): ModelPick => ({
        model: 'opus',
        model_reason,
        trial_group: null,
    })
    if (!isRoutedRole(role)) return LOCKED_PICK
    if (failed_cheaper) return opus('after_failure')
    const floor = models.floors[role]
    if (floor === 'opus') return opus('floor')
    if (answer === null) return opus('no_answer')
    const pick = ModelNameSchema.safeParse(answer.pick)
    if (
        !pick.success ||
        !answer.offered.includes(pick.data) ||
        answer.confidence === null
    ) {
        return opus('unsure')
    }
    if (answer.confidence >= models.confidence_bar) {
        return {
            model: pick.data,
            model_reason: 'decision_model',
            trial_group: null,
        }
    }
    const all = ModelNameSchema.options
    if (
        trial_key === null ||
        models.trial_share <= 0 ||
        pick.data === 'opus' ||
        all.indexOf(pick.data) > all.indexOf(floor)
    ) {
        return opus('unsure')
    }
    return trialGroupOf({ key: trial_key, share: models.trial_share }) ===
        'trial'
        ? { model: pick.data, model_reason: 'trial', trial_group: 'trial' }
        : { ...opus('unsure'), trial_group: 'control' }
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
 * Opus (#604), as replay counts a try (`failed_cheaper`): the learner's at
 * the end of a run, with no ticket.
 */
export const failedCheaper = ({
    state,
    ticket,
    role,
}: {
    state: RunState
    ticket: number | null
    role: string
}): boolean =>
    ticket === null
        ? role === 'learner' && state.memory.learner.failed_cheaper
        : (state.tickets[ticket]?.failed_cheaper ?? []).some(
              (failed) => failed === role
          )

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
    const { model_reason, trial_group } = started.content
    if (!model.success || model_reason === null) return null
    return { model: model.data, model_reason, trial_group }
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
    state,
    ticket,
    role,
    step,
}: {
    records: JournalRecord[]
    state: RunState
    ticket: number | null
    role: string
    step: LaunchTry | undefined
}): boolean =>
    !(
        (step?.redo === true &&
            redonePick({ records, first_seq: step.first_seq, ticket, role }) !==
                null) ||
        failedCheaper({ state, ticket, role })
    )

/**
 * The model a fresh agent launches on, from the run's config and the
 * answer the launch step just journaled. A redo launches on the model, and
 * in the trial group, its first try journaled.
 *
 * @param run_id - The run folder's name, for the model trial's key.
 */
export const launchPick = ({
    records,
    state,
    config,
    run_id,
    ticket,
    role,
    step,
}: {
    records: JournalRecord[]
    state: RunState
    config: EngineConfig
    run_id: string
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
        failed_cheaper: failedCheaper({ state, ticket, role }),
        answer: modelAnswerOf({ records, ticket, role }),
        trial_key: trialKeyOf({ run_id, ticket, role }),
    })
