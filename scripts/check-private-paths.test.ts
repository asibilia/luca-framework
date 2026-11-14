import { describe, expect, test } from 'bun:test'

import { findPrivatePaths, formatHits } from './check-private-paths'

/**
 * Real-looking names and the forms the check flags are built when the test
 * runs, so this file holds none and passes its own check.
 */
const NAME = ['ja', 'ne'].join('')
const DOTTED = ['a', 'sibilia'].join('.')
const GITHUB = ['Git', 'hub'].join('')
const HOME_VAR = ['$', 'HOME'].join('')
const MAC = ['Janes', 'MacBook', 'Air'].join('-')
const DEV = ['d', 'ev'].join('')
const TEST = ['te', 'st'].join('')
const DOCS = ['Docu', 'ments'].join('')
const DESK = ['Desk', 'top'].join('')
const DOWN = ['Down', 'loads'].join('')

const hitsIn = (text: string): string[] =>
    findPrivatePaths({ text }).map(({ hit }) => hit)

describe('findPrivatePaths', () => {
    test('placeholder names, web URLs and tool folders pass', () => {
        const text = [
            'home: /Users/me/project and /Users/jdoe/My Projects/a.ts',
            "cwd: '/home/runner/work/app', /Users/you, /home/x",
            'C:\\Users\\me\\repo and C:/Users/you/repo',
            '/home/.config/luca/.env and ~/.claude/skills',
            '-Users-jdoe-Github-app, ~/.local/state/luca/runs',
            `https://github.com/Users/${NAME}`,
        ].join('\n')

        expect(hitsIn(text)).toEqual([])
    })

    test('a real-looking name, in any form, fails with its line', () => {
        const text = [
            'fine',
            `cd /Users/${NAME}/repo`,
            `"/home/${NAME}"`,
            `C:\\Users\\${NAME}\\repo`,
            `file:///Users/${NAME}/x and -I/home/${NAME}/include`,
            `/Users/${DOTTED}/x and /home/${DEV}/x and /Users/${TEST}/x`,
            `/private/tmp/c/-Users-${NAME}-Github-app/a`,
        ].join('\n')

        expect(
            findPrivatePaths({ text }).map(({ line, hit }) => [line, hit])
        ).toEqual([
            [2, `/Users/${NAME}/repo`],
            [3, `/home/${NAME}`],
            [4, `C:\\Users\\${NAME}\\repo`],
            [5, `/Users/${NAME}/x`],
            [5, `/home/${NAME}/include`],
            [6, `/Users/${DOTTED}/x`],
            [6, `/home/${DEV}/x`],
            [6, `/Users/${TEST}/x`],
            [7, `-Users-${NAME}-Github-app`],
        ])
    })

    test('folders under the home that hold your own files, $HOME, and computer names fail', () => {
        const text = [
            `see ~/${GITHUB}/app and ~/${DOCS}/a.md`,
            `~/${DESK}/x, ~/${DOWN}/y, ${HOME_VAR}/z`,
            `ssh ${MAC}.local`,
        ].join('\n')

        expect(hitsIn(text)).toEqual([
            `~/${GITHUB}/app`,
            `~/${DOCS}/a.md`,
            `~/${DESK}/x`,
            `~/${DOWN}/y`,
            `${HOME_VAR}/z`,
            `${MAC}.local`,
        ])
        expect(
            formatHits({ hits: [{ where: 'docs/a.md:2', hit: '/home/x' }] })
        ).toContain('docs/a.md:2: /home/x')
    })
})
