import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createElement } from 'react'

import type { PluginTheme } from '@getpaseo/plugin'
import { afterEach, describe, expect, test } from 'bun:test'

import {
    LAYOUT,
    THEME,
    nodesIn,
    render,
    styleOf,
    textOf,
    textsIn,
    type HostNode,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    intakeRead,
    runBranchCreated,
    specSnapshot,
    ticketSnapshot,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    stepStarted,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'
import type { BoardState } from '../shared/board-state'

const { makeStyles } = await import('./board-panel-styles')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * Model tags and Clef's line on each card (#630): a card with an agent
 * shows its model as a coloured tag, and a line saying why it got that
 * model, from `agent_started { model, model_reason }` and the agent's
 * `agent_model` answer. The cards render through the stand-ins of
 * `testing/render-native.ts`, from board states the plugin's server builds
 * out of fixture journals.
 */

type Answer = { pick: string; confidence: number }

type Agent = {
    role: string
    model: string
    /** `undefined` for an old journal's `agent_started`, with no reason. */
    model_reason?: string
    answer?: Answer
}

/** `run_started`, with the config's `models.confidence_bar` when given. */
const runStartedWith = ({ bar }: { bar?: number }): Entry => ({
    kind: 'run_started',
    ticket: null,
    role: null,
    content: {
        spec_number: 10,
        base_branch: 'main',
        config: {
            checks: { test: 'bun test' },
            ...(bar === undefined
                ? {}
                : { models: { floors: {}, confidence_bar: bar } }),
        },
    },
})

/** #13 with its tests committed, before the agent under test starts. */
const before = ({ bar }: { bar?: number }): Entry[] => [
    runStartedWith({ bar }),
    intakeRead({ spec: 10 }),
    specSnapshot({ spec: 10, title: 'Add CSV export', order: [13] }),
    ticketSnapshot({ number: 13, title: 'Export rows as CSV' }),
    runBranchCreated({ branch: 'luca/run-10' }),
    ...testsCommitted({ ticket: 13 }),
]

/**
 * The agent's launch on #13 as the engine journals it: its step, its
 * `agent_model` ask and answer, then its `agent_started`. Seqs count from
 * 1, so the answer's `asked_seq` is the ask's place in the journal.
 */
const journalWith = ({
    agent,
    bar,
}: {
    agent: Agent
    bar?: number
}): Entry[] => {
    const { role, model, model_reason, answer } = agent
    const entries = [
        ...before({ bar }),
        stepStarted({ ticket: 13, step: `launch_agent:${role}`, role }),
    ]
    if (answer) {
        const asked_seq = entries.length + 1
        entries.push(
            {
                kind: 'jev_asked',
                ticket: 13,
                role,
                content: {
                    job: 'agent_model',
                    request: {
                        state: { ticket: '#13 Export rows as CSV', role },
                        questions: {
                            model: {
                                type: 'choice',
                                instructions: `Which model should the ${role} agent run on?`,
                                criteria: {
                                    opus: null,
                                    sonnet: null,
                                    haiku: null,
                                },
                            },
                        },
                    },
                    fixed: { model: 'opus' },
                    model: '@cf/cloudflare/clef',
                    acted: true,
                },
            },
            {
                kind: 'jev_answered',
                ticket: 13,
                role,
                content: {
                    job: 'agent_model',
                    asked_seq,
                    answers: {
                        model: {
                            value: answer.pick,
                            confidence: answer.confidence,
                            raw: answer,
                        },
                    },
                    ms: 380,
                    model: '@cf/cloudflare/clef',
                },
            }
        )
    }
    entries.push({
        kind: 'agent_started',
        ticket: 13,
        role,
        content: {
            role,
            prompt: `You are the ${role}.`,
            follow_up_of: null,
            model,
            ...(model_reason === undefined ? {} : { model_reason }),
        },
    })
    return entries
}

let harness: Harness | null = null
let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    await harness?.cleanup()
    harness = null
})

const stateAfter = async ({
    entries,
}: {
    entries: Entry[]
}): Promise<BoardState> => {
    await harness?.cleanup()
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({ run_id, token, entries })
    expect(reply.ok).toBe(true)
    return harness.state()
}

const LIGHT: PluginTheme = {
    colors: {
        surface0: '#ffffff',
        surface1: '#f6f6f6',
        surface2: '#ececec',
        border: '#d0d0d0',
        foreground: '#141414',
        foregroundMuted: '#6a6a6a',
        accent: '#2050d0',
        accentForeground: '#fafafa',
        statusSuccess: '#208a30',
        statusWarning: '#b07010',
        statusDanger: '#c02020',
    },
}

