import { describe, expect, test } from 'bun:test'

import { scanLeftovers } from './leftover-scan'

describe('scanLeftovers', () => {
    test('a folder with its own git repo is a hit, since git cannot commit it as files', () => {
        const hits = scanLeftovers({
            changes: [
                { path: 'src/sum.ts', change: 'added' },
                { path: 'vendor/clone/', change: 'added' },
            ],
            test_files: [],
            mention_text: '',
            used_code: { 'src/sum.ts': true },
        })

        expect(hits).toEqual([
            {
                path: 'vendor/clone/',
                reason: 'a folder with its own git repo in it, which git cannot commit as files',
            },
        ])
    })
})
