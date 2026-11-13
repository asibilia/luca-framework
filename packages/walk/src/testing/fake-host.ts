/**
 * A fake `WalkHost` for tests (#752, section 2): it does nothing VS Code
 * would do, and records what the app asked VS Code to show, so a test
 * reads it back. Every method is async, so it fits a host whose methods
 * answer a promise or nothing.
 *
 * Questions (input boxes and quick picks) are answered from `answers`, a
 * queue the test fills: a text answers an input box, a quick pick is
 * answered with the label of the item to pick, and `null` (or an empty
 * queue) is a cancel.
 */

export type FakeEditor = { uri: string; start_line: number; end_line: number }

export type FakePanel = { title: string; html: string }

export type FakeStopItem = {
    label: string
    description: string
    stop_id: string
}

export type FakeDiff = {
    title: string
    base_uri: string
    head_uri: string
    reveal_line: number
    reveal_side: 'head' | 'base'
}

export type FakeMessage = { kind: 'info' | 'error'; text: string }

export type FakeTerminal = { name: string; cwd: string; command: string }

export type FakeThread = {
    uri: string
    start_line: number
    end_line: number
    label: string
    read_only: boolean
    comments: { author: string; body: string }[]
}

export type FakeHost = {
    /** The window's workspace folder; the test sets it. */
    workspace_folder: string | null
    /** The open editor's document and selected lines; the test sets it. */
    active_editor: FakeEditor | null
    /** Answers to the app's questions, in order. */
    answers: (string | null)[]
    /** Every prompt and quick pick placeholder the app asked with. */
    prompts: string[]
    /** The open webview panels by id (`summary`, `map`). */
    panels: Record<string, FakePanel>
    /** The Context view's last HTML. */
    context_html: string
    /** Every HTML the app gave any webview, panel or view, in order. */
    all_html: string[]
    stops: FakeStopItem[]
    diffs: FakeDiff[]
    folders: string[]
    messages: FakeMessage[]
    terminals: FakeTerminal[]
    threads: FakeThread[]
    opened_urls: string[]

    workspaceFolder: () => Promise<string | null>
    activeEditor: () => Promise<FakeEditor | null>
    /** An input box. */
    askText: (ask: { prompt: string }) => Promise<string | null>
    /** A quick pick: the item whose label is the next answer, or null. */
    pick: <Item extends { label: string; description?: string }>(ask: {
        placeholder: string
        items: Item[]
    }) => Promise<Item | null>
    showPanel: (panel: {
        id: string
        title: string
        html: string
    }) => Promise<void>
    showContext: (view: { html: string }) => Promise<void>
    showStops: (view: { items: FakeStopItem[] }) => Promise<void>
    openDiff: (diff: FakeDiff) => Promise<void>
    openFolder: (folder: { path: string }) => Promise<void>
    showMessage: (message: FakeMessage) => Promise<void>
    startTerminal: (terminal: FakeTerminal) => Promise<void>
    showThreads: (shown: { threads: FakeThread[] }) => Promise<void>
    openUrl: (link: { url: string }) => Promise<void>
}

/**
 * A fake host whose window shows `workspace_folder`.
 *
 * @example
 * const host = createFakeHost({ workspace_folder: null })
 * host.answers.push('12')
 */
export const createFakeHost = ({
    workspace_folder,
}: {
    workspace_folder: string | null
}): FakeHost => {
    const next = (): string | null => {
        const answer = host.answers.shift()
        return answer === undefined ? null : answer
    }
    const host: FakeHost = {
        workspace_folder,
        active_editor: null,
        answers: [],
        prompts: [],
        panels: {},
        context_html: '',
        all_html: [],
        stops: [],
        diffs: [],
        folders: [],
        messages: [],
        terminals: [],
        threads: [],
        opened_urls: [],

        workspaceFolder: async () => host.workspace_folder,
        activeEditor: async () => host.active_editor,
        askText: async ({ prompt }) => {
            host.prompts.push(prompt)
            return next()
        },
        pick: async ({ placeholder, items }) => {
            host.prompts.push(placeholder)
            const label = next()
            return items.find((item) => item.label === label) ?? null
        },
        showPanel: async ({ id, title, html }) => {
            host.panels[id] = { title, html }
            host.all_html.push(html)
        },
        showContext: async ({ html }) => {
            host.context_html = html
            host.all_html.push(html)
        },
        showStops: async ({ items }) => {
            host.stops = [...items]
        },
        openDiff: async (diff) => {
            host.diffs.push({ ...diff })
        },
        openFolder: async ({ path }) => {
            host.folders.push(path)
        },
        showMessage: async (message) => {
            host.messages.push({ ...message })
        },
        startTerminal: async (terminal) => {
            host.terminals.push({ ...terminal })
        },
        showThreads: async ({ threads }) => {
            host.threads = threads.map((thread) => ({ ...thread }))
        },
        openUrl: async ({ url }) => {
            host.opened_urls.push(url)
        },
    }
    return host
}
