/**
 * The one seam between Luca Walk's app and VS Code (#752, section 2). The
 * app asks the host to show things and to ask the owner things; the real
 * host is `vscode-host.ts`, and tests use `testing/fake-host.ts`.
 */

/** The open editor's document and its selected lines (1-based). */
export type WalkEditor = { uri: string; start_line: number; end_line: number }

/** One item of the Stops view. */
export type WalkStopItem = {
    label: string
    description: string
    stop_id: string
}

/** A diff to open: the file at the base on the left, the head on the right. */
export type WalkDiff = {
    title: string
    base_uri: string
    head_uri: string
    reveal_line: number
    reveal_side: 'head' | 'base'
}

export type WalkMessage = { kind: 'info' | 'error'; text: string }

export type WalkTerminal = { name: string; cwd: string; command: string }

/** A small always-visible label (#766), with the words shown on hover. */
export type WalkBadge = { text: string; tooltip: string }

export type WalkThread = {
    uri: string
    start_line: number
    end_line: number
    label: string
    read_only: boolean
    comments: { author: string; body: string }[]
    /** The draft a `Draft` thread shows, so VS Code can edit or delete it. */
    draft_id?: string
}

export type WalkHost = {
    /** The window's workspace folder, or null when it has none. */
    workspaceFolder: () => Promise<string | null>
    activeEditor: () => Promise<WalkEditor | null>
    /** An input box: the text, or null when cancelled. */
    askText: (ask: { prompt: string }) => Promise<string | null>
    /** A quick pick: the picked item, or null when cancelled. */
    pick: <Item extends { label: string; description?: string }>(ask: {
        placeholder: string
        items: Item[]
    }) => Promise<Item | null>
    /** Opens or updates the webview panel `id` (`summary`, `map`). */
    showPanel: (panel: {
        id: string
        title: string
        html: string
    }) => Promise<void>
    showContext: (view: { html: string }) => Promise<void>
    showStops: (view: { items: WalkStopItem[] }) => Promise<void>
    openDiff: (diff: WalkDiff) => Promise<void>
    /** Opens a folder in this window, which restarts the extensions. */
    openFolder: (folder: { path: string }) => Promise<void>
    showMessage: (message: WalkMessage) => Promise<void>
    startTerminal: (terminal: WalkTerminal) => Promise<void>
    showThreads: (shown: { threads: WalkThread[] }) => Promise<void>
    openUrl: (link: { url: string }) => Promise<void>
    /**
     * A modal question (#766): true only when the owner clicked
     * `confirm_label`; false when they cancelled.
     */
    confirm: (ask: { text: string; confirm_label: string }) => Promise<boolean>
    /** Shows `badge` in the status bar, or hides it when null (#766). */
    showBadge: (badge: WalkBadge | null) => Promise<void>
    /** Puts `text` on the clipboard (#766). */
    copyText: (copy: { text: string }) => Promise<void>
}

/** One `git` call in `cwd`. Never throws: a failure answers `ok` false. */
export type WalkGit = (call: {
    args: string[]
    cwd: string
}) => Promise<{ ok: boolean; stdout: string; stderr: string }>
