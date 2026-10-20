/**
 * A card's "doing now" words (#628), from its agent's entry in the run's
 * live file: who is working and on what, and how long ago it last acted.
 */
import { elapsedText, type LiveAgent } from '../shared/board-state'

/** A tool's icon and verb on the card; a tool not here gets "•" and its name. */
const TOOL_WORDS: Record<string, { icon: string; verb: string }> = {
    Edit: { icon: '✎', verb: 'editing' },
    MultiEdit: { icon: '✎', verb: 'editing' },
    NotebookEdit: { icon: '✎', verb: 'editing' },
    Write: { icon: '✎', verb: 'writing' },
    Read: { icon: '≡', verb: 'reading' },
    Grep: { icon: '⌕', verb: 'searching' },
    Glob: { icon: '⌕', verb: 'searching' },
    Bash: { icon: '▸', verb: '' },
    Agent: { icon: '⇢', verb: 'helper' },
    Task: { icon: '⇢', verb: 'helper' },
}

/** A tool call in words, with its icon first: "✎ editing gate-runner.ts". */
export const callWords = ({
    tool,
    target,
}: {
    tool: string
    target: string
}) => {
    const { icon, verb } = TOOL_WORDS[tool] ?? { icon: '•', verb: tool }
    return [icon, verb, target].filter((part) => part !== '').join(' ')
}

/**
 * "<role> <icon> <action>", or, while a tool call is open, "<role> <icon>
 * <action> · running <time>". `null` with no live entry or no action yet,
 * so the card shows its step text.
 *
 * @example
 * liveText({ live, now }) // 'implementer ✎ editing gate-runner.ts'
 * liveText({ live: running, now }) // 'implementer ▸ bun test · running 3m 12s'
 */
export const liveText = ({
    live,
    now,
}: {
    live: LiveAgent | null
    now: number
}): string | null => {
    if (live === null) return null
    const { open_call, action } = live
    if (open_call !== null) {
        const running = elapsedText({
            ms: now - Date.parse(open_call.started_at),
        })
        return `${live.role} ${callWords(open_call)} · running ${running}`
    }
    return action === null ? null : `${live.role} ${callWords(action)}`
}

/**
 * The latest action's age after a card's tokens, " · 2s ago", or nothing
 * with no live action.
 */
export const liveAgeText = ({
    live,
    now,
}: {
    live: LiveAgent | null
    now: number
}): string =>
    live?.action
        ? ` · ${elapsedText({ ms: now - Date.parse(live.action.at) })} ago`
        : ''
