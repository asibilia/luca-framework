import { describe, expect, test } from 'bun:test'

import { createSlots } from './prepare-slots'

/**
 * The prepare slots (#492): at most `limit` pieces of work at once, the rest
 * wait their turn in call order, and a slot is freed even when work throws.
 */

/** Work that logs its start and end, and ends when told to. */
const gatedWork = ({ log, name }: { log: string[]; name: string }) => {
    let finish = () => {}
    const finished = new Promise<void>((resolve) => {
        finish = resolve
    })
    return {
        work: async () => {
            log.push(`start ${name}`)
            await finished
            log.push(`end ${name}`)
            return name
        },
        finish: () => finish(),
    }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSlots', () => {
    test('with a limit of 1, work runs one piece at a time, in call order', async () => {
        const slots = createSlots()
        const log: string[] = []
        const a = gatedWork({ log, name: 'a' })
        const b = gatedWork({ log, name: 'b' })
        const c = gatedWork({ log, name: 'c' })

        const all = Promise.all(
            [a, b, c].map(({ work }) => slots.run({ limit: 1, work }))
        )
        await tick()
        expect(log).toEqual(['start a'])
        expect(slots.busy()).toBe(1)
        a.finish()
        await tick()
        expect(log).toEqual(['start a', 'end a', 'start b'])
        b.finish()
        await tick()
        c.finish()

        expect(await all).toEqual(['a', 'b', 'c'])
        expect(log).toEqual([
            'start a',
            'end a',
            'start b',
            'end b',
            'start c',
            'end c',
        ])
        expect(slots.busy()).toBe(0)
    })

    test('with a limit of 2, two run at once and the third waits', async () => {
        const slots = createSlots()
        const log: string[] = []
        const pieces = ['a', 'b', 'c'].map((name) => gatedWork({ log, name }))

        const all = Promise.all(
            pieces.map(({ work }) => slots.run({ limit: 2, work }))
        )
        await tick()
        expect(log).toEqual(['start a', 'start b'])
        pieces[1]?.finish()
        await tick()
        expect(log).toEqual(['start a', 'start b', 'end b', 'start c'])
        pieces[0]?.finish()
        pieces[2]?.finish()

        expect(await all).toEqual(['a', 'b', 'c'])
    })

    test('work that throws frees its slot for the next', async () => {
        const slots = createSlots()

        const failed = slots.run({
            limit: 1,
            work: async () => {
                throw new Error('build broke')
            },
        })
        const next = slots.run({ limit: 1, work: async () => 'ran' })

        await expect(failed).rejects.toThrow('build broke')
        expect(await next).toBe('ran')
        expect(slots.busy()).toBe(0)
    })
})
