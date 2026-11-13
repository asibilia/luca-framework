import { z } from 'zod'

import type { Gh } from '../../engine/src/story/story-github'

/**
 * The verdict label on the owner's own pull request (#752, section 11):
 * `signed-off` or `changes-wanted`, setting one takes the other off. A
 * label the repo lacks is created first.
 */

const LabelListSchema = z.array(z.object({ name: z.string() }))

const errorOf = (ran: { stderr: string }) => ran.stderr.trim() || 'gh failed'

/**
 * Adds `add` to the pull request and takes `remove` off it.
 *
 * @returns gh's error, or null when the labels changed.
 */
export const swapLabels = async ({
    gh,
    repo,
    number,
    add,
    remove,
}: {
    gh: Gh
    repo: string
    number: number
    add: string
    remove: string
}): Promise<string | null> => {
    const listed = await gh({
        args: [
            'label',
            'list',
            '--repo',
            repo,
            '--json',
            'name',
            '--limit',
            '1000',
        ],
    })
    if (!listed.ok) return errorOf(listed)
    let names: string[]
    try {
        names = LabelListSchema.parse(JSON.parse(listed.stdout)).map(
            ({ name }) => name
        )
    } catch {
        return `gh label list answered something else: ${listed.stdout.trim()}`
    }
    if (!names.includes(add)) {
        const created = await gh({
            args: ['label', 'create', add, '--repo', repo],
        })
        if (!created.ok) return errorOf(created)
    }
    // Taking off a label the repo lacks is not an error, so it is not asked.
    const removing = names.includes(remove) ? ['--remove-label', remove] : []
    const edited = await gh({
        args: [
            'pr',
            'edit',
            String(number),
            '--repo',
            repo,
            '--add-label',
            add,
            ...removing,
        ],
    })
    return edited.ok ? null : errorOf(edited)
}
