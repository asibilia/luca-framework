/**
 * Upstream workaround patches for mastracode bugs.
 *
 * Each patch monkey-patches a mastracode internal to fix a known bug.
 * All patches are purely defensive: if upstream changes shape, they
 * log a warning and no-op rather than crashing startup.
 *
 * Patches:
 *   1. ask_user label truncation — truncate long option labels to prevent
 *      pi-tui width assertion crashes (issue #173)
 *   2. Double-slash autocomplete prefix — strip leading `/` from custom
 *      command names to prevent `//command` rendering
 *   3. Model-pack-on-login override — re-apply user's active model pack
 *      after login resets to provider default
 *
 * Extracted from launch.ts for maintainability — no behavioral changes.
 */
import { existsSync, readFileSync } from 'node:fs'

import {
    resolveMastracodeSettingsPath,
    resolvePackModelForMode,
} from '../integration/mastracode-config.js'
import { clipToVisibleWidth, visibleWidth } from '../util/tui-text-helpers.js'

// ---------------------------------------------------------------------------
// Patch 1: ask_user label truncation
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchAskQuestionPrototype(instance: any, marker: symbol) {
    if (!instance || typeof instance !== 'object') return
    const proto = Object.getPrototypeOf(instance)
    if (!proto || proto[marker]) return

    const truncateOptions = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any => {
        if (!Array.isArray(options)) return options
        const cols = process.stdout.columns || 80
        const innerWidth = cols - 3 /* TERM_WIDTH_BUFFER */ - 4 /* box */
        const labelBudget = innerWidth - 3 /* "   " prefix */ - 1 /* headroom */
        const ELLIPSIS = '\u2026'
        return options.map((opt: unknown) => {
            if (!opt || typeof opt !== 'object') return opt
            const label = (opt as { label?: unknown }).label
            if (typeof label !== 'string') return opt
            // Short-circuit: only clip when the label actually exceeds the
            // budget. clipToVisibleWidth strips ANSI unconditionally, so
            // skipping it preserves any upstream styling on labels that fit.
            if (visibleWidth(label) <= labelBudget) return opt
            return {
                ...opt,
                label: clipToVisibleWidth(label, labelBudget, ELLIPSIS),
            }
        })
    }

    const originalUpdateArgs = proto.updateArgs
    if (typeof originalUpdateArgs === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proto.updateArgs = function patchedUpdateArgs(args: any) {
            if (
                args &&
                typeof args === 'object' &&
                Array.isArray((args as { options?: unknown }).options)
            ) {
                args = {
                    ...args,
                    options: truncateOptions(
                        (args as { options: unknown[] }).options
                    ),
                }
            }
            return originalUpdateArgs.call(this, args)
        }
    }

    const originalActivate = proto.activate
    if (typeof originalActivate === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proto.activate = function patchedActivate(options: any) {
            if (
                options &&
                typeof options === 'object' &&
                Array.isArray(options.options)
            ) {
                options = {
                    ...options,
                    options: truncateOptions(options.options),
                }
            }
            return originalActivate.call(this, options)
        }
    }

    proto[marker] = true
}

function patchAskUserLabelTruncation(tui: unknown): void {
    const askMap = (() => {
        const tuiState = (tui as unknown as { state?: unknown }).state as
            | { pendingAskUserComponents?: unknown }
            | undefined
        const candidate = tuiState?.pendingAskUserComponents
        return candidate instanceof Map ? candidate : undefined
    })()

    if (askMap) {
        const LUCA_ASK_USER_PATCHED = Symbol.for('luca.ask_user.label_truncate')
        const originalSet = askMap.set.bind(askMap)
        askMap.set = function patchedSet(
            toolCallId: unknown,
            instance: unknown
        ) {
            try {
                patchAskQuestionPrototype(instance, LUCA_ASK_USER_PATCHED)
            } catch (err) {
                // Patching is purely defensive — never let it block the question.
                console.error('[luca] ask_user prototype patch failed:', err)
            }
            return originalSet(toolCallId, instance)
        } as typeof askMap.set
    } else {
        console.warn(
            '[luca] ask_user label-truncation patch skipped: ' +
                'tui.state.pendingAskUserComponents is not a Map ' +
                '(upstream mastracode internals may have changed).'
        )
    }
}

// ---------------------------------------------------------------------------
// Patch 2: Double-slash autocomplete prefix
// ---------------------------------------------------------------------------