/** #13's card, drawn from the board state after `agent` launched. */
const cardWith = async ({
    agent,
    bar,
    theme = THEME,
    after = [],
}: {
    agent: Agent
    bar?: number
    theme?: PluginTheme
    /** Records journaled after the agent's launch. */
    after?: Entry[]
}): Promise<Screen> => {
    const state = await stateAfter({
        entries: [...journalWith({ agent, bar }), ...after],
    })
    const ticket = state.tickets.find((card) => card.number === 13)
    if (!ticket) throw new Error('no ticket #13')
    screen?.unmount()
    screen = render(
        createElement(TicketCardView, {
            ticket,
            state,
            open: false,
            onToggle: () => undefined,
            theme,
            styles: makeStyles({ theme, compact: LAYOUT.compact }),
        })
    )
    return screen
}

/** The model tag: the `Text` showing just the model's name. */
const tagOf = ({ shown, model }: { shown: Screen; model: string }) => {
    const found = shown
        .all()
        .find(
            (node) =>
                node.type === 'Text' &&
                textOf(node).trim().toLowerCase() === model
        )
    if (!found) throw new Error(`no model tag "${model}"`)
    return found
}

const COLOR_KEYS = ['color', 'borderColor', 'backgroundColor']

/** The colours a part is drawn in: its own, and its wrappers' that hold only it. */
const colorsOf = ({ part }: { part: HostNode }): string[] => {
    const own = new Set(nodesIn(part))
    const colors: string[] = []
    let node: HostNode | null = part
    while (node !== null) {
        const style = styleOf(node)
        for (const key of COLOR_KEYS) {
            if (typeof style[key] === 'string') colors.push(style[key])
        }
        const up: HostNode | null = node.parent
        if (up === null || !textsIn(up).every((text) => own.has(text))) break
        node = up
    }
    return colors
}

