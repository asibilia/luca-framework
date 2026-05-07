import { describe, expect, test } from 'bun:test'

import { ALL_REGISTERED_MODES } from '../constants/mode-ids.js'
import { MODE_PERMISSIONS } from '../tools/tool-manifest.js'

/**
 * Phase C — G-ARCH-PLAN-MODE-001 regression test.
 *
 * `pr-title-format.md` is `alwaysApply: true`, so it fires in every
 * registered mode — including stock modes. If a mode is missing
 * projectPreferences from its tool set, the rule's `consult-section`
 * call hits "tool not registered" graceful-degradation EVERY time.
 *
 * This test enforces the invariant: every registered mode (stock +
 * pipeline) must have at least `consult` + `consult-section` access
 * to projectPreferences. New modes added to ALL_REGISTERED_MODES
 * without a tool-manifest entry fail this test.
 */
describe('projectPreferences — mode-coverage invariant', () => {
    for (const mode of ALL_REGISTERED_MODES) {
        test(`mode "${mode}" has projectPreferences access`, () => {
            const perms = MODE_PERMISSIONS[mode]
            expect(
                perms,
                `mode "${mode}" has no MODE_PERMISSIONS entry`
            ).toBeDefined()

            const prefsActions = perms!['project_preferences']
            expect(
                prefsActions,
                `mode "${mode}" has no projectPreferences access — pr-title-format.md will graceful-degrade in this mode`
            ).toBeDefined()

            if (prefsActions === '*') {
                // Full access — covers consult/consult-section.
                return
            }

            // Restricted: must include both consult and consult-section.
            expect(prefsActions).toContain('consult')
            expect(prefsActions).toContain('consult-section')
        })
    }
})
