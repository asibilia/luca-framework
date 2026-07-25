import { describe, expect, test } from 'bun:test'

import { mailboxDirFor, mailboxPathFor } from './mailbox-path-for.ts'

const HOME = '/tmp/fake-home'

describe('mailboxDirFor', () => {
    test('is homedir-parameterized — never an implicit homedir()', () => {
        expect(mailboxDirFor({ homedir: HOME })).toBe(
            '/tmp/fake-home/.luca/handoff'
        )
        expect(mailboxDirFor({ homedir: '/other/home' })).toBe(
            '/other/home/.luca/handoff'
        )
    })
})

describe('mailboxPathFor', () => {
    test('builds <homedir>/.luca/handoff/<id>.json for a legal id', () => {
        expect(mailboxPathFor('repo-a_run_abc_def', { homedir: HOME })).toBe(
            '/tmp/fake-home/.luca/handoff/repo-a_run_abc_def.json'
        )
    })

    test('is pure — the same inputs always give the same path', () => {
        const first = mailboxPathFor('x_1', { homedir: HOME })
        const second = mailboxPathFor('x_1', { homedir: HOME })
        expect(first).toBe(second)
    })
})

describe('mailboxPathFor — path traversal rejection', () => {
    test.each([
        '../../.claude/settings',
        '../.claude/settings',
        'a/../../../etc/passwd',
        '/etc/passwd',
        'sub/dir',
        '.',
        '..',
        'has space',
        'dotted.name',
        '',
    ])('traversal or illegal id %p returns null', (id) => {
        const path = mailboxPathFor(id, { homedir: HOME })
        // On failure the diff names the id that escaped the charset.
        expect({ id, path }).toEqual({ id, path: null })
    })

    test('traversal cannot reach the HOME_DENIED_SUBDIRS neighbourhood', () => {
        // The concrete attack: without the charset guard this resolves to
        // <homedir>/.claude/settings.json, which updateStatus would overwrite.
        expect(
            mailboxPathFor('../../.claude/settings', { homedir: HOME })
        ).toBeNull()
    })
})
