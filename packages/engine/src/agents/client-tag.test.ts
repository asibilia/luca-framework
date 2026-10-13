import { describe, expect, test } from 'bun:test'

import { agentEnv } from './claude-options'

import { lucaVersion } from '../config/luca-version'

/**
 * The Agent SDK client tag (#460): every agent's environment names the
 * engine as `luca-engine/<Luca's version>`, not a hard-coded `0.0.0`.
 */

describe("the Agent SDK client tag carries Luca's version", () => {
    test('an installed version goes into the tag as it is', () => {
        const env = agentEnv({
            source: { PATH: '/usr/bin' },
            luca_version: '14.0.0-alpha.3',
        })

        expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).toBe(
            'luca-engine/14.0.0-alpha.3'
        )
    })

    test("with no version given, the tag uses the engine's own version", () => {
        const env = agentEnv({ source: { PATH: '/usr/bin' } })

        expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).toBe(
            `luca-engine/${lucaVersion()}`
        )
        expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).not.toBe('luca-engine/0.0.0')
    })
})