function patchDoubleSlashAutocomplete(tui: unknown): void {
    const editor = (() => {
        const tuiState = (tui as unknown as { state?: unknown }).state as
            | { editor?: unknown }
            | undefined
        const candidate = tuiState?.editor
        if (
            !candidate ||
            typeof (candidate as { setAutocompleteProvider?: unknown })
                .setAutocompleteProvider !== 'function'
        ) {
            return undefined
        }
        return candidate as {
            setAutocompleteProvider: (provider: unknown) => void
        }
    })()

    if (editor) {
        const LUCA_AUTOCOMPLETE_PATCHED = Symbol.for(
            'luca.autocomplete.strip_leading_slash'
        )
        const editorRecord = editor as unknown as Record<symbol, unknown>
        if (!editorRecord[LUCA_AUTOCOMPLETE_PATCHED]) {
            const originalSet = editor.setAutocompleteProvider.bind(editor)
            editor.setAutocompleteProvider = (provider: unknown) => {
                try {
                    if (
                        provider &&
                        typeof provider === 'object' &&
                        Array.isArray(
                            (provider as { commands?: unknown }).commands
                        )
                    ) {
                        const commands = (provider as { commands: unknown[] })
                            .commands
                        for (const cmd of commands) {
                            if (
                                cmd &&
                                typeof cmd === 'object' &&
                                typeof (cmd as { name?: unknown }).name ===
                                    'string' &&
                                (cmd as { name: string }).name.startsWith('/')
                            ) {
                                ;(cmd as { name: string }).name = (
                                    cmd as { name: string }
                                ).name.replace(/^\/+/, '')
                            }
                        }
                    }
                } catch (err) {
                    console.error(
                        '[luca] autocomplete slash-strip patch failed:',
                        err
                    )
                }
                return originalSet(provider)
            }
            editorRecord[LUCA_AUTOCOMPLETE_PATCHED] = true
        }
    } else {
        console.warn(
            '[luca] autocomplete slash-strip patch skipped: ' +
                'tui.state.editor.setAutocompleteProvider is not callable ' +
                '(upstream mastracode internals may have changed).'
        )
    }
}

// ---------------------------------------------------------------------------
// Patch 3: Model-pack-on-login
// ---------------------------------------------------------------------------

function patchModelPackOnLogin({
    tui,
    authStorage,
}: {
    tui: unknown
    authStorage: unknown
}): void {
    const tuiAny = tui as unknown as {
        performLogin: (providerId: string) => Promise<void>
        state?: { harness?: unknown }
    }
    if (typeof tuiAny.performLogin !== 'function') return

    const originalPerformLogin = tuiAny.performLogin.bind(tui)
    tuiAny.performLogin = async (providerId: string) => {
        await originalPerformLogin(providerId)
        try {
            const settingsPath = resolveMastracodeSettingsPath()
            if (!settingsPath || !existsSync(settingsPath)) return
            const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
            const activeModelPackId = raw?.models?.activeModelPackId
            if (typeof activeModelPackId !== 'string') return

            const harnessAny = (
                tuiAny.state as { harness?: unknown } | undefined
            )?.harness as
                | {
                      getCurrentModeId?: () => string
                      switchModel?: (args: {
                          modelId: string
                      }) => Promise<unknown>
                  }
                | undefined
            if (
                !harnessAny ||
                typeof harnessAny.getCurrentModeId !== 'function' ||
                typeof harnessAny.switchModel !== 'function'
            ) {
                return
            }

            const isOauth =
                typeof (
                    authStorage as {
                        isLoggedIn?: (id: string) => boolean
                    }
                ).isLoggedIn === 'function'
                    ? (
                          authStorage as {
                              isLoggedIn: (id: string) => boolean
                          }
                      ).isLoggedIn(providerId)
                    : false

            const currentModeId = harnessAny.getCurrentModeId()
            const packModelId = resolvePackModelForMode({
                settings: raw,
                activeModelPackId,
                providerId,
                modeId: currentModeId,
                isOauth,
            })
            if (!packModelId) return

            await harnessAny.switchModel({ modelId: packModelId })
        } catch (err) {
            console.error('[luca] post-login model-pack restore failed:', err)
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Apply all upstream workaround patches. Call after TUI is created.
 */
export function applyUpstreamPatches({
    tui,
    authStorage,
}: {
    tui: unknown
    authStorage: unknown
}): void {
    patchAskUserLabelTruncation(tui)
    patchDoubleSlashAutocomplete(tui)
    patchModelPackOnLogin({ tui, authStorage })
}
