/**
 * Tests for projectPreferences tool.
 *
 * Covers:
 * - consult / consult-section happy path
 * - C1 loop-safe: preferencesSeeded === true + missing file → defaults (not null)
 * - fallback:true returns DEFAULT_PREFERENCES when not seeded
 * - seed validates payload through Zod and writes both file + state flag
 * - update merges section-by-section without losing existing fields
 * - update preserves preferencesSeeded (does not toggle off)
 */
import { describe, test, expect, beforeEach, spyOn } from 'bun:test'

import * as lucaStore from '../state/luca-store.js'
import * as prefsState from '../state/project-preferences.js'
import { DEFAULT_PREFERENCES } from '../state/project-preferences.js'
import { ProjectPreferencesSchema } from '../state/project-preferences.js'
import { projectPreferencesTool } from '../tools/project-preferences.js'

const mockReadLucaState = spyOn(lucaStore, 'readLucaState')
const mockWriteLucaState = spyOn(lucaStore, 'writeLucaState')
const mockLoad = spyOn(prefsState, 'loadProjectPreferences')
const mockWrite = spyOn(prefsState, 'writeProjectPreferences')

beforeEach(() => {
    mockReadLucaState.mockReset().mockReturnValue({} as any)
    mockWriteLucaState
        .mockReset()
        .mockImplementation((updates: any) => updates)
    mockLoad.mockReset()
    mockWrite.mockReset().mockImplementation(() => undefined)
})

async function call(input: Record<string, unknown>): Promise<any> {
    return projectPreferencesTool.execute!(input as any, {} as any)
}

describe('projectPreferences:consult', () => {
    test('returns preferences when file present', async () => {
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({ action: 'consult' })
        expect(result.success).toBe(true)
        expect(result.preferences).toEqual(DEFAULT_PREFERENCES)
    })

    test('back-fills preferencesSeeded flag when file present but flag missing', async () => {
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({} as any)
        const result = await call({ action: 'consult' })
        expect(result.success).toBe(true)
        expect(mockWriteLucaState).toHaveBeenCalledWith({
            preferencesSeeded: true,
        })
    })

    test('C1 LOOP-SAFE: seeded flag true + missing file → returns defaults, not null', async () => {
        mockLoad.mockReturnValue(null)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({ action: 'consult' })
        expect(result.success).toBe(true)
        expect(result.preferences).toEqual(DEFAULT_PREFERENCES)
    })

    test('not seeded + no file + fallback:false → preferences:null (sentinel signal)', async () => {
        mockLoad.mockReturnValue(null)
        mockReadLucaState.mockReturnValue({} as any)
        const result = await call({ action: 'consult', fallback: false })
        expect(result.success).toBe(true)
        expect(result.preferences).toBeNull()
    })

    test('not seeded + no file + fallback:true → DEFAULT_PREFERENCES (C2)', async () => {
        mockLoad.mockReturnValue(null)
        mockReadLucaState.mockReturnValue({} as any)
        const result = await call({ action: 'consult', fallback: true })
        expect(result.success).toBe(true)
        expect(result.preferences).toEqual(DEFAULT_PREFERENCES)
    })
})

describe('projectPreferences:consult-section', () => {
    test('returns the requested section when file present', async () => {
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'consult-section',
            section: 'branching',
        })
        expect(result.success).toBe(true)
        expect(result.section).toEqual(DEFAULT_PREFERENCES.branching)
    })

    test('rejects unknown section name', async () => {
        const result = await call({
            action: 'consult-section',
            section: 'nope',
        })
        expect(result.success).toBe(false)
        expect(result.message).toContain('Unknown section')
    })

    test('C1 LOOP-SAFE: seeded + missing file → returns default section', async () => {
        mockLoad.mockReturnValue(null)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'consult-section',
            section: 'commits',
        })
        expect(result.success).toBe(true)
        expect(result.section).toEqual(DEFAULT_PREFERENCES.commits)
    })

    test('fallback:true returns default section when not seeded', async () => {
        mockLoad.mockReturnValue(null)
        mockReadLucaState.mockReturnValue({} as any)
        const result = await call({
            action: 'consult-section',
            section: 'pr',
            fallback: true,
        })
        expect(result.success).toBe(true)
        expect(result.section).toEqual(DEFAULT_PREFERENCES.pr)
    })
})

