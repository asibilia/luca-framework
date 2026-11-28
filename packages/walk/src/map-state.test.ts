import { describe, expect, test } from 'bun:test'

import { mapHtml } from './map-html'
import { MAP_SCRIPT } from './map-script'
import { groupedLineCounts } from './testing/grouped-line-counts'
import { htmlText } from './testing/html-text'
import { attrOf, findElements } from './testing/map-dom'

import { groupedStory } from '../../engine/src/story/testing/grouped-story'

/**
 * What the Map panel keeps across a redraw (#776 review): the `<details>`
 * folds carry stable `data-fold` keys, and the page script restores the
 * picked stop, scroll position and open folds from `vscode.getState`,
 * merging what it saves. The repo has no DOM runner, so the script runs
 * against a small fake `document` and `window`.
 */

type Listener = (event: { target: unknown }) => void

/** A fake element: attributes, `open` for folds, and the calls the script makes. */
const fakeElement = ({ attrs }: { attrs: Record<string, string> }) => {
    const element = {
        attrs: { ...attrs },
        open: false,
        hidden: false,
        getAttribute: (name: string) => element.attrs[name] ?? null,
        setAttribute: (name: string, value: string) => {
            element.attrs[name] = value
        },
        toggleAttribute: () => undefined,
        classList: { toggle: () => undefined },
        closest: (selector: string) =>
            selector === 'details[data-fold]' && 'data-fold' in element.attrs
                ? element
                : null,
        getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 10,
            height: 10,
        }),
    }
    return element
}

const runScript = ({ saved }: { saved: unknown }) => {
    const folds = [
        fakeElement({ attrs: { 'data-fold': 'noise-s24' } }),
        fakeElement({ attrs: { 'data-fold': 'off-canvas' } }),
    ]
    const stage = fakeElement({ attrs: {} })
    const doc_listeners: Record<string, Listener> = {}
    const win_listeners: Record<string, Listener> = {}
    const frames: (() => void)[] = []
    const scrolled: [number, number][] = []
    const observed: unknown[] = []
    let state = saved
    const vscode = {
        getState: () => state,
        setState: (next: unknown) => {
            state = next
        },
        postMessage: () => undefined,
    }
    const document = {
        querySelectorAll: (selector: string) =>
            selector === 'details[data-fold]' ? folds : [],
        querySelector: (selector: string) =>
            selector === '.canvas-stage' ? stage : null,
        addEventListener: (type: string, listener: Listener) => {
            doc_listeners[type] = listener
        },
    }
    const window = {
        scrollX: 0,
        scrollY: 0,
        scrollTo: (x: number, y: number) => {
            scrolled.push([x, y])
        },
        addEventListener: (type: string, listener: Listener) => {
            win_listeners[type] = listener
        },
    }
    const FakeResizeObserver = function (this: unknown) {
        return { observe: (target: unknown) => observed.push(target) }
    }
    new Function(
        'vscode',
        'document',
        'window',
        'requestAnimationFrame',
        'ResizeObserver',
        'Element',
        MAP_SCRIPT
    )(
        vscode,
        document,
        window,
        (frame: () => void) => frames.push(frame),
        FakeResizeObserver,
        Object
    )
    const flush = () => {
        for (const frame of frames.splice(0)) frame()
    }
    return {
        folds,
        stage,
        window,
        doc_listeners,
        win_listeners,
        scrolled,
        observed,
        flush,
        state: () => state,
    }
}

describe('the map keeps its place across redraws', () => {
    test('each fold has a stable data-fold key and is closed by default', () => {
        const html = mapHtml({
            story: groupedStory(),
            line_counts: groupedLineCounts(),
            state: {
                current_stop_id: null,
                done_stop_ids: [],
                to_walk_stop_ids: groupedStory().stops.map(({ id }) => id),
            },
            approved_files: [],
            drafts: [],
            github_threads: [],
        })
        const folds = findElements({
            html,
            where: (el) => el.tag === 'details',
        })
        expect(
            folds.map((el) => attrOf({ attrs: el.attrs, name: 'data-fold' }))
        ).toEqual(['noise-s24', 'off-canvas'])
        for (const el of folds) {
            expect(/\bopen\b/.test(el.attrs)).toBe(false)
        }
    })

    test('the script reopens saved folds, scrolls back and watches the canvas size', () => {
        const run = runScript({
            saved: { open_details: ['noise-s24'], scroll_x: 0, scroll_y: 340 },
        })
        run.flush()
        expect(run.folds.map(({ open }) => open)).toEqual([true, false])
        expect(run.scrolled).toEqual([[0, 340]])
        expect(run.observed).toEqual([run.stage])
    })

    test('opening a fold and scrolling save into the state without losing the picked stop', () => {
        const run = runScript({ saved: { selected_stop_id: 's3' } })
        run.flush()
        const [noise] = run.folds
        if (noise === undefined) throw new Error('no noise fold')
        noise.open = true
        run.doc_listeners.toggle?.({ target: noise })
        run.window.scrollY = 120
        run.win_listeners.scroll?.({ target: run.window })
        run.flush()
        expect(run.state()).toEqual({
            selected_stop_id: 's3',
            open_details: ['noise-s24'],
            scroll_x: 0,
            scroll_y: 120,
        })
    })

    test('on a second visit with 3 stops to walk, all done, the header counts the stops to walk', () => {
        const text = htmlText({
            html: mapHtml({
                story: groupedStory(),
                line_counts: groupedLineCounts(),
                state: {
                    current_stop_id: 's24',
                    done_stop_ids: ['s3', 's9', 's24'],
                    to_walk_stop_ids: ['s3', 's9', 's24'],
                },
                approved_files: [],
                drafts: [],
                github_threads: [],
            }),
        })
        expect(text).toContain('All 3 stops walked')
        expect(text).toContain('3 of 3 stops done')
    })
})
