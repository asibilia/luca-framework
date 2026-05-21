import { describe, expect, test } from 'bun:test'

import { isValidLucaPath } from './is-valid-luca-path.ts'

describe('isValidLucaPath — root files', () => {
    test.each([
        ['.luca/state.json', 'root.state'],
        ['.luca/config.json', 'root.config'],
        ['.luca/lock.json', 'root.lock'],
        ['.luca/roadmap.md', 'root.roadmap'],
        ['.luca/ledger.jsonl', 'root.ledger'],
    ])('%s → %s', (path, kind) => {
        const r = isValidLucaPath(path)
        expect(r.valid).toBe(true)
        if (r.valid) expect(r.kind).toBe(kind as never)
    })

    test('rejects unknown root file', () => {
        const r = isValidLucaPath('.luca/random.txt')
        expect(r.valid).toBe(false)
    })
})

describe('isValidLucaPath — phase files', () => {
    test.each([
        ['.luca/phases/01-auth/research.md', 'phase.research'],
        ['.luca/phases/01-auth/context.md', 'phase.context'],
        ['.luca/phases/01-auth/plan.md', 'phase.plan'],
        ['.luca/phases/01-auth/plan-review.md', 'phase.plan-review'],
        ['.luca/phases/01-auth/verify.json', 'phase.verify'],
        ['.luca/phases/01-auth/learn.md', 'phase.learn'],
        ['.luca/phases/01-auth/execute/summary.md', 'phase.execute.summary'],
        [
            '.luca/phases/01-auth/execute/progress.jsonl',
            'phase.execute.progress',
        ],
        ['.luca/phases/01-auth/execute/waves/00.md', 'phase.execute.wave'],
        ['.luca/phases/01-auth/execute/waves/42.md', 'phase.execute.wave'],
        ['.luca/phases/01-auth/audits/code-review.md', 'phase.audit'],
        ['.luca/phases/01-auth/audits/security.md', 'phase.audit'],
    ])('%s → %s', (path, kind) => {
        const r = isValidLucaPath(path)
        expect(r.valid).toBe(true)
        if (r.valid) expect(r.kind).toBe(kind as never)
    })

    test('rejects malformed phase slug', () => {
        expect(isValidLucaPath('.luca/phases/auth/plan.md').valid).toBe(false)
        expect(isValidLucaPath('.luca/phases/1-auth/plan.md').valid).toBe(false)
    })

    test('rejects unknown phase file', () => {
        expect(isValidLucaPath('.luca/phases/01-auth/something.md').valid).toBe(
            false
        )
    })

    test('rejects wave file without zero-padding', () => {
        expect(
            isValidLucaPath('.luca/phases/01-auth/execute/waves/1.md').valid
        ).toBe(false)
    })

    test('rejects audit file with bad reviewer name', () => {
        expect(
            isValidLucaPath('.luca/phases/01-auth/audits/CodeReview.md').valid
        ).toBe(false)
    })

    test('rejects phase directory with no file', () => {
        expect(isValidLucaPath('.luca/phases/01-auth').valid).toBe(false)
    })
})

describe('isValidLucaPath — milestones', () => {
    test.each([
        ['.luca/milestones/v12.0.0-roadmap.md', 'milestone.roadmap'],
        ['.luca/milestones/v12.0.0-audit.md', 'milestone.audit'],
        [
            '.luca/milestones/v12.0.0-backlog-snapshot.json',
            'milestone.backlog-snapshot-json',
        ],
        [
            '.luca/milestones/v12.0.0-backlog-snapshot.md',
            'milestone.backlog-snapshot-md',
        ],
        ['.luca/milestones/v12.0.0-alpha.0-roadmap.md', 'milestone.roadmap'],
    ])('%s → %s', (path, kind) => {
        const r = isValidLucaPath(path)
        expect(r.valid).toBe(true)
        if (r.valid) expect(r.kind).toBe(kind as never)
    })

    test('rejects subdirectories under milestones/', () => {
        expect(
            isValidLucaPath('.luca/milestones/v12.0.0/nested.md').valid
        ).toBe(false)
    })

    test('rejects file without SemVer prefix', () => {
        expect(isValidLucaPath('.luca/milestones/roadmap.md').valid).toBe(false)
    })
})

describe('isValidLucaPath — telemetry', () => {
    test('accepts <runId>.jsonl', () => {
        const r = isValidLucaPath(
            '.luca/telemetry/01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl'
        )
        expect(r.valid).toBe(true)
        if (r.valid) expect(r.kind).toBe('telemetry.run')
    })

    test('rejects non-jsonl telemetry file', () => {
        expect(isValidLucaPath('.luca/telemetry/run-1.log').valid).toBe(false)
    })

    test('rejects subdirectory under telemetry/', () => {
        expect(isValidLucaPath('.luca/telemetry/sub/foo.jsonl').valid).toBe(
            false
        )
    })
})

describe('isValidLucaPath — archive', () => {
    test('accepts archived phase paths', () => {
        const r = isValidLucaPath('.luca/archive/01-auth/anything.md')
        expect(r.valid).toBe(true)
        if (r.valid) expect(r.kind).toBe('archive.phase')
    })

    test('rejects archive with invalid slug', () => {
        expect(isValidLucaPath('.luca/archive/bad/x.md').valid).toBe(false)
    })
})

describe('isValidLucaPath — top-level errors', () => {
    test('rejects paths not starting with .luca/', () => {
        expect(isValidLucaPath('src/foo.ts').valid).toBe(false)
        expect(isValidLucaPath('.planning/state.json').valid).toBe(false)
    })

    test('rejects unknown top-level directory', () => {
        expect(isValidLucaPath('.luca/random/foo.md').valid).toBe(false)
    })
})
