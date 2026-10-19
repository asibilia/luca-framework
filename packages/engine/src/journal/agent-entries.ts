import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { AgentSessionSchema } from '../agents/agent-launcher'
import {
    AgentRoleSchema,
    FileModeSchema,
    RoleResultSchema,
} from '../agents/role-results'
import { GateCheckSchema } from '../gates/gate-schemas'
import { ModelReasonSchema } from '../jev/model-pick'

/**
 * The journal entries of agent turns: started, finished or failed, their
 * sessions, and shared `.git` changes during a turn.
 */

/**
 * An agent turn was started, with its prompt word for word. A follow-up in a
 * fix loop names the session it went to in `follow_up_of`, and `prompt` holds
 * the follow-up message. `model` is the short name it launched on (a
 * follow-up's is its session's); `null` in journals from before #600. The
 * exact version is in the turn's `agent_session`. `model_reason` is why it
 * launched on that model (#603; a follow-up's is its session's); `null` in
 * journals from before it.
 */
export const AgentStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_started'),
    content: z.object({
        role: AgentRoleSchema,
        prompt: z.string(),
        follow_up_of: z.string().nullable().default(null),
        model: z.string().nullable().default(null),
        model_reason: ModelReasonSchema.nullable().default(null),
    }),
})

/** The session an agent turn ran in; `null` in journals from before #363. */
const SESSION_FIELDS = { session_id: z.string().nullable().default(null) }

/**
 * An agent finished with a result that fits its role's schema. One option
 * per role: keep it in step with `RoleResultSchema` (a test checks every
 * role parses).
 */
export const AgentFinishedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_finished'),
    content: z.discriminatedUnion('role', [
        RoleResultSchema.options[0].extend(SESSION_FIELDS),
        RoleResultSchema.options[1].extend(SESSION_FIELDS),
        RoleResultSchema.options[2].extend(SESSION_FIELDS),
        RoleResultSchema.options[3].extend(SESSION_FIELDS),
        RoleResultSchema.options[4].extend(SESSION_FIELDS),
        RoleResultSchema.options[5].extend(SESSION_FIELDS),
        RoleResultSchema.options[6].extend(SESSION_FIELDS),
        RoleResultSchema.options[7].extend(SESSION_FIELDS),
        RoleResultSchema.options[8].extend(SESSION_FIELDS),
    ]),
})

/**
 * How an agent's turn failed:
 * - `agent`: the turn itself failed (an error result, a timeout).
 * - `result`: no structured output, or output that misfits the role's schema.
 * - `guard`: the after-turn check found a change the role may not make.
 * - `engine`: the engine's side failed (the SDK crashed, or a follow-up's
 *   session is gone).
 * - `evidence`: a test-writer's `already_done` evidence did not check out
 *   (#495). Replay makes it from a failed `already_done_checked`, not from
 *   an `agent_failed` record.
 * - `chore`: a chore the writer's result asked the engine for could not be
 *   done (#618): a file mode on a path the role may not write, an unknown
 *   generator, or a failed one. See `chores_done`.
 *
 * The decision step counts all but `engine` as failed tries; an engine
 * failure starts a fresh agent without using one.
 */
export const AgentFailureSchema = z.enum([
    'agent',
    'result',
    'guard',
    'engine',
    'evidence',
    'chore',
])

export type AgentFailure = z.infer<typeof AgentFailureSchema>

/** An agent's turn failed, journaled once per turn with how it failed. */
export const AgentFailedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_failed'),
    content: z.object({
        role: AgentRoleSchema,
        error: z.string(),
        failure: AgentFailureSchema.default('agent'),
        ...SESSION_FIELDS,
    }),
})

/**
 * The engine did the chores a writer's result asked for (#618), after its
 * turn and before the checks: `file_modes` it set, and `checks`, one
 * `generate` check per named generator it ran. `problems` lists what it
 * could not do (a path the role may not write, an unknown generator, a
 * failed one); with any, an `agent_failed` (`chore`) follows, for the
 * role's fix loop.
 */
export const ChoresDoneEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('chores_done'),
    content: z.object({
        role: AgentRoleSchema,
        file_modes: z.array(FileModeSchema),
        checks: z.array(GateCheckSchema),
        problems: z.array(z.string()),
    }),
})

/** The launcher's summary of one agent turn's model session. */
export const AgentSessionEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_session'),
    content: z.object({ role: AgentRoleSchema, session: AgentSessionSchema }),
})

/**
 * The engine closed an agent's session: nothing can send it a follow-up
 * anymore (its step's result was accepted, or its step ended another way).
 * The decision step never follows up a closed session; a fix round that
 * would have gone to it goes to a fresh agent.
 */
export const AgentSessionClosedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_session_closed'),
    content: z.object({ role: AgentRoleSchema, session_id: z.string() }),
})

/**
 * Shared `.git` files changed during an agent's turn by something the
 * engine can't attribute to the agent: config outside the ticket branch's
 * own section, `info/exclude`, or hooks, such as another agent's
 * `git push -u` in the same repo. The change is neither blamed on the agent
 * nor undone; this record only notes it.
 */
export const SharedGitChangedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('shared_git_changed'),
    content: z.object({
        role: AgentRoleSchema,
        /** What changed, such as `the shared .git/config changed`. */
        changes: z.array(z.string()),
    }),
})
