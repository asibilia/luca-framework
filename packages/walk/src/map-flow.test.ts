import { describe, expect, test } from 'bun:test'

import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import { mapHtml, type MapWalkState } from './map-html'
import { groupedLineCounts } from './testing/grouped-line-counts'
import { htmlButtons, htmlText } from './testing/html-text'
import {
    attrOf,
    boxOf,
    findElements,
    panelOf,
    stripScriptsAndStyles,
} from './testing/map-dom'

import { groupedStory } from '../../engine/src/story/testing/grouped-story'
import { story as smallStory } from '../../engine/src/story/testing/story-fixtures'

/**
 * The flow Map panel (#800, spec #776 section 4): lanes, stop boxes, walk
 * line, links, side panels, noise folding, header states, and old stories.
 */

const renderGrouped = ({
    state,
    approved_files = [],
    drafts = [],
    github_threads = [],
}: {
    state?: Partial<MapWalkState>
    approved_files?: string[]
    drafts?: DraftComment[]
    github_threads?: GitHubThread[]
} = {}) => {
    const story = groupedStory()
    const all_ids = story.stops.map(({ id }) => id)
    return mapHtml({
        story,
        line_counts: groupedLineCounts(),
        state: {
            current_stop_id: null,
            done_stop_ids: [],
            to_walk_stop_ids: all_ids,
            ...state,
        },
        approved_files,
        drafts,
        github_threads,
    })
}

