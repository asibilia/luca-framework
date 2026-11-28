import type { LineCounts } from './load-pull-request'
import type { WalkState } from './walk-place'

import type {
    StoryNoiseKind,
    StoryStop,
} from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * Pure, HTML-free model, walk-state derivation, formatting, and noise
 * classification shared by the flow Map panel's header and body (#776).
 */

export type MapStopState = 'done' | 'current' | 'left' | 'unchanged'
export type MapWalkState = Omit<WalkState, 'stop_ids'>
export type MapLink = Story['map']['links'][number]

export type ResolvedLink = {
    link: MapLink
    lit_stop_ids: string[]
    from_first: string | null
    to_first: string | null
    outside: boolean
    on_canvas: boolean
}

export type MapModel = {
    has_line_counts: boolean
    all_walked: boolean
    effective_current_id: string | null
    to_walk_stops: StoryStop[]
    done_to_walk: number
    left_stops: StoryStop[]
    stop_states: Map<string, MapStopState>
    stop_lines: Map<string, number>
    max_lines: number
    first_stop_by_path: Map<string, string>
    noise_by_path: Map<string, StoryNoiseKind | null>
    stop_by_change_id: Map<string, { stop: StoryStop; index: number }>
    resolved_links: ResolvedLink[]
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

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

/** Formats an integer with en-US grouping (e.g. 6,153). */
export const formatNumber = ({ value }: { value: number }): string =>
    NUMBER_FORMAT.format(value)

/** Picks the singular or plural word for `count`. */
export const plural = ({
    count,
    one,
    many,
}: {
    count: number
    one: string
    many: string
}): string => (count === 1 ? one : many)

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

/** Noise kind for a map file, falling back to known lockfile names for old stories. */
export const noiseKindOf = ({
    file,
}: {
    file: Story['map']['files'][number]
}): StoryNoiseKind | null => {
    if (file.noise != null) return file.noise
    const name = file.path.split('/').at(-1) ?? file.path
    return LOCKFILE_NAMES.has(name) ? 'lockfile' : null
}

/** Unique file paths changed in `stop`, in first-seen order. */
export const stopFilesOf = ({ stop }: { stop: StoryStop }): string[] => [
    ...new Set(stop.changes.map(({ path }) => path)),
]

/** True when at least one stop is to walk and every stop to walk is done. */
export const isAllWalked = ({ state }: { state: MapWalkState }): boolean => {
    if (state.to_walk_stop_ids.length === 0) return false
    const done = new Set(state.done_stop_ids)
    return state.to_walk_stop_ids.every((id) => done.has(id))
}

const computeStopStates = ({
    story,
    state,
    to_walk,
    no_current,
}: {
    story: Story
    state: MapWalkState
    to_walk: Set<string>
    no_current: boolean
}): Map<string, MapStopState> => {
    const done = new Set(state.done_stop_ids)
    const states = new Map<string, MapStopState>()
    for (const stop of story.stops) {
        if (!no_current && state.current_stop_id === stop.id) {
            states.set(stop.id, 'current')
        } else if (done.has(stop.id)) {
            states.set(stop.id, 'done')
        } else if (!to_walk.has(stop.id)) {
            states.set(stop.id, 'unchanged')
        } else {
            states.set(stop.id, 'left')
        }
    }
    return states
}

/** Computes each stop's visual state (`current`, `done`, `unchanged`, `left`). */
export const stopStatesOf = ({
    story,
    state,
}: {
    story: Story
    state: MapWalkState
}): Map<string, MapStopState> => {
    const to_walk = new Set(state.to_walk_stop_ids)
    const has_to_walk = story.stops.some((stop) => to_walk.has(stop.id))
    return computeStopStates({
        story,
        state,
        to_walk,
        no_current: isAllWalked({ state }) || !has_to_walk,
    })
}

/** Precomputes walk progress, line counts, states, noise kinds, and link endpoints for `story`. */
export const buildMapModel = ({
    story,
    line_counts,
    state,
}: {
    story: Story
    line_counts: LineCounts | null
    state: MapWalkState
}): MapModel => {
    const all_walked = isAllWalked({ state })
    const to_walk = new Set(state.to_walk_stop_ids)
    const to_walk_stops = story.stops.filter((stop) => to_walk.has(stop.id))
    const no_current = all_walked || to_walk_stops.length === 0
    const effective_current_id = no_current ? null : state.current_stop_id
    const stop_states = computeStopStates({ story, state, to_walk, no_current })
    const done_to_walk = to_walk_stops.filter(
        (stop) => stop_states.get(stop.id) === 'done'
    ).length
    const left_stops = to_walk_stops.filter(
        (stop) => stop_states.get(stop.id) !== 'done'
    )

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
        has_line_counts: line_counts !== null,
        all_walked,
        effective_current_id,
        to_walk_stops,
        done_to_walk,
        left_stops,
        stop_states,
        stop_lines,
        max_lines,
        first_stop_by_path,
        noise_by_path,
        stop_by_change_id,
        resolved_links,
    }
}
