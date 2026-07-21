import { describe, expect, test } from 'bun:test'

import { ENVELOPE_ID_RE } from '../constants.ts'
import { generateEnvelopeId } from './generate-envelope-id.ts'

describe('generateEnvelopeId', () => {
    test('shape is <sanitized repoName>_run_<ts>_<rand>', () => {
        expect(generateEnvelopeId('luca-framework')).toMatch(
            /^luca-framework_run_[0-9a-z]+_[0-9a-z]+$/
        )
    })

    test.each([
        'luca-framework',
        'repo with spaces',
        'org/repo.name',
        '../../.claude/settings',
        '!!!',
        '',
    ])('output for %p satisfies ENVELOPE_ID_RE', (repoName) => {
        const id = generateEnvelopeId(repoName)
        expect({ repoName, legal: ENVELOPE_ID_RE.test(id) }).toEqual({
            repoName,
            legal: true,
        })
    })

    test('a name of only illegal characters falls back to the repo stem', () => {
        expect(generateEnvelopeId('///')).toMatch(/^repo_run_/)
        expect(generateEnvelopeId('')).toMatch(/^repo_run_/)
    })

    test('traversal characters never survive into the id', () => {
        const id = generateEnvelopeId('../../.claude/settings')
        expect(id.includes('/')).toBe(false)
        expect(id.includes('.')).toBe(false)
    })

    test('ids are unique across many calls', () => {
        const ids = new Set(
            Array.from({ length: 200 }, () => generateEnvelopeId('repo-a'))
        )
        expect(ids.size).toBe(200)
    })
})
