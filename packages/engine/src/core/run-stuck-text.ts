/**
 * The comments on the spec issue when the whole run is stuck: on its run
 * budget, or on a pull request that didn't open.
 */

/** A token count with thousands separators, such as `50,000`. */
const tokensText = (tokens: number): string =>
    String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * Why the run is stuck on its budget, in one line.
 *
 * @example
 * runBudgetDetail({ tokens: 50_100, budget: 50_000 })
 * // 'The run used 50,100 tokens of its run budget of 50,000.'
 */
export const runBudgetDetail = ({
    tokens,
    budget,
}: {
    tokens: number
    budget: number
}): string =>
    `The run used ${tokensText(tokens)} tokens of its run budget of ${tokensText(budget)}.`

/**
 * The comment on the spec issue when the whole run is stuck on its run
 * budget: why, how big one budget is, and the replies `retry` and `stop`
 * (never `skip` or `ship`).
 *
 * @example
 * runStuckComment({ detail, budget: 9_000_000 })
 * // '**The run is stuck: it used up its run budget**\n\nWhy: ...'
 */
export const runStuckComment = ({
    detail,
    budget,
}: {
    detail: string
    /** One full run budget. */
    budget: number
}): string =>
    [
        '**The run is stuck: it used up its run budget**',
        [
            `Why: ${detail}`,
            `One run budget is ${tokensText(budget)} tokens (input, output, and cache writes; cache reads don't count). A repo changes it with \`run_budget_tokens\` in \`.luca/config.json\`.`,
            'Nothing new starts until you reply. Other stuck work waits for its reply until the run carries on.',
        ].join('\n'),
        [
            'Reply with one word on this issue:',
            `- \`retry\`: add half a run budget (${tokensText(Math.floor(budget / 2))} tokens) and carry on where it stopped. \`retry +500k\` or \`retry +3M\` adds the amount you name instead.`,
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')

/**
 * The comment on the spec issue when the run is stuck because its pull
 * request didn't open (#508): `gh`'s error, where the PR's full text is
 * saved, and the replies `retry` and `stop`.
 *
 * @example
 * pullRequestStuckComment({ detail: 'gh pr create failed (exit code 1): ...' })
 * // "**The run is stuck: its pull request didn't open**\n\nWhy: ..."
 */
export const pullRequestStuckComment = ({
    detail,
}: {
    detail: string
}): string =>
    [
        "**The run is stuck: its pull request didn't open**",
        [
            `Why: ${detail}`,
            `The run branch is pushed, and the PR's full text is saved in the run folder as \`pull-request.md\`.`,
        ].join('\n'),
        [
            'Reply with one word on this issue:',
            '- `retry`: try to open the PR again. A PR already open from the run branch, such as one you opened by hand, is reused, never opened twice.',
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')