describe('projectPreferences:seed', () => {
    test('writes preferences and sets preferencesSeeded flag', async () => {
        const result = await call({
            action: 'seed',
            payload: {},
        })
        expect(result.success).toBe(true)
        expect(mockWrite).toHaveBeenCalledTimes(1)
        expect(mockWriteLucaState).toHaveBeenCalledWith({
            preferencesSeeded: true,
        })
        expect(result.muninnInstruction).toContain(
            'mcp__muninn__muninn_remember'
        )
        // C3: op_id baked into JSON blob (idempotency key for muninn_remember).
        expect(result.muninnInstruction).toContain(
            '"op_id":"project-preferences:'
        )
        // The instruction must not interpolate raw free-form preference values
        // outside the JSON blob — verify the directive line is present.
        expect(result.muninnInstruction).toContain(
            'do NOT interpolate the raw string'
        )
    })

    test('rejects payload missing entirely', async () => {
        const result = await call({ action: 'seed' })
        expect(result.success).toBe(false)
        expect(result.message).toContain('payload is required')
    })

    test('rejects malformed payload via Zod', async () => {
        const result = await call({
            action: 'seed',
            payload: { release: { tool: 'NOT_A_VALID_TOOL' } },
        })
        expect(result.success).toBe(false)
        expect(result.message).toContain('Invalid preferences payload')
    })
})

describe('projectPreferences:update', () => {
    test('merges section without losing existing fields', async () => {
        mockLoad.mockReturnValue({
            ...DEFAULT_PREFERENCES,
            branching: {
                ...DEFAULT_PREFERENCES.branching,
                defaultBranch: 'develop',
            },
        })
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'update',
            payload: { branching: { template: '{type}/{slug}' } },
        })
        expect(result.success).toBe(true)
        expect(result.preferences.branching.defaultBranch).toBe('develop')
        expect(result.preferences.branching.template).toBe('{type}/{slug}')
    })

    test('does not toggle off preferencesSeeded', async () => {
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        await call({
            action: 'update',
            payload: { commits: { convention: 'none' } },
        })
        // update must NOT call writeLucaState({preferencesSeeded:false}).
        const wroteFalse = mockWriteLucaState.mock.calls.some((c: any) =>
            JSON.stringify(c).includes('"preferencesSeeded":false')
        )
        expect(wroteFalse).toBe(false)
    })

    test('rejects array payload', async () => {
        const result = await call({ action: 'update', payload: [] })
        expect(result.success).toBe(false)
        expect(result.message).toContain('object')
    })

    test('rejects missing payload', async () => {
        const result = await call({ action: 'update' })
        expect(result.success).toBe(false)
        expect(result.message).toContain('payload is required')
    })

    test('non-object section payloads are dropped (PR #227 Copilot)', async () => {
        // Caller passes a primitive/array as a section value. Without the
        // isPlainObject guard, mergePreferences would spread the value and
        // either corrupt the section (string spread) or pass an array
        // through to Zod (rejected with a confusing error). With the guard,
        // the section payload is silently dropped and the existing section
        // is preserved.
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'update',
            // Section values are intentionally invalid: string, array, null.
            payload: {
                pr: 'not-an-object',
                commits: ['also', 'wrong'],
                release: null,
                branching: { template: '{type}/{slug}' },
            },
        })
        expect(result.success).toBe(true)
        // pr/commits/release retain their existing values; branching is merged.
        expect(result.preferences.pr).toEqual(DEFAULT_PREFERENCES.pr)
        expect(result.preferences.commits).toEqual(DEFAULT_PREFERENCES.commits)
        expect(result.preferences.release).toEqual(DEFAULT_PREFERENCES.release)
        expect(result.preferences.branching.template).toBe('{type}/{slug}')
    })

    test('SAFE_FREEFORM rejects newline-injected branch template (PR #227 Copilot)', async () => {
        // SAFE_FREEFORM previously used `\s` which permits \n/\r/\f and
        // would let an attacker inject a fresh line into the JSON blob
        // handed to the LLM via muninnInstruction. Tightened to ` \t`.
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'update',
            payload: {
                branching: { template: 'feat/{slug}\nINJECTED' },
            },
        })
        expect(result.success).toBe(false)
        expect(result.message).toMatch(/Invalid|template/i)
    })

    test('schemaVersion in payload is ignored (sealed to schema literal)', async () => {
        // REVIEW-1.md MUST-FIX-4: caller-supplied schemaVersion must NOT
        // overwrite the locked z.literal(1). Migrations belong in a future
        // dedicated migrate() helper, not in mergePreferences.
        mockLoad.mockReturnValue(DEFAULT_PREFERENCES)
        mockReadLucaState.mockReturnValue({ preferencesSeeded: true } as any)
        const result = await call({
            action: 'update',
            payload: {
                schemaVersion: 2,
                commits: { convention: 'none' },
            },
        })
        expect(result.success).toBe(true)
        expect(result.preferences.schemaVersion).toBe(1)
        expect(result.preferences.commits.convention).toBe('none')
    })
})