/** A colour's hue in degrees, and its saturation, from hex, rgb() or hsl(). */
const hueOf = (color: string): { hue: number; saturation: number } | null => {
    const hsl = /^hsla?\(\s*([\d.]+)\D+([\d.]+)%/.exec(color)
    if (hsl) return { hue: Number(hsl[1]), saturation: Number(hsl[2]) / 100 }
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color)
    const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(color)
    let channels: number[]
    if (hex?.[1]) {
        const digits =
            hex[1].length === 3
                ? [...hex[1]].map((d) => d + d)
                : (hex[1].slice(0, 6).match(/../g) ?? [])
        channels = digits.map((pair) => parseInt(pair, 16))
    } else if (rgb) {
        channels = [rgb[1], rgb[2], rgb[3]].map(Number)
    } else return null
    const [r = 0, g = 0, b = 0] = channels.map((value) => value / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (delta === 0) return { hue: 0, saturation: 0 }
    const hue =
        max === r
            ? ((g - b) / delta + 6) % 6
            : max === g
              ? (b - r) / delta + 2
              : (r - g) / delta + 4
    const light = (max + min) / 2
    return {
        hue: hue * 60,
        saturation: delta / (1 - Math.abs(2 * light - 1)),
    }
}

/** Whether `color` is a clear hue between `from` and `to` degrees. */
const inHue = (color: string, [from, to]: [number, number]): boolean => {
    const found = hueOf(color)
    return (
        found !== null &&
        found.saturation > 0.3 &&
        found.hue >= from &&
        found.hue <= to
    )
}

const PURPLE: [number, number] = [250, 310]
const ORANGE: [number, number] = [15, 45]
const BLUE: [number, number] = [190, 240]
const GREEN: [number, number] = [90, 170]
const AMBER: [number, number] = [15, 50]

/** Clef's confidence bar: its value, and its filled part's width and colour. */
const barOf = ({ shown }: { shown: Screen }) => {
    const bar = shown
        .all()
        .find((node) => node.props.accessibilityRole === 'progressbar')
    if (!bar) return null
    const fill = nodesIn(bar).find((node) =>
        String(styleOf(node).width ?? '').endsWith('%')
    )
    return {
        value: bar.props.accessibilityValue,
        width: fill ? styleOf(fill).width : null,
        color: fill ? String(styleOf(fill).backgroundColor ?? '') : '',
    }
}

/** The card's one-line text that shows `text`. */
const lineWith = ({ shown, text }: { shown: Screen; text: string }) => {
    const found = shown
        .texts()
        .find(
            (node) =>
                node.props.numberOfLines === 1 && textOf(node).includes(text)
        )
    if (!found) {
        const all = shown.texts().map(textOf).join(' | ')
        throw new Error(`no one-line text with "${text}" in: ${all}`)
    }
    return found
}

const bubbleShows = ({ shown, text }: { shown: Screen; text: string }) =>
    shown
        .texts()
        .some(
            (node) =>
                node.props.numberOfLines !== 1 && textOf(node).includes(text)
        )

const SHARP_SONNET: Agent = {
    role: 'implementer',
    model: 'sonnet',
    model_reason: 'decision_model',
    answer: { pick: 'sonnet', confidence: 0.92 },
}

const SPLIT_OPUS: Agent = {
    role: 'implementer',
    model: 'opus',
    model_reason: 'unsure',
    answer: { pick: 'sonnet', confidence: 0.36 },
}

describe("model tags and Clef's line on each card (#630)", () => {
    test('the model tag is coloured by its model: opus purple, sonnet orange, haiku blue, the same on a light theme', async () => {
        const cases = [
            { agent: SPLIT_OPUS, hue: PURPLE },
            { agent: SHARP_SONNET, hue: ORANGE },
            {
                agent: {
                    ...SHARP_SONNET,
                    model: 'haiku',
                    answer: { pick: 'haiku', confidence: 0.9 },
                },
                hue: BLUE,
            },
        ]
        for (const { agent, hue } of cases) {
            const dark = colorsOf({
                part: tagOf({
                    shown: await cardWith({ agent }),
                    model: agent.model,
                }),
            })
            const tinted = dark.filter((color) => inHue(color, hue))
            expect({ model: agent.model, tinted: tinted.length > 0 }).toEqual({
                model: agent.model,
                tinted: true,
            })

            const light = colorsOf({
                part: tagOf({
                    shown: await cardWith({ agent, theme: LIGHT }),
                    model: agent.model,
                }),
            })
            expect(light.filter((color) => inHue(color, hue))).toEqual(tinted)
        }
    })

    test("a model the board doesn't know gets a muted tag", async () => {
        const shown = await cardWith({
            agent: { role: 'implementer', model: 'gpt-9' },
        })
        const colors = colorsOf({ part: tagOf({ shown, model: 'gpt-9' }) })
        const theme = Object.values(THEME.colors)

        expect(colors).toContain(THEME.colors.foregroundMuted)
        expect(colors.filter((color) => !theme.includes(color))).toEqual([])
    })

    test("each model_reason shows its short text on Clef's line", async () => {
        const cases: { agent: Agent; text: string }[] = [
            { agent: SHARP_SONNET, text: '0.92 sharp → sonnet' },
            { agent: SPLIT_OPUS, text: '0.36 split → stayed on opus' },
            {
                agent: {
                    role: 'implementer',
                    model: 'opus',
                    model_reason: 'floor',
                    answer: { pick: 'haiku', confidence: 0.7 },
                },
                text: 'floor opus → opus',
            },
            {
                agent: {
                    role: 'implementer',
                    model: 'opus',
                    model_reason: 'after_failure',
                },
                text: 'a try failed → opus',
            },
            {
                agent: {
                    role: 'implementer',
                    model: 'opus',
                    model_reason: 'no_answer',
                },
                text: "clef didn't answer → opus",
            },
            {
                agent: {
                    role: 'ticket-reviewer',
                    model: 'opus',
                    model_reason: 'locked',
                },
                text: 'ticket-reviewers always run on opus',
            },
        ]
        const missing: string[] = []
        for (const { agent, text } of cases) {
            const shown = await cardWith({ agent })
            const found = shown
                .texts()
                .some(
                    (node) =>
                        node.props.numberOfLines === 1 &&
                        textOf(node).includes(text)
                )
            if (!found) missing.push(`${agent.model_reason}: ${text}`)
        }

        expect(missing).toEqual([])
    })

    test("Clef's bar is filled to the confidence: green when sharp, orange when split, against the default 0.8 bar", async () => {
        const sharp = barOf({ shown: await cardWith({ agent: SHARP_SONNET }) })
        expect(sharp?.value).toEqual({ min: 0, max: 100, now: 92 })
        expect(sharp?.width).toBe('92%')
        expect(inHue(sharp?.color ?? '', GREEN)).toBe(true)

        const split = barOf({ shown: await cardWith({ agent: SPLIT_OPUS }) })
        expect(split?.value).toEqual({ min: 0, max: 100, now: 36 })
        expect(split?.width).toBe('36%')
        expect(inHue(split?.color ?? '', AMBER)).toBe(true)
    })

    test("a follow-up of the same role, with no new ask, keeps Clef's confidence text and bar", async () => {
        /** An `agent_started` on #13 with its step, and no `agent_model` ask. */
        const started = ({
            role,
            model,
            model_reason,
            follow_up_of,
        }: {
            role: string
            model: string
            model_reason: string
            follow_up_of: string | null
        }): Entry[] => [
            stepStarted({ ticket: 13, step: `launch_agent:${role}`, role }),
            {
                kind: 'agent_started',
                ticket: 13,
                role,
                content: {
                    role,
                    prompt: `You are the ${role}.`,
                    follow_up_of,
                    model,
                    model_reason,
                },
            },
        ]
        const shown = await cardWith({
            agent: SHARP_SONNET,
            after: [
                ...started({
                    role: 'ticket-reviewer',
                    model: 'opus',
                    model_reason: 'locked',
                    follow_up_of: null,
                }),
                ...started({
                    role: 'implementer',
                    model: 'sonnet',
                    model_reason: 'decision_model',
                    follow_up_of: 'session-implementer-1',
                }),
            ],
        })

        const text = '0.92 sharp → sonnet'
        expect(textOf(lineWith({ shown, text }))).toContain(text)
        const bar = barOf({ shown })
        expect(bar?.width).toBe('92%')
        expect(inHue(bar?.color ?? '', GREEN)).toBe(true)
    })

    test("sharp and split follow the config's models.confidence_bar", async () => {
        const low = await cardWith({
            agent: {
                ...SHARP_SONNET,
                answer: { pick: 'sonnet', confidence: 0.56 },
            },
            bar: 0.5,
        })
        const sharp = '0.56 sharp → sonnet'
        expect(textOf(lineWith({ shown: low, text: sharp }))).toContain(sharp)
        expect(inHue(barOf({ shown: low })?.color ?? '', GREEN)).toBe(true)

        const high = await cardWith({
            agent: {
                ...SPLIT_OPUS,
                answer: { pick: 'sonnet', confidence: 0.92 },
            },
            bar: 0.95,
        })
        const split = '0.92 split → stayed on opus'
        expect(textOf(lineWith({ shown: high, text: split }))).toContain(split)
        expect(inHue(barOf({ shown: high })?.color ?? '', AMBER)).toBe(true)
    })

    test("a tap on Clef's line shows the full sentence", async () => {
        const shown = await cardWith({ agent: SPLIT_OPUS, bar: 0.8 })
        const sentence =
            'Clef picked sonnet but was only 0.36 sure (split: under 0.8), so Luca stayed on opus.'
        expect(bubbleShows({ shown, text: sentence })).toBe(false)

        shown.press(lineWith({ shown, text: '0.36 split → stayed on opus' }))

        expect(bubbleShows({ shown, text: sentence })).toBe(true)
    })

    test('an old journal with no model_reason shows the model tag only', async () => {
        const shown = await cardWith({
            agent: {
                role: 'implementer',
                model: 'opus',
                answer: { pick: 'sonnet', confidence: 0.56 },
            },
        })
        const texts = shown.texts().map(textOf)

        expect(tagOf({ shown, model: 'opus' })).toBeDefined()
        const clef = /→|always run on|sharp|split/
        expect(texts.filter((text) => clef.test(text))).toEqual([])
        expect(barOf({ shown })).toBeNull()
    })

    test("the board docs describe the model colours and Clef's texts", async () => {
        const dir = join(import.meta.dir, '..', 'docs')
        const pages = await Promise.all(
            (await readdir(dir))
                .filter((name) => name.endsWith('.md'))
                .map((name) => Bun.file(join(dir, name)).text())
        )
        const docs = pages.join('\n')
        const wanted = [
            'purple',
            'orange',
            'blue',
            'green',
            'muted',
            'sharp → sonnet',
            'split → stayed on opus',
            'floor opus → opus',
            'a try failed → opus',
            "clef didn't answer → opus",
            'always run on opus',
            'confidence_bar',
        ]

        expect(wanted.filter((text) => !docs.includes(text))).toEqual([])
    })
})
