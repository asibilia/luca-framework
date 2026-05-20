import { describe, expect, test } from 'bun:test'

import { milestoneRoadmapPathFor } from './milestone-roadmap-path-for.ts'

describe('milestoneRoadmapPathFor', () => {
    test('builds path for stable SemVer', () => {
        expect(milestoneRoadmapPathFor('v12.0.0')).toBe(
            '.luca/milestones/v12.0.0-roadmap.md',
        )
    })

    test('builds path for prerelease SemVer', () => {
        expect(milestoneRoadmapPathFor('v12.0.0-alpha.0')).toBe(
            '.luca/milestones/v12.0.0-alpha.0-roadmap.md',
        )
    })

    test('throws on missing v prefix', () => {
        expect(() => milestoneRoadmapPathFor('12.0.0')).toThrow()
    })

    test('throws on malformed SemVer', () => {
        expect(() => milestoneRoadmapPathFor('v12.0')).toThrow()
        expect(() => milestoneRoadmapPathFor('v12.0.0.0')).toThrow()
    })
})
