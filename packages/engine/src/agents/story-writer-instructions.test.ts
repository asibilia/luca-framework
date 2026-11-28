import { describe, expect, test } from 'bun:test'

import { storyWriterTask } from './story-writer-instructions'

const EXPECTED_LINE =
    "- Fill `map.groups`, each stop's `group_id`, each map file's `noise`, and `summary.feedback_wanted.stop_id` as `story-format.md` says."

const OVERRIDE_HEADING =
    'Where this part and the guide disagree, this part wins:'

const overrideBullets = ({ task }: { task: string }): string[] => {
    const start = task.indexOf(OVERRIDE_HEADING)
    if (start === -1) return []
    const after = task.slice(start + OVERRIDE_HEADING.length).split('\n')
    const bullets: string[] = []
    for (const line of after.slice(1)) {
        if (!line.startsWith('- ')) break
        bullets.push(line)
    }
    return bullets
}

describe('storyWriterTask', () => {
    test('claude provider includes the map groups, noise and stop_id bullet', () => {
        const lines = storyWriterTask({ provider: 'claude' }).split('\n')
        expect(lines).toContain(EXPECTED_LINE)
    })

    test('agy provider includes the map groups, noise and stop_id bullet', () => {
        const lines = storyWriterTask({ provider: 'agy' }).split('\n')
        expect(lines).toContain(EXPECTED_LINE)
    })

    test('places that bullet last in the override list for both claude and agy', () => {
        for (const provider of ['claude', 'agy'] as const) {
            const bullets = overrideBullets({
                task: storyWriterTask({ provider }),
            })
            expect(bullets.length).toBeGreaterThan(0)
            expect(bullets.at(-1)).toBe(EXPECTED_LINE)
        }
    })
})
