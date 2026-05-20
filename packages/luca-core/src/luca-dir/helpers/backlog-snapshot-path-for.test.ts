import { describe, expect, test } from 'bun:test'

import { backlogSnapshotPathFor } from './backlog-snapshot-path-for.ts'

describe('backlogSnapshotPathFor', () => {
    test('builds json snapshot path', () => {
        expect(backlogSnapshotPathFor('v12.0.0', 'json')).toBe(
            '.luca/milestones/v12.0.0-backlog-snapshot.json',
        )
    })

    test('builds markdown snapshot path', () => {
        expect(backlogSnapshotPathFor('v12.0.0', 'md')).toBe(
            '.luca/milestones/v12.0.0-backlog-snapshot.md',
        )
    })

    test('throws on invalid SemVer tag', () => {
        expect(() => backlogSnapshotPathFor('12', 'json')).toThrow()
    })
})
