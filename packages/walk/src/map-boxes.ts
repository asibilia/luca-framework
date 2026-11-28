import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import type { LineCounts } from './load-pull-request'
import {
    formatNumber,
    plural,
    stopStatesOf,
    type MapStopState,
} from './map-header'
import type { WalkState } from './walk-place'
import { escapeHtml } from './webview-html'

import type {
    StoryNoiseKind,
    StoryStop,
} from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * Lanes, stop boxes, walk-line/link data, off-canvas links, and side
 * panels for the flow Map panel (#776, section 4).
 */

type MapLink = Story['map']['links'][number]

const LOCKFILE_NAMES = new Set([
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'poetry.lock',
    'Gemfile.lock',
    'go.sum',
])

/**
 * A link as one line.
 *
 * @example
 * linkLine({ link }) // 'src/a.ts calls src/b.ts - on every ticket'
 */
export const linkLine = ({ link }: { link: MapLink }): string => {
    const line = `${link.from_path} ${link.kind} ${link.to_path}`
    return link.note === null ? line : `${line} - ${link.note}`
}

const noiseKindOf = ({
    file,
}: {
    file: Story['map']['files'][number]
}): StoryNoiseKind | null => {
    if (file.noise != null) return file.noise
    const name = file.path.split('/').at(-1) ?? file.path
    return LOCKFILE_NAMES.has(name) ? 'lockfile' : null
}

const stopFilesOf = ({ stop }: { stop: StoryStop }): string[] => [
    ...new Set(stop.changes.map(({ path }) => path)),
]

type ResolvedLink = {
    link: MapLink
    lit_stop_ids: string[]
    from_first: string | null
    to_first: string | null
    outside: boolean
    on_canvas: boolean
}

export type MapModel = {
    stop_states: Map<string, MapStopState>
    stop_lines: Map<string, number>
    max_lines: number
    first_stop_by_path: Map<string, string>
    noise_by_path: Map<string, StoryNoiseKind | null>
    stop_by_change_id: Map<string, { stop: StoryStop; index: number }>
    resolved_links: ResolvedLink[]
}

/** Precomputes line counts, states, noise kinds, and link endpoints for `story`. */
export const buildMapModel = ({
    story,
    line_counts,
    state,
}: {
    story: Story
    line_counts: LineCounts | null
    state: WalkState
}): MapModel => {
    const stop_states = stopStatesOf({ story, state })
    const noise_by_path = new Map<string, StoryNoiseKind | null>()
    for (const file of story.map.files) {
        noise_by_path.set(file.path, noiseKindOf({ file }))
    }

    const first_stop_by_path = new Map<string, string>()
    const stops_by_path = new Map<string, string[]>()
    const stop_by_change_id = new Map<
        string,
        { stop: StoryStop; index: number }
    >()
    story.stops.forEach((stop, index) => {
        for (const change of stop.changes) {
            stop_by_change_id.set(change.id, { stop, index })
            if (!first_stop_by_path.has(change.path)) {
                first_stop_by_path.set(change.path, stop.id)
            }
            const list = stops_by_path.get(change.path) ?? []
            if (!list.includes(stop.id)) list.push(stop.id)
            stops_by_path.set(change.path, list)
        }
    })

    const stop_lines = new Map<string, number>()
    let max_lines = 0
    for (const stop of story.stops) {
        let lines = 0
        if (line_counts !== null) {
            for (const path of stopFilesOf({ stop })) {
                if (first_stop_by_path.get(path) !== stop.id) continue
                if ((noise_by_path.get(path) ?? null) !== null) continue
                lines += line_counts[path]?.added ?? 0
            }
        }
        stop_lines.set(stop.id, lines)
        if (lines > max_lines) max_lines = lines
    }

    const stop_order = new Map<string, number>()
    story.stops.forEach((stop, index) => stop_order.set(stop.id, index))

    const resolved_links: ResolvedLink[] = story.map.links.map((link) => {
        const from_stops = stops_by_path.get(link.from_path) ?? []
        const to_stops = stops_by_path.get(link.to_path) ?? []
        const lit_stop_ids = [
            ...new Set([...from_stops, ...to_stops]),
        ].toSorted(
            (a, b) => (stop_order.get(a) ?? 0) - (stop_order.get(b) ?? 0)
        )
        const from_first = first_stop_by_path.get(link.from_path) ?? null
        const to_first = first_stop_by_path.get(link.to_path) ?? null
        const outside = from_first === null || to_first === null
        const same_box = from_first !== null && from_first === to_first
        return {
            link,
            lit_stop_ids,
            from_first,
            to_first,
            outside,
            on_canvas: !outside && !same_box,
        }
    })

    return {
        stop_states,
        stop_lines,
        max_lines,
        first_stop_by_path,
        noise_by_path,
        stop_by_change_id,
        resolved_links,
    }
}

const renderBox = ({
    stop,
    group_id,
    story,
    model,
    line_counts,
    drafts,
    github_threads,
}: {
    stop: StoryStop
    group_id: string
    story: Story
    model: MapModel
    line_counts: LineCounts | null
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    const stop_state = model.stop_states.get(stop.id) ?? 'left'
    const look_here = story.summary.feedback_wanted.stop_id === stop.id
    const files = stopFilesOf({ stop })
    const lines = model.stop_lines.get(stop.id) ?? 0
    const max_blast = stop.changes.reduce(
        (max, change) => Math.max(max, change.blast_radius.dependents_total),
        0
    )
    const untested = stop.changes.some((change) => !change.proof.covered)
    const flag_count = stop.changes.reduce(
        (sum, change) => sum + change.flags.length,
        0
    )
    const first_files = new Set(
        files.filter((path) => model.first_stop_by_path.get(path) === stop.id)
    )
    const draft_count = drafts.filter(
        (draft) => draft.path !== null && first_files.has(draft.path)
    ).length
    const thread_count = github_threads.filter((thread) =>
        first_files.has(thread.path)
    ).length

    const badges: string[] = []
    if (stop_state === 'current') {
        badges.push('<span class="badge badge-current">You are here</span>')
    }
    if (look_here) {
        badges.push('<span class="badge badge-look">Look here</span>')
    }

    const metrics: string[] = []
    if (line_counts !== null && lines > 0) {
        metrics.push(
            `<span class="metric">+${formatNumber({ value: lines })} ${plural({ count: lines, one: 'line', many: 'lines' })}</span>`
        )
    }
    if (max_blast > 0) {
        metrics.push(
            `<span class="metric">blast ${formatNumber({ value: max_blast })}</span>`
        )
    }
    if (untested) {
        metrics.push('<span class="metric metric-warn">untested</span>')
    }
    if (flag_count > 0) {
        metrics.push(
            `<span class="metric metric-flag">${formatNumber({ value: flag_count })} ${plural({ count: flag_count, one: 'flag', many: 'flags' })}</span>`
        )
    }
    if (draft_count > 0) {
        metrics.push(
            `<span class="metric">${formatNumber({ value: draft_count })} ${plural({ count: draft_count, one: 'draft', many: 'drafts' })}</span>`
        )
    }
    if (thread_count > 0) {
        metrics.push(
            `<span class="metric">${formatNumber({ value: thread_count })} ${plural({ count: thread_count, one: 'thread', many: 'threads' })}</span>`
        )
    }

    const bar_html =
        line_counts !== null && model.max_lines > 0
            ? `<div class="bar-track"><div class="bar-fill" data-bar style="width:${Math.round((100 * Math.log(1 + lines)) / Math.log(1 + model.max_lines))}%"></div></div>`
            : ''

    const subtitle =
        stop.kind === 'loose_ends'
            ? `${formatNumber({ value: files.length })} ${plural({ count: files.length, one: 'file', many: 'files' })}`
            : (stop.path ?? '')

    let loose_html = ''
    if (stop.kind === 'loose_ends') {
        const normal_files = files.filter(
            (path) => (model.noise_by_path.get(path) ?? null) === null
        )
        const noise_files = files
            .map((path) => ({
                path,
                kind: model.noise_by_path.get(path) ?? null,
            }))
            .filter(
                (entry): entry is { path: string; kind: StoryNoiseKind } =>
                    entry.kind !== null
            )
        const normal_list =
            normal_files.length === 0
                ? ''
                : `<ul class="loose-files">${normal_files
                      .map((path) => `<li>${escapeHtml({ text: path })}</li>`)
                      .join('')}</ul>`
        let noise_list = ''
        if (noise_files.length > 0) {
            const noise_lines =
                line_counts === null
                    ? 0
                    : noise_files.reduce(
                          (sum, { path }) =>
                              sum +
                              (line_counts[path]?.added ?? 0) +
                              (line_counts[path]?.removed ?? 0),
                          0
                      )
            const summary_text =
                line_counts === null
                    ? `${formatNumber({ value: noise_files.length })} ${plural({ count: noise_files.length, one: 'file', many: 'files' })}`
                    : `${formatNumber({ value: noise_files.length })} ${plural({ count: noise_files.length, one: 'file', many: 'files' })}, ${formatNumber({ value: noise_lines })} ${plural({ count: noise_lines, one: 'line', many: 'lines' })}`
            noise_list = [
                '<details class="noise-fold">',
                `<summary>${escapeHtml({ text: summary_text })}</summary>`,
                '<ul>',
                ...noise_files.map(
                    ({ path, kind }) =>
                        `<li data-noise="${escapeHtml({ text: kind })}">${escapeHtml({ text: path })}</li>`
                ),
                '</ul>',
                '</details>',
            ].join('\n')
        }
        loose_html = `${normal_list}${noise_list}`
    }

    const look_attr = look_here ? ' data-look-here="true"' : ''
    return [
        `<article class="stop-box" data-stop-id="${escapeHtml({ text: stop.id })}" data-group-id="${escapeHtml({ text: group_id })}" data-state="${stop_state}"${look_attr}>`,
        badges.length === 0
            ? ''
            : `<div class="box-badges">${badges.join(' ')}</div>`,
        `<div class="box-title">${escapeHtml({ text: stop.title })}</div>`,
        `<div class="box-file">${escapeHtml({ text: subtitle })}</div>`,
        metrics.length === 0
            ? ''
            : `<div class="box-metrics">${metrics.join(' ')}</div>`,
        bar_html,
        loose_html,
        '</article>',
    ]
        .filter((part) => part !== '')
        .join('\n')
}

/** Renders the CSS grid of lanes and their stop boxes. */
export const mapLanesHtml = ({
    story,
    model,
    line_counts,
    drafts,
    github_threads,
}: {
    story: Story
    model: MapModel
    line_counts: LineCounts | null
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    type LaneSpec = {
        id: string
        title: string
        note: string | null
        stops: StoryStop[]
    }
    const walk_stops = story.stops.filter((stop) => stop.kind === 'walk')
    const loose_stop =
        story.stops.find((stop) => stop.kind === 'loose_ends') ?? null
    const lanes: LaneSpec[] =
        story.map.groups !== undefined
            ? story.map.groups.map((group) => ({
                  id: group.id,
                  title: group.title,
                  note: group.note,
                  stops: walk_stops.filter(
                      (stop) => stop.group_id === group.id
                  ),
              }))
            : [
                  {
                      id: 'changed-files',
                      title: 'Changed files',
                      note: null,
                      stops: walk_stops,
                  },
              ]
    if (loose_stop !== null) {
        lanes.push({
            id: 'loose-ends',
            title: 'Loose ends',
            note: null,
            stops: [loose_stop],
        })
    }

    return [
        `<div class="lanes" style="--lane-count:${lanes.length}">`,
        ...lanes.map((lane) =>
            [
                `<section class="lane" data-lane="${escapeHtml({ text: lane.id })}">`,
                `<h2 class="lane-title">${escapeHtml({ text: lane.title })}</h2>`,
                lane.note === null
                    ? ''
                    : `<p class="lane-note">${escapeHtml({ text: lane.note })}</p>`,
                '<div class="lane-boxes">',
                ...lane.stops.map((stop) =>
                    renderBox({
                        stop,
                        group_id: lane.id,
                        story,
                        model,
                        line_counts,
                        drafts,
                        github_threads,
                    })
                ),
                '</div>',
                '</section>',
            ]
                .filter((part) => part !== '')
                .join('\n')
        ),
        '</div>',
    ].join('\n')
}

/** Renders the inline SVG layer for the walk line and canvas links. */
export const mapSvgHtml = ({
    story,
    model,
}: {
    story: Story
    model: MapModel
}): string => {
    const segments: string[] = []
    for (let at = 0; at < story.stops.length - 1; at += 1) {
        const from = story.stops[at]
        const to = story.stops[at + 1]
        if (from === undefined || to === undefined) continue
        const from_state = model.stop_states.get(from.id)
        const to_state = model.stop_states.get(to.id)
        const walked =
            from_state === 'done' &&
            (to_state === 'done' || to_state === 'current')
        segments.push(
            `<path class="walk-seg" data-segment="${escapeHtml({ text: `${from.id}-${to.id}` })}" data-from-stop="${escapeHtml({ text: from.id })}" data-to-stop="${escapeHtml({ text: to.id })}" data-walked="${walked ? 'true' : 'false'}" d=""></path>`
        )
    }

    const edges = model.resolved_links
        .filter((resolved) => resolved.on_canvas)
        .map(
            (resolved) =>
                `<path class="link-edge" data-kind="${escapeHtml({ text: resolved.link.kind })}" data-stop-ids="${escapeHtml({ text: resolved.lit_stop_ids.join(' ') })}" data-from-stop="${escapeHtml({ text: resolved.from_first ?? '' })}" data-to-stop="${escapeHtml({ text: resolved.to_first ?? '' })}" d=""></path>`
        )

    return [
        '<svg class="flow-svg" aria-hidden="true">',
        ...edges,
        ...segments,
        '</svg>',
    ].join('\n')
}

/** Renders the closed `<details>` list of links that do not sit on the canvas. */
export const mapOffCanvasHtml = ({ model }: { model: MapModel }): string => {
    const off = model.resolved_links.filter((resolved) => !resolved.on_canvas)
    if (off.length === 0) return ''
    return [
        '<details class="off-canvas">',
        `<summary>Off the canvas: ${formatNumber({ value: off.length })} ${plural({ count: off.length, one: 'link', many: 'links' })}</summary>`,
        '<ul>',
        ...off.map((resolved) => {
            const extra = resolved.outside
                ? ' <span class="badge">not in this PR</span>'
                : ''
            return `<li data-kind="${escapeHtml({ text: resolved.link.kind })}" data-stop-ids="${escapeHtml({ text: resolved.lit_stop_ids.join(' ') })}">${escapeHtml({ text: linkLine({ link: resolved.link }) })}${extra}</li>`
        }),
        '</ul>',
        '</details>',
    ].join('\n')
}

const reachedFromHtml = ({
    stop,
    model,
}: {
    stop: StoryStop
    model: MapModel
}): string => {
    if (stop.kind === 'loose_ends') return ''
    for (const change of stop.changes) {
        const from_id = change.how_we_got_here.from_change_id
        if (from_id === null) continue
        const origin = model.stop_by_change_id.get(from_id)
        if (origin !== undefined && origin.stop.id !== stop.id) {
            return `<p class="reached-from">Reached from: <button type="button" class="link-btn" data-select-stop="${escapeHtml({ text: origin.stop.id })}">Stop ${formatNumber({ value: origin.index + 1 })}: ${escapeHtml({ text: origin.stop.title })}</button></p>`
        }
    }
    return '<p class="reached-from">Reached from: Start here</p>'
}

/** Renders the hidden side panel for every stop in `story`. */
export const mapPanelsHtml = ({
    story,
    model,
}: {
    story: Story
    model: MapModel
}): string => {
    const panels = story.stops.map((stop, index) => {
        const lit = model.resolved_links.filter((resolved) =>
            resolved.lit_stop_ids.includes(stop.id)
        )
        const connections_html =
            lit.length === 0
                ? '<p class="muted">No links.</p>'
                : `<ul class="connections">${lit
                      .map((resolved) => {
                          const extra = resolved.outside
                              ? ' <span class="badge">not in this PR</span>'
                              : ''
                          return `<li data-connection>${escapeHtml({ text: linkLine({ link: resolved.link }) })}${extra}</li>`
                      })
                      .join('')}</ul>`

        const changes_html = `<ul class="changes">${stop.changes
            .map((change) => {
                const span =
                    change.start_line === change.end_line
                        ? `line ${formatNumber({ value: change.start_line })}`
                        : `lines ${formatNumber({ value: change.start_line })} to ${formatNumber({ value: change.end_line })}`
                return `<li>${escapeHtml({ text: `${change.title} · ${span}` })}</li>`
            })
            .join('')}</ul>`

        const sid = escapeHtml({ text: stop.id })
        return [
            `<section class="side-panel" data-panel-for="${sid}" hidden>`,
            `<h3>Stop ${formatNumber({ value: index + 1 })}: ${escapeHtml({ text: stop.title })}</h3>`,
            `<p class="why-here">${escapeHtml({ text: stop.why_here })}</p>`,
            reachedFromHtml({ stop, model }),
            '<h4>Connections</h4>',
            connections_html,
            '<h4>Changes</h4>',
            changes_html,
            '<div class="panel-actions">',
            `<button type="button" data-stop-action="open" data-stop-id="${sid}">Open in diff</button>`,
            `<button type="button" data-stop-action="mark_looks_good" data-stop-id="${sid}">This stop looks good</button>`,
            `<button type="button" data-stop-action="walk_next" data-stop-id="${sid}">Walk to the next stop</button>`,
            '</div>',
            '</section>',
        ]
            .filter((part) => part !== '')
            .join('\n')
    })
    return `<aside class="side-panels">${panels.join('\n')}</aside>`
}