describe('the flow map (#800)', () => {
    test('groupedStory before the walk has 5 lanes in order: g1, g2, g3, g4, loose-ends', () => {
        const html = renderGrouped()
        const lanes = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-lane' }) !== null,
        }).map((el) => attrOf({ attrs: el.attrs, name: 'data-lane' }))

        expect(lanes).toEqual(['g1', 'g2', 'g3', 'g4', 'loose-ends'])
    })

    test('the g1 lane heading shows Group 1 and Where it starts, and the last lane shows Loose ends', () => {
        const html = renderGrouped()
        const lanes = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-lane' }) !== null,
        })
        const g1_text = htmlText({ html: lanes[0]?.html ?? '' })
        const last_text = htmlText({ html: lanes.at(-1)?.html ?? '' })

        expect(g1_text).toContain('Group 1')
        expect(g1_text).toContain('Where it starts')
        expect(last_text).toContain('Loose ends')
    })

    test('groupedStory before the walk has 24 boxes, each with data-state="left"', () => {
        const html = renderGrouped()
        const boxes = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-stop-id' }) !== null &&
                attrOf({ attrs: el.attrs, name: 'data-state' }) !== null,
        })

        expect(boxes).toHaveLength(24)
        expect(
            boxes.every(
                (el) =>
                    attrOf({ attrs: el.attrs, name: 'data-state' }) === 'left'
            )
        ).toBe(true)
    })

    test('before the walk, the header says Not started: 24 stops, about 100 minutes and 0 of 24 stops done', () => {
        const text = htmlText({ html: renderGrouped() })

        expect(text).toContain('Not started: 24 stops, about 100 minutes')
        expect(text).toContain('0 of 24 stops done')
    })

    test('exactly one box (s6) has data-look-here="true", and where-to-look shows Stop 6: Step 6 and Author', () => {
        const html = renderGrouped()
        const look_here = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-look-here' }) === 'true',
        })
        const text = htmlText({ html })

        expect(look_here).toHaveLength(1)
        expect(
            attrOf({ attrs: look_here[0]?.attrs ?? '', name: 'data-stop-id' })
        ).toBe('s6')
        expect(text).toContain('Stop 6: Step 6')
        expect(text).toContain('Author')
    })

    test('the loose-ends box shows 24 files, +100 lines, and folds noise into 4 files, 6,153 lines with data-noise kinds', () => {
        const html = renderGrouped()
        const loose = boxOf({ html, stop_id: 's24' })
        const text = htmlText({ html: loose?.html ?? '' })
        const noise_kinds = findElements({
            html: loose?.html ?? '',
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-noise' }) !== null,
        }).map((el) => attrOf({ attrs: el.attrs, name: 'data-noise' }))

        expect(text).toContain('24 files')
        expect(text).toContain('+100 lines')
        expect(text).toContain('4 files, 6,153 lines')
        expect(noise_kinds).toEqual([
            'lockfile',
            'generated',
            'sample_data',
            'fixture',
        ])
    })

    test('the s1 box shows +20 lines with a 66% bar, and the s24 box has a 100% bar', () => {
        const html = renderGrouped()
        const s1 = boxOf({ html, stop_id: 's1' })
        const s24 = boxOf({ html, stop_id: 's24' })
        const s1_bar = findElements({
            html: s1?.html ?? '',
            where: (el) => /\bdata-bar\b/.test(el.attrs),
        })[0]
        const s24_bar = findElements({
            html: s24?.html ?? '',
            where: (el) => /\bdata-bar\b/.test(el.attrs),
        })[0]

        expect(htmlText({ html: s1?.html ?? '' })).toContain('+20 lines')
        expect(attrOf({ attrs: s1_bar?.attrs ?? '', name: 'style' })).toMatch(
            /width:\s*66%/
        )
        expect(attrOf({ attrs: s24_bar?.attrs ?? '', name: 'style' })).toMatch(
            /width:\s*100%/
        )
    })

    test('s3 shows blast 7, s4 shows untested, and s5 shows 2 flags', () => {
        const html = renderGrouped()

        expect(
            htmlText({ html: boxOf({ html, stop_id: 's3' })?.html ?? '' })
        ).toContain('blast 7')
        expect(
            htmlText({ html: boxOf({ html, stop_id: 's4' })?.html ?? '' })
        ).toContain('untested')
        expect(
            htmlText({ html: boxOf({ html, stop_id: 's5' })?.html ?? '' })
        ).toContain('2 flags')
    })

    test('before the walk, every segment from s1-s2 to s23-s24 has data-walked="false"', () => {
        const html = renderGrouped()
        const segments = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-segment' }) !== null,
        })
        const expected = Array.from(
            { length: 23 },
            (_, at) => `s${at + 1}-s${at + 2}`
        )

        expect(
            segments.map((el) =>
                attrOf({ attrs: el.attrs, name: 'data-segment' })
            )
        ).toEqual(expected)
        expect(
            segments.every(
                (el) =>
                    attrOf({ attrs: el.attrs, name: 'data-walked' }) === 'false'
            )
        ).toBe(true)
    })

    test('there are 31 data-kind links, including calls (s1 s2) and tests (s1 s24)', () => {
        const html = renderGrouped()
        const links = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-kind' }) !== null,
        }).map((el) => ({
            kind: attrOf({ attrs: el.attrs, name: 'data-kind' }),
            stop_ids: attrOf({ attrs: el.attrs, name: 'data-stop-ids' }),
        }))

        expect(links).toHaveLength(31)
        expect(links).toContainEqual({ kind: 'calls', stop_ids: 's1 s2' })
        expect(links).toContainEqual({ kind: 'tests', stop_ids: 's1 s24' })
    })

    test('the outside link is the only entry under a closed details summary Off the canvas: 1 link', () => {
        const html = renderGrouped()
        const details = findElements({
            html,
            where: (el) => el.tag.toLowerCase() === 'details',
        }).find((el) =>
            htmlText({ html: el.html }).includes('Off the canvas: 1 link')
        )
        const entries = findElements({
            html: details?.html ?? '',
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-kind' }) !== null,
        })
        const entry = entries[0]

        expect(details).toBeDefined()
        expect(/\bopen\b/i.test(details?.attrs ?? '')).toBe(false)
        expect(entries).toHaveLength(1)
        expect(attrOf({ attrs: entry?.attrs ?? '', name: 'data-kind' })).toBe(
            'reads'
        )
        expect(
            attrOf({ attrs: entry?.attrs ?? '', name: 'data-stop-ids' })
        ).toBe('s23')
        expect(htmlText({ html: entry?.html ?? '' })).toContain(
            'src/g4/s23.ts reads src/outside/config.ts'
        )
        expect(htmlText({ html: entry?.html ?? '' })).toContain(
            'not in this PR'
        )
    })

    test('every box has a side panel with Connections and the three stop-action buttons', () => {
        const html = renderGrouped()
        const stop_ids = Array.from({ length: 24 }, (_, at) => `s${at + 1}`)

        for (const stop_id of stop_ids) {
            const panel = panelOf({ html, stop_id })
            expect(panel).toBeDefined()
            const panel_html = panel?.html ?? ''
            expect(htmlText({ html: panel_html })).toContain('Connections')
            expect(htmlButtons({ html: panel_html })).toEqual(
                expect.arrayContaining([
                    'Open in diff',
                    'This stop looks good',
                    'Walk to the next stop',
                ])
            )
            const actions = findElements({
                html: panel_html,
                where: (el) =>
                    attrOf({ attrs: el.attrs, name: 'data-stop-action' }) !==
                    null,
            }).map((el) => ({
                action: attrOf({ attrs: el.attrs, name: 'data-stop-action' }),
                id: attrOf({ attrs: el.attrs, name: 'data-stop-id' }),
            }))
            expect(actions).toEqual(
                expect.arrayContaining([
                    { action: 'open', id: stop_id },
                    { action: 'mark_looks_good', id: stop_id },
                    { action: 'walk_next', id: stop_id },
                ])
            )
        }
    })

    test('s1 shows Reached from: Start here, s2 shows Reached from: Stop 1: Step 1 and Change 2 · lines 1 to 20, and s24 has no Reached from', () => {
        const html = renderGrouped()
        const s1_text = htmlText({
            html: panelOf({ html, stop_id: 's1' })?.html ?? '',
        })
        const s2_text = htmlText({
            html: panelOf({ html, stop_id: 's2' })?.html ?? '',
        })
        const s24_text = htmlText({
            html: panelOf({ html, stop_id: 's24' })?.html ?? '',
        })

        expect(s1_text).toContain('Reached from: Start here')
        expect(s2_text).toContain('Reached from: Stop 1: Step 1')
        expect(s2_text).toContain('Change 2 · lines 1 to 20')
        expect(s24_text).not.toContain('Reached from')
    })

    test('no map element has data-path, data-id or data-url, and acquireVsCodeApi is called only once', () => {
        const html = renderGrouped()
        const clean = stripScriptsAndStyles({ html })
        const forbidden = findElements({
            html: clean,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-path' }) !== null ||
                attrOf({ attrs: el.attrs, name: 'data-id' }) !== null ||
                attrOf({ attrs: el.attrs, name: 'data-url' }) !== null,
        })
        const acquire_calls = html.match(/acquireVsCodeApi\s*\(/g) ?? []

        expect(forbidden).toEqual([])
        expect(acquire_calls).toHaveLength(1)
    })

    test('with s6 current and s1–s5 done, the header shows Stop 6 of 24 · 19 stops and about 82 minutes left, 5 of 24 stops done, and one You are here', () => {
        const text = htmlText({
            html: renderGrouped({
                state: {
                    current_stop_id: 's6',
                    done_stop_ids: ['s1', 's2', 's3', 's4', 's5'],
                },
            }),
        })

        expect(text).toContain(
            'Stop 6 of 24 · 19 stops and about 82 minutes left'
        )
        expect(text).toContain('5 of 24 stops done')
        expect(text.split('You are here')).toHaveLength(2)
    })

    test('with s6 current and s1–s5 done, segments s1-s2 through s5-s6 are walked and all others are not', () => {
        const html = renderGrouped({
            state: {
                current_stop_id: 's6',
                done_stop_ids: ['s1', 's2', 's3', 's4', 's5'],
            },
        })
        const segments = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-segment' }) !== null,
        })
        const walked = segments
            .filter(
                (el) =>
                    attrOf({ attrs: el.attrs, name: 'data-walked' }) === 'true'
            )
            .map((el) => attrOf({ attrs: el.attrs, name: 'data-segment' }))
        const not_walked = segments
            .filter(
                (el) =>
                    attrOf({ attrs: el.attrs, name: 'data-walked' }) === 'false'
            )
            .map((el) => attrOf({ attrs: el.attrs, name: 'data-segment' }))

        expect(walked).toEqual(['s1-s2', 's2-s3', 's3-s4', 's4-s5', 's5-s6'])
        expect(not_walked).toHaveLength(18)
    })

    test('with every stop done and s24 still current, the header says All 24 stops walked and 24 of 24 stops done, with no current box or You are here', () => {
        const all_ids = Array.from({ length: 24 }, (_, at) => `s${at + 1}`)
        const html = renderGrouped({
            state: {
                current_stop_id: 's24',
                done_stop_ids: all_ids,
                to_walk_stop_ids: all_ids,
            },
        })
        const text = htmlText({ html })
        const current_boxes = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-state' }) === 'current',
        })

        expect(text).toContain('All 24 stops walked')
        expect(text).toContain('24 of 24 stops done')
        expect(current_boxes).toEqual([])
        expect(text).not.toContain('You are here')
    })

    test('with no stops to walk, the header says Nothing new to walk', () => {
        const text = htmlText({
            html: renderGrouped({
                state: {
                    current_stop_id: null,
                    done_stop_ids: [],
                    to_walk_stop_ids: [],
                },
            }),
        })

        expect(text).toContain('Nothing new to walk')
    })

    test('with one file looking good, one line draft and one thread, the progress line uses singular forms', () => {
        const text = htmlText({
            html: renderGrouped({
                approved_files: ['src/g1/s1.ts'],
                drafts: [
                    {
                        id: 'd1',
                        kind: 'line',
                        path: 'src/g1/s1.ts',
                        side: 'head',
                        start_line: 1,
                        end_line: 1,
                        body: 'Check this line.',
                    },
                ],
                github_threads: [
                    {
                        path: 'src/g1/s2.ts',
                        side: 'head',
                        start_line: 1,
                        end_line: 1,
                        comments: [{ author: 'octocat', body: 'Looks solid.' }],
                    },
                ],
            }),
        })

        expect(text).toContain(
            '0 of 24 stops done · 1 file looks good · 1 draft · 1 thread'
        )
    })

    test('the old small story with line_counts null has changed-files and loose-ends lanes and walk box group changed-files', () => {
        const base = smallStory()
        const html = mapHtml({
            story: base,
            line_counts: null,
            state: {
                current_stop_id: null,
                done_stop_ids: [],
                to_walk_stop_ids: base.stops.map(({ id }) => id),
            },
            approved_files: [],
            drafts: [],
            github_threads: [],
        })
        const lanes = findElements({
            html,
            where: (el) =>
                attrOf({ attrs: el.attrs, name: 'data-lane' }) !== null,
        }).map((el) => attrOf({ attrs: el.attrs, name: 'data-lane' }))
        const s1 = boxOf({ html, stop_id: 's1' })

        expect(lanes).toEqual(['changed-files', 'loose-ends'])
        expect(attrOf({ attrs: s1?.attrs ?? '', name: 'data-group-id' })).toBe(
            'changed-files'
        )
    })

    test('the old small story with line_counts null says Not started: 2 stops, about 10 minutes, Not tied to a stop., and has no data-bar', () => {
        const base = smallStory()
        const html = mapHtml({
            story: base,
            line_counts: null,
            state: {
                current_stop_id: null,
                done_stop_ids: [],
                to_walk_stop_ids: base.stops.map(({ id }) => id),
            },
            approved_files: [],
            drafts: [],
            github_threads: [],
        })
        const text = htmlText({ html })
        const bars = findElements({
            html,
            where: (el) => /\bdata-bar\b/.test(el.attrs),
        })

        expect(text).toContain('Not started: 2 stops, about 10 minutes')
        expect(text).toContain('Not tied to a stop.')
        expect(bars).toEqual([])
    })
})
