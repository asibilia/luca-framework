import { describe, expect, test } from 'bun:test'

import { leftoverPasses, scanLeftovers } from './leftover-scan'

import type { FileChange } from '../git/git-adapter'

/**
 * The leftover scan and docs the repo asks for (#520): a new markdown file
 * under a `docs` or `adr` folder, any `README.md`, one a tracked or newly
 * added non-test file names, or one a `leftover_allow` pattern matches is
 * let through, and `leftoverPasses` says why. Stray markdown next to code is
 * still flagged with today's reasons.
 */

const MARKDOWN_REASON = 'a new markdown file the spec and ticket do not name'

/** The scan's inputs for these new files, nothing named or allowed. */
const inputsFor = ({
    paths,
    named = [],
    leftover_allow,
}: {
    paths: string[]
    named?: string[]
    leftover_allow?: string[]
}) => ({
    changes: paths.map(
        (path): FileChange => ({ path, change: 'added' as const })
    ),
    test_files: [],
    mention_text: '',
    used_code: {},
    named,
    ...(leftover_allow === undefined ? {} : { leftover_allow }),
})

/** Each pass as `{ path, reason }`, sorted by path in plain code-unit order. */
const passesOf = (inputs: ReturnType<typeof inputsFor>) =>
    leftoverPasses(inputs)
        .map(({ path, reason }) => ({ path, reason }))
        .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

describe('the leftover scan lets doc places through (#520)', () => {
    test('a new .md under docs/ at any depth is not flagged, and passes as a doc place', () => {
        const inputs = inputsFor({
            paths: [
                'docs/guide.md',
                'packages/engine/docs/design/flow.md',
                'docs/features/boards/states.md',
            ],
        })

        expect(scanLeftovers(inputs)).toEqual([])
        expect(passesOf(inputs)).toEqual([
            { path: 'docs/features/boards/states.md', reason: 'doc_place' },
            { path: 'docs/guide.md', reason: 'doc_place' },
            {
                path: 'packages/engine/docs/design/flow.md',
                reason: 'doc_place',
            },
        ])
    })

    test('any new README.md is not flagged, and passes as a doc place', () => {
        const inputs = inputsFor({
            paths: ['README.md', 'packages/board/README.md'],
        })

        expect(scanLeftovers(inputs)).toEqual([])
        expect(passesOf(inputs)).toEqual([
            { path: 'README.md', reason: 'doc_place' },
            { path: 'packages/board/README.md', reason: 'doc_place' },
        ])
    })

    test('a new .md under an adr folder outside docs is not flagged, and passes as a doc place', () => {
        const inputs = inputsFor({
            paths: [
                'adr/0001-use-zod.md',
                'architecture/adr/0002-one-changeset.md',
            ],
        })

        expect(scanLeftovers(inputs)).toEqual([])
        expect(passesOf(inputs)).toEqual([
            { path: 'adr/0001-use-zod.md', reason: 'doc_place' },
            {
                path: 'architecture/adr/0002-one-changeset.md',
                reason: 'doc_place',
            },
        ])
    })

    test('a folder only named like docs or adr is no doc place: its new .md is still flagged', () => {
        const inputs = inputsFor({
            paths: ['packages/web/mydocs/plan.md', 'src/adrs-draft/plan.md'],
        })

        expect(scanLeftovers(inputs)).toEqual([
            { path: 'packages/web/mydocs/plan.md', reason: MARKDOWN_REASON },
            { path: 'src/adrs-draft/plan.md', reason: MARKDOWN_REASON },
        ])
        expect(passesOf(inputs)).toEqual([])
    })
})

describe('the leftover scan lets markdown the repo names through (#520)', () => {
    test('a new .md that a tracked or newly added non-test file names is not flagged, and passes as named by the repo', () => {
        const inputs = inputsFor({
            paths: ['guides/setup.md', 'guides/deploy.md'],
            named: ['guides/setup.md'],
        })

        expect(scanLeftovers(inputs)).toEqual([
            { path: 'guides/deploy.md', reason: MARKDOWN_REASON },
        ])
        expect(passesOf(inputs)).toEqual([
            { path: 'guides/setup.md', reason: 'named_by_repo' },
        ])
    })
})

describe('the leftover scan and leftover_allow (#520)', () => {
    test('a new .md matching a leftover_allow pattern is not flagged, and passes as a config pattern', () => {
        const inputs = inputsFor({
            paths: [
                'handbook/ops/runbook.md',
                'handbook/intro.md',
                'design/flows.md',
            ],
            leftover_allow: ['handbook/**/*.md', 'design/*.md'],
        })

        expect(scanLeftovers(inputs)).toEqual([])
        expect(passesOf(inputs)).toEqual([
            { path: 'design/flows.md', reason: 'config_pattern' },
            { path: 'handbook/intro.md', reason: 'config_pattern' },
            { path: 'handbook/ops/runbook.md', reason: 'config_pattern' },
        ])
    })

    test('a new .md no leftover_allow pattern matches is still flagged', () => {
        const inputs = inputsFor({
            paths: ['handbook/intro.md', 'src/plan.md'],
            leftover_allow: ['handbook/**/*.md'],
        })

        expect(scanLeftovers(inputs)).toEqual([
            { path: 'src/plan.md', reason: MARKDOWN_REASON },
        ])
        expect(passesOf(inputs).map(({ path }) => path)).toEqual([
            'handbook/intro.md',
        ])
    })
})

describe('the leftover scan still flags stray markdown (#520)', () => {
    test('NOTES.md and plan.md next to code are flagged with today’s reasons, while the docs beside them pass', () => {
        const inputs = inputsFor({
            paths: [
                'docs/adr/0003-leftovers.md',
                'packages/engine/README.md',
                'packages/engine/src/NOTES.md',
                'packages/engine/src/plan.md',
            ],
        })

        expect(scanLeftovers(inputs)).toEqual([
            { path: 'packages/engine/src/NOTES.md', reason: 'a scratch file' },
            { path: 'packages/engine/src/plan.md', reason: MARKDOWN_REASON },
        ])
        expect(passesOf(inputs).map(({ path }) => path)).toEqual([
            'docs/adr/0003-leftovers.md',
            'packages/engine/README.md',
        ])
    })
})
