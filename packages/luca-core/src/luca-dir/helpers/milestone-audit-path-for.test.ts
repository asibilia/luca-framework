import { describe, expect, test } from 'bun:test'

import { milestoneAuditPathFor } from './milestone-audit-path-for.ts'

describe('milestoneAuditPathFor', () => {
    test('builds path for SemVer tag', () => {
        expect(milestoneAuditPathFor('v12.0.0')).toBe(
            '.luca/milestones/v12.0.0-audit.md',
        )
    })

    test('throws on invalid SemVer tag', () => {
        expect(() => milestoneAuditPathFor('foo')).toThrow()
    })
})