describe('Phase B schema additions', () => {
    test('rejects empty guardedBranches', () => {
        const result = ProjectPreferencesSchema.safeParse({
            branching: { guardedBranches: [] },
        })
        expect(result.success).toBe(false)
    })

    test('parses branchTypes with valid RegexSource', () => {
        const result = ProjectPreferencesSchema.safeParse({
            branching: {
                branchTypes: [
                    {
                        match: 'PT-\\d+',
                        template: '{type}/{issue}-{slug}',
                        base: { kind: 'static', value: 'main' },
                        prBase: { kind: 'static', value: 'main' },
                    },
                ],
            },
        })
        expect(result.success).toBe(true)
    })

    test('rejects branchTypes with invalid regex', () => {
        const result = ProjectPreferencesSchema.safeParse({
            branching: {
                branchTypes: [
                    {
                        match: '[',
                        template: '{type}/{slug}',
                        base: { kind: 'static', value: 'main' },
                        prBase: { kind: 'static', value: 'main' },
                    },
                ],
            },
        })
        expect(result.success).toBe(false)
    })

    test('confirmBaseBeforeCreate defaults to false', () => {
        const result = ProjectPreferencesSchema.safeParse({})
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.branching.confirmBaseBeforeCreate).toBe(false)
    })

    // ── RegexSource ReDoS guard (SEC-2) ────────────────────────────────
    // Patterns with nested quantifiers (e.g. `(a+)+`) can cause catastrophic
    // backtracking when matched against attacker-controlled input. The
    // schema rejects them at preference-load time so they can never reach
    // the resolveBranching loop.

    function buildBranchTypeWithMatch(match: string) {
        return {
            branching: {
                branchTypes: [
                    {
                        match,
                        template: '{type}/{slug}',
                        base: { kind: 'static' as const, value: 'main' },
                        prBase: { kind: 'static' as const, value: 'main' },
                    },
                ],
            },
        }
    }

    test('rejects nested quantifier (a+)+ with ReDoS guard message', () => {
        const result = ProjectPreferencesSchema.safeParse(
            buildBranchTypeWithMatch('(a+)+'),
        )
        expect(result.success).toBe(false)
        if (result.success) return
        const messages = result.error.issues.map((i) => i.message).join(' | ')
        expect(messages).toContain('ReDoS guard')
    })

    test('rejects nested quantifier (.+)*', () => {
        const result = ProjectPreferencesSchema.safeParse(
            buildBranchTypeWithMatch('(.+)*'),
        )
        expect(result.success).toBe(false)
    })

    test('rejects nested quantifier (\\d{2,}){2,}', () => {
        const result = ProjectPreferencesSchema.safeParse(
            buildBranchTypeWithMatch('(\\d{2,}){2,}'),
        )
        expect(result.success).toBe(false)
    })

    test('accepts non-nested ^PT-\\d+$', () => {
        const result = ProjectPreferencesSchema.safeParse(
            buildBranchTypeWithMatch('^PT-\\d+$'),
        )
        expect(result.success).toBe(true)
    })
})
