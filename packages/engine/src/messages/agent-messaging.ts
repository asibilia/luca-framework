import {
    agentAddress,
    canMessage,
    deliveryText,
    pendingMessages,
    planMessage,
    sendAnswer,
} from './agent-messages'

import type { AgentMessaging } from '../agents/agent-launcher'
import type { AgentRole } from '../agents/role-results'
import type { Journal } from '../journal/journal'

/**
 * One agent's messaging, backed by the run's journal: `send` plans a
 * message with the message rules and journals it as `agent_message`;
 * `deliver` hands over what waits for the agent and journals it as
 * `agent_message_delivered`. Both read the journal fresh on every call. The
 * launcher calls them from inside the agent's turn (its tool and its hook)
 * while the engine awaits the turn; appends are synchronous, so that's safe.
 *
 * `null` for a reviewer: reviewers neither send nor receive.
 *
 * @example
 * const messaging = createAgentMessaging({ journal, ticket: 11, role: 'implementer' })
 * messaging?.send({ to: 'test-writer#11', text: 'sum takes an object.' })
 */
export const createAgentMessaging = ({
    journal,
    ticket,
    role,
}: {
    journal: Journal
    ticket: number
    role: AgentRole
}): AgentMessaging | null => {
    if (!canMessage({ role })) return null
    const address = agentAddress({ role, ticket })
    return {
        address,
        send: ({ to, text }) => {
            const message = planMessage({
                records: journal.read(),
                from: address,
                to,
                text,
            })
            journal.append({
                kind: 'agent_message',
                ticket,
                role,
                content: message,
            })
            return sendAnswer({ message })
        },
        deliver: ({ tool_name }) => {
            const messages = pendingMessages({
                records: journal.read(),
                address,
            })
            if (messages.length === 0) return null
            const text = deliveryText({ messages })
            journal.append({
                kind: 'agent_message_delivered',
                ticket,
                role,
                content: {
                    to: address,
                    ids: messages.map(({ id }) => id),
                    tool_name,
                    text,
                },
            })
            return text
        },
    }
}
