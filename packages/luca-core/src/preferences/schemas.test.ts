import { describe, expect, test } from 'bun:test'

import {
    ProjectPreferencesSchema,
    DEFAULT_PREFERENCES,
    SAFE_FREEFORM_SCHEMA,
    REGEX_SOURCE_SCHEMA,
} from './schemas.ts'

describe('ProjectPreferencesSchema — defaults', () => {
    test('parses empty input to a fully-populated default tree', () => {
        const parsed = ProjectPreferencesSchema.parse({})
        expect(parsed.schemaVersion).toBe(1)
        expect(parsed.branching.defaultBranch).toBe('main')
        expect(parsed.branching.guardedBranches).toEqual(['main'])
        expect(parsed.commits.convention).toBe('conventional')
        expect(parsed.commits.subjectMaxLength).toBe(72)
        expect(parsed.pr.baseBranch).toBe('main')
        expect(parsed.release.tool).toBe('none')
        expect(parsed.tracker.kind).toBe('github')
    })

    test('DEFAULT_PREFERENCES equals parsing of {}', () => {
        expect(DEFAULT_PREFERENCES).toEqual(ProjectPreferencesSchema.parse({}))
    })
})

describe('SAFE_FREEFORM — security regex', () => {
    test.each([
        'feat(scope): description',
        'Closes #123',
        '{type}/{issue}-{slug}',
        '',
    ])('accepts safe string %p', (s) => {
        expect(SAFE_FREEFORM_SCHEMA.safeParse(s).success).toBe(true)
    })

    test.each([
        ['contains newline', 'line1\nline2'],
        ['contains carriage return', 'a\rb'],
        ['contains form feed', 'a\fb'],
        ['contains vertical tab', 'a\vb'],
        ['contains backtick', 'a`b'],
        ['contains double quote', 'a"b'],
        ['contains single quote', "a'b"],
        ['contains backslash', 'a\\b'],
        ['contains semicolon', 'a;b'],
        ['contains pipe', 'a|b'],
        ['contains dollar', 'a$b'],
    ])('rejects unsafe input (%s)', (_label, s) => {
        expect(SAFE_FREEFORM_SCHEMA.safeParse(s).success).toBe(false)
    })

    test('rejects strings longer than 64 chars', () => {
        const s = 'a'.repeat(65)
        expect(SAFE_FREEFORM_SCHEMA.safeParse(s).success).toBe(false)
    })
})

describe('REGEX_SOURCE — ReDoS guard', () => {
    test.each(['^feat$', '\\d{2,}', '\\d+', '[A-Z]{2,4}-\\d+'])(
        'accepts non-pathological pattern %p',
        (p) => {
            expect(REGEX_SOURCE_SCHEMA.safeParse(p).success).toBe(true)
        }
    )

    test.each([
        ['nested + +', '(a+)+'],
        ['nested . *', '(.+)*'],
        ['nested {} {}', '(\\d{2,}){2,}'],
    ])('rejects ReDoS-shaped pattern (%s)', (_label, p) => {
        expect(REGEX_SOURCE_SCHEMA.safeParse(p).success).toBe(false)
    })

    test('rejects strings that do not compile as regex', () => {
        expect(REGEX_SOURCE_SCHEMA.safeParse('[unclosed').success).toBe(false)
    })

    test('rejects strings longer than 128 chars', () => {
        const p = 'a'.repeat(129)
        expect(REGEX_SOURCE_SCHEMA.safeParse(p).success).toBe(false)
    })
})

describe('branching section — branchTypes ordering & ReDoS', () => {
    test('accepts a well-formed branchTypes rule', () => {
        const parsed = ProjectPreferencesSchema.parse({
            branching: {
                branchTypes: [
                    {
                        match: '^PROJ-\\d+$',
                        template: '{type}/{issue}-{slug}',
                        base: { kind: 'static', value: 'main' },
                        prBase: { kind: 'static', value: 'main' },
                        role: 'feature',
                    },
                ],
            },
        })
        expect(parsed.branching.branchTypes).toHaveLength(1)
    })

    test('rejects ReDoS pattern inside branchTypes.match', () => {
        const r = ProjectPreferencesSchema.safeParse({
            branching: {
                branchTypes: [
                    {
                        match: '(a+)+',
                        template: 'x',
                        base: { kind: 'static' },
                        prBase: { kind: 'static' },
                    },
                ],
            },
        })
        expect(r.success).toBe(false)
    })
})

describe('commits section', () => {
    test('subjectMaxLength clamps within [20, 200]', () => {
        expect(
            ProjectPreferencesSchema.safeParse({
                commits: { subjectMaxLength: 19 },
            }).success
        ).toBe(false)
        expect(
            ProjectPreferencesSchema.safeParse({
                commits: { subjectMaxLength: 201 },
            }).success
        ).toBe(false)
        expect(
            ProjectPreferencesSchema.safeParse({
                commits: { subjectMaxLength: 100 },
            }).success
        ).toBe(true)
    })
})

describe('tracker section', () => {
    test.each([['github'], ['linear'], ['jira'], ['none']])(
        'accepts kind %p',
        (kind) => {
            const r = ProjectPreferencesSchema.safeParse({
                tracker: { kind },
            })
            expect(r.success).toBe(true)
        }
    )

    test('rejects unknown kind', () => {
        const r = ProjectPreferencesSchema.safeParse({
            tracker: { kind: 'bitbucket' },
        })
        expect(r.success).toBe(false)
    })
})
