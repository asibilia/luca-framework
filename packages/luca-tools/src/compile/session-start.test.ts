/**
 * First exercise of the `SessionStart` path through `compile()`.
 *
 * `HookEventSchema` and `HOOK_EVENT_ORDER` have both named `SessionStart`
 * since they were written, but until the handoff-inbox hook no hook USED the
 * event — so the emit path, the event ordering and the matcher-less spelling
 * were all declared and never run. This suite runs them against the real
 * `HOOKS` manifest rather than a fixture, so the thing asserted is the thing
 * that ships.
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compile } from './index.ts'
import { HOOKS } from '../hooks/index.ts'

interface CompiledHook {
    type: string
    command: string
    timeout?: number
    async?: boolean
}

interface CompiledEntry {
    matcher?: string
    hooks: CompiledHook[]
}

/** Compile the full shipped hook manifest and read back settings.json. */
function compiledSettings(): Promise<Record<string, CompiledEntry[]>> {
    const out = mkdtempSync(join(tmpdir(), 'luca-session-start-'))
    return compile([...HOOKS], out).then(() => {
        const parsed = JSON.parse(
            readFileSync(join(out, '.claude/settings.json'), 'utf-8')
        ) as { hooks: Record<string, CompiledEntry[]> }
        return parsed.hooks
    })
}

describe('compile() — SessionStart', () => {
    test('emits a SessionStart block for the handoff-inbox hook', async () => {
        const hooks = await compiledSettings()
        expect(Object.keys(hooks)).toContain('SessionStart')
        expect(hooks.SessionStart).toHaveLength(1)
    })

    test('the entry is matcher-less, so it fires for every session source', async () => {
        // SessionStart's matcher selects the source (startup|resume|clear|
        // compact). Omitting it is the correct "all sources" spelling; an
        // enumerated matcher would silently miss any source added later.
        const hooks = await compiledSettings()
        const entry = hooks.SessionStart?.[0] as CompiledEntry
        expect(entry.matcher).toBeUndefined()
    })

    test('the command targets the bundled handoff-inbox handler', async () => {
        const hooks = await compiledSettings()
        const command = hooks.SessionStart?.[0]?.hooks?.[0]?.command as string
        // Built from char codes so shell/JSON quoting cannot mangle the
        // expectation into something that trivially matches.
        const QUOTE = String.fromCharCode(34)
        const DOLLAR = String.fromCharCode(36)
        expect(command).toBe(
            `bun ${QUOTE}${DOLLAR}CLAUDE_PROJECT_DIR${QUOTE}/.claude/hooks/handoff-inbox.ts`
        )
    })

    test('the entry carries no async key, so additionalContext can land', async () => {
        // This is the assertion that matters, and it is NOT the same as
        // asserting `background === false` on the definition: the schema
        // defaults background to false, so that assertion passes even if the
        // author forgot the field. `async` is what the harness reads, and an
        // async hook's stdout never reaches the session.
        const hooks = await compiledSettings()
        const hook = hooks.SessionStart?.[0]?.hooks?.[0] as CompiledHook
        expect(Object.keys(hook)).not.toContain('async')
        expect(hook.timeout).toBe(5)
    })

    test('SessionStart is ordered before PostToolUse (HOOK_EVENT_ORDER)', async () => {
        // First exercise of HOOK_EVENT_ORDER's leading entry. Event order in
        // the emitted file follows the lifecycle list, not artifact order.
        const hooks = await compiledSettings()
        const keys = Object.keys(hooks)
        expect(keys[0]).toBe('SessionStart')
        expect(keys.indexOf('PostToolUse')).toBeGreaterThan(0)
    })
})
