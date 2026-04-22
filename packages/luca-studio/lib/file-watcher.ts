/**
 * Singleton file-watcher module for Luca Studio live-reload SSE events.
 *
 * Uses chokidar to watch `.planning/`, `src/agents/`, `src/skills/`, and
 * `src/rules/` for file-level changes. Exposes a subscribe/unsubscribe
 * pattern with reference counting so the watcher starts on first subscriber
 * and stops when the last subscriber unsubscribes.
 *
 * A `globalThis` guard prevents duplicate watchers during Next.js HMR
 * dev-server restarts (module scope re-executes but globalThis persists).
 *
 * @example
 * ```typescript
 * import { subscribe, unsubscribe } from "~/lib/file-watcher";
 *
 * const unsub = subscribe((event) => {
 *   console.log(event.type, event.path);
 * });
 *
 * // Later, when the SSE connection closes:
 * unsub();
 * ```
 */
import { join, relative } from 'node:path'

import chokidar from 'chokidar'

import { resolveProjectRoot } from '~/lib/project-root'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** File-change event payload dispatched to subscribers. */
export interface FileChangeEvent {
    /** The kind of filesystem change. */
    type: 'add' | 'change' | 'unlink'
    /** Path relative to the project root (forward-slash separated). */
    path: string
    /** ISO-8601 timestamp of when the event was observed. */
    timestamp: string
}

/** Callback signature for file-change subscribers. */
export type FileChangeListener = (event: FileChangeEvent) => void

// ---------------------------------------------------------------------------
// Singleton state (survives HMR via globalThis)
// ---------------------------------------------------------------------------

interface WatcherState {
    watcher: chokidar.FSWatcher | null
    listeners: Set<FileChangeListener>
    projectRoot: string | null
}

const GLOBAL_KEY = '__luca_studio_file_watcher__' as const

/**
 * Retrieve (or create) the module-scoped singleton state attached to
 * `globalThis` so it survives Next.js HMR module re-evaluation.
 */
function getState(): WatcherState {
    const g = globalThis as unknown as Record<string, WatcherState | undefined>
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {
            watcher: null,
            listeners: new Set(),
            projectRoot: null,
        }
    }
    return g[GLOBAL_KEY]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Directories to watch, relative to the project root. */
const WATCH_DIRS = ['.planning', 'src/agents', 'src/skills', 'src/rules']

/**
 * Broadcast a file-change event to every active listener.
 *
 * @param state - The singleton watcher state.
 * @param type - The kind of change detected.
 * @param absolutePath - Absolute filesystem path of the changed file.
 */
function broadcast(
    state: WatcherState,
    type: FileChangeEvent['type'],
    absolutePath: string
): void {
    const relativePath = state.projectRoot
        ? relative(state.projectRoot, absolutePath).replace(/\\/g, '/')
        : absolutePath

    const event: FileChangeEvent = {
        type,
        path: relativePath,
        timestamp: new Date().toISOString(),
    }

    for (const listener of state.listeners) {
        try {
            listener(event)
        } catch {
            // Swallow per-listener errors so one broken subscriber cannot
            // prevent others from receiving the event.
        }
    }
}

/**
 * Start the chokidar watcher (idempotent -- no-ops if already running).
 *
 * @param state - The singleton watcher state.
 */
async function ensureWatcher(state: WatcherState): Promise<void> {
    if (state.watcher) return

    const root = await resolveProjectRoot()
    state.projectRoot = root

    const paths = WATCH_DIRS.map((dir) => join(root, dir))

    state.watcher = chokidar.watch(paths, {
        ignoreInitial: true,
        // Debounce rapid successive writes (e.g. editor save + format).
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    })

    state.watcher
        .on('add', (p: string) => broadcast(state, 'add', p))
        .on('change', (p: string) => broadcast(state, 'change', p))
        .on('unlink', (p: string) => broadcast(state, 'unlink', p))
}

/**
 * Close the chokidar watcher when no subscribers remain.
 *
 * @param state - The singleton watcher state.
 */
async function maybeStopWatcher(state: WatcherState): Promise<void> {
    if (state.listeners.size > 0 || !state.watcher) return

    await state.watcher.close()
    state.watcher = null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to file-change events.
 *
 * The first subscriber triggers the watcher to start. Returns an
 * unsubscribe function that, when called, removes the listener and stops
 * the watcher if no other listeners remain.
 *
 * @param listener - Callback invoked for every file-change event.
 * @returns A cleanup function that removes the listener.
 *
 * @example
 * ```typescript
 * const unsub = subscribe((event) => {
 *   console.log(event.type, event.path);
 * });
 *
 * // On SSE disconnect:
 * unsub();
 * ```
 */
export function subscribe(listener: FileChangeListener): () => void {
    const state = getState()
    state.listeners.add(listener)

    // Fire-and-forget -- the watcher will catch up once ready.
    void ensureWatcher(state)

    return () => {
        unsubscribe(listener)
    }
}

/**
 * Remove a previously-registered listener.
 *
 * If this was the last listener the underlying chokidar watcher is closed.
 *
 * @param listener - The callback to remove.
 */
export function unsubscribe(listener: FileChangeListener): void {
    const state = getState()
    state.listeners.delete(listener)
    void maybeStopWatcher(state)
}
