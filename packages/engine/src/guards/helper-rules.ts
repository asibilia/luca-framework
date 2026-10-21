/**
 * Pure: the rules for **helpers** (#627), the read-only Haiku sessions an
 * agent may start with the SDK's `Agent` tool to search the repo.
 */
import { z } from 'zod'

import { ALLOW, deny, READ_TOOLS, type ToolDecision } from './guard-roles'

import type { EffortLevel } from '../config/engine-config'

/** The SDK tool that starts a helper. */
export const HELPER_TOOL = 'Agent'

/** The one helper type an agent may start. */
export const HELPER_TYPE = 'searcher'

/** Helpers always run on the newest Haiku, by its short name. */
export const HELPER_MODEL = 'haiku'

/** Helpers always run at low effort (#659): a search needs little thought. */
export const HELPER_EFFORT: EffortLevel = 'low'

/** The only tools a helper has: it reads and searches, nothing else. */
export const HELPER_TOOLS = READ_TOOLS

/** How many helpers one agent may have running at once. */
export const MAX_HELPERS = 3

/** The `searcher` helper's definition, for the SDK's `agents` option. */
export const SEARCHER = {
    description:
        'A read-only helper that searches the repo: finds files, symbols and callers, and reports what it found. It cannot edit files or run commands.',
    model: HELPER_MODEL,
    effort: HELPER_EFFORT,
    tools: [...HELPER_TOOLS],
    prompt: 'You are a read-only searcher. You may only read and search files in the current worktree with Read, Grep and Glob. Never try to change a file or run a command. Answer with what you found: file paths, line numbers and short excerpts, as briefly as the question allows.',
}

const HelperInputSchema = z.object({
    subagent_type: z.string().optional(),
    model: z.string().optional(),
    run_in_background: z.boolean().optional(),
    isolation: z.string().optional(),
})

/**
 * The guard's decision for an `Agent` call that starts a helper, apart from
 * how many already run. Only a `searcher`, on Haiku (never a Fable model),
 * in the foreground, so it ends inside the agent's turn and the after-turn
 * check sees what it did, and in the agent's own worktree.
 *
 * @example
 * checkHelperCall({ tool_input: { subagent_type: 'searcher', run_in_background: false } }) // { allow: true }
 */
export const checkHelperCall = ({
    tool_input,
}: {
    tool_input: unknown
}): ToolDecision => {
    const input = HelperInputSchema.safeParse(tool_input)
    if (!input.success) return deny('Agent got an input of the wrong shape.')
    const { subagent_type, model, run_in_background, isolation } = input.data
    if (model !== undefined && /fable/i.test(model)) {
        return deny(`Fable models are refused: ${model}`)
    }
    if (subagent_type !== HELPER_TYPE) {
        return deny(
            `The only helper is "${HELPER_TYPE}": ${subagent_type ?? 'no subagent_type'} is not allowed.`
        )
    }
    if (model !== undefined && model !== HELPER_MODEL) {
        return deny(`Helpers always run on ${HELPER_MODEL}: ${model}`)
    }
    if (run_in_background !== false) {
        return deny(
            'Helpers run in the foreground: set run_in_background to false.'
        )
    }
    if (isolation !== undefined) {
        return deny('Helpers work in your own worktree: no isolation.')
    }
    return ALLOW
}

/**
 * The guard's decision for a tool call a helper makes itself: only its
 * read-only tools, whatever its agent may do.
 */
export const checkHelperTool = ({
    tool_name,
}: {
    tool_name: string
}): ToolDecision =>
    HELPER_TOOLS.includes(tool_name)
        ? ALLOW
        : deny(
              `A helper may only use ${HELPER_TOOLS.join(', ')}: not ${tool_name}.`
          )
