import { describe, expect, test } from 'bun:test'

import { findPrivatePaths, formatHits } from './check-private-paths'

/**
 * Real-looking names are built when the test runs, so this file holds none
 * and passes its own check.
 */
const NAME = ['ja', 'ne'].join('')
const GITHUB = ['Git', 'hub'].join('')
const CAPITAL_ME = ['M', 'e'].join('')

const hitsIn = (text: string): string[] =>
    findPrivatePaths({ text }).map(({ hit }) => hit)

describe('findPrivatePaths', () => {
    test('placeholder names pass', () => {
        const text = [
            'home: /Users/me/project',
            "cwd: '/home/runner/work/app'",
            '/Users/you, /home/x, /Users/a, /home/dev, /Users/test, /home/example',
            'C:\\Users\\me\\repo and C:/Users/you/repo',
            '/home/.config/luca/.env',
        ].join('\n')

        expect(hitsIn(text)).toEqual([])
    })

    test('a real-looking name, in any form, fails with its line', () => {
        const text = [
            'fine',
            `cd /Users/${NAME}/repo`,
            `"/home/${NAME}"`,
            `C:\\Users\\${NAME}\\repo`,
            `see ~/${GITHUB}/app`,
            `/Users/${CAPITAL_ME}/x`,
        ].join('\n')

        expect(findPrivatePaths({ text })).toEqual([
            { line: 2, hit: `/Users/${NAME}` },
            { line: 3, hit: `/home/${NAME}` },
            { line: 4, hit: `C:\\Users\\${NAME}` },
            { line: 5, hit: `~/${GITHUB}/` },
            { line: 6, hit: `/Users/${CAPITAL_ME}` },
        ])
        expect(
            formatHits({
                hits: [{ where: 'docs/a.md:2', hit: `/Users/${NAME}` }],
            })
        ).toContain(`docs/a.md:2: /Users/${NAME}`)
    })

    test('URLs and names inside a path pass', () => {
        const text = [
            `https://github.com/Users/${NAME} and http://x/home/${NAME}`,
            `src/home/${NAME}/page.tsx`,
        ].join('\n')

        expect(hitsIn(text)).toEqual([])
    })
})
