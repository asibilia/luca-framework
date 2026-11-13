import * as vscode from 'vscode'

import type { WalkHost, WalkStopItem, WalkThread } from './walk-host'

/**
 * The real `WalkHost` (#752, section 2): wiring only. It shows what the
 * app asks for with VS Code's own parts, and hands webview messages back
 * through `onPanelMessage`. No rule of Luca Walk lives here.
 */

type PanelMessage = { panel: string; message: unknown }

const WEBVIEW_OPTIONS = { enableScripts: true }

const stopsView = () => {
    let items: WalkStopItem[] = []
    const changed = new vscode.EventEmitter<void>()
    const provider: vscode.TreeDataProvider<WalkStopItem> = {
        onDidChangeTreeData: changed.event,
        getChildren: () => items,
        getTreeItem: (item) => {
            const tree = new vscode.TreeItem(item.label)
            tree.description = item.description
            tree.id = item.stop_id
            return tree
        },
    }
    return {
        provider,
        show: (next: WalkStopItem[]) => {
            items = next
            changed.fire()
        },
    }
}

const contextView = ({
    onPanelMessage,
}: {
    onPanelMessage: (event: PanelMessage) => void
}) => {
    let html = ''
    let view: vscode.WebviewView | null = null
    const provider: vscode.WebviewViewProvider = {
        resolveWebviewView: (resolved) => {
            view = resolved
            resolved.webview.options = WEBVIEW_OPTIONS
            resolved.webview.html = html
            resolved.webview.onDidReceiveMessage((message: unknown) =>
                onPanelMessage({ panel: 'context', message })
            )
            resolved.onDidDispose(() => {
                view = null
            })
        },
    }
    return {
        provider,
        show: (next: string) => {
            html = next
            if (view !== null) view.webview.html = next
        },
    }
}

const commentThreads = () => {
    const controller = vscode.comments.createCommentController(
        'lucaWalk',
        'Luca Walk'
    )
    let shown: vscode.CommentThread[] = []
    const show = (threads: WalkThread[]) => {
        for (const thread of shown) thread.dispose()
        shown = threads.map((thread) => {
            const made = controller.createCommentThread(
                vscode.Uri.parse(thread.uri),
                new vscode.Range(
                    thread.start_line - 1,
                    0,
                    thread.end_line - 1,
                    0
                ),
                thread.comments.map(({ author, body }) => ({
                    author: { name: author },
                    body: new vscode.MarkdownString(body),
                    mode: vscode.CommentMode.Preview,
                }))
            )
            made.label = thread.label
            made.canReply = !thread.read_only
            return made
        })
    }
    return { controller, show }
}

/**
 * The real host, registering its views on `context`.
 *
 * @param onPanelMessage - Gets every message a webview sends.
 */
export const createVscodeHost = ({
    context,
    onPanelMessage,
}: {
    context: vscode.ExtensionContext
    onPanelMessage: (event: PanelMessage) => void
}): WalkHost => {
    const panels = new Map<string, vscode.WebviewPanel>()
    const stops = stopsView()
    const contextBox = contextView({ onPanelMessage })
    const threads = commentThreads()
    context.subscriptions.push(
        vscode.window.createTreeView('lucaWalk.stops', {
            treeDataProvider: stops.provider,
        }),
        vscode.window.registerWebviewViewProvider(
            'lucaWalk.context',
            contextBox.provider
        ),
        threads.controller
    )

    return {
        workspaceFolder: async () =>
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
        activeEditor: async () => {
            const editor = vscode.window.activeTextEditor
            if (editor === undefined) return null
            return {
                uri: editor.document.uri.toString(),
                start_line: editor.selection.start.line + 1,
                end_line: editor.selection.end.line + 1,
            }
        },
        askText: async ({ prompt }) =>
            (await vscode.window.showInputBox({ prompt })) ?? null,
        pick: async ({ placeholder, items }) =>
            (await vscode.window.showQuickPick(items, {
                placeHolder: placeholder,
            })) ?? null,
        showPanel: async ({ id, title, html }) => {
            const open = panels.get(id)
            if (open !== undefined) {
                open.title = title
                open.webview.html = html
                open.reveal()
                return
            }
            const made = vscode.window.createWebviewPanel(
                `lucaWalk.${id}`,
                title,
                vscode.ViewColumn.Active,
                WEBVIEW_OPTIONS
            )
            made.webview.html = html
            made.webview.onDidReceiveMessage((message: unknown) =>
                onPanelMessage({ panel: id, message })
            )
            made.onDidDispose(() => panels.delete(id))
            panels.set(id, made)
        },
        showContext: async ({ html }) => contextBox.show(html),
        showStops: async ({ items }) => stops.show(items),
        openDiff: async ({ title, base_uri, head_uri, reveal_line }) => {
            const line = Math.max(reveal_line - 1, 0)
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.parse(base_uri),
                vscode.Uri.parse(head_uri),
                title,
                { selection: new vscode.Range(line, 0, line, 0) }
            )
        },
        openFolder: async ({ path }) => {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(path),
                { forceReuseWindow: true }
            )
        },
        showMessage: async ({ kind, text }) => {
            if (kind === 'error') await vscode.window.showErrorMessage(text)
            else await vscode.window.showInformationMessage(text)
        },
        startTerminal: async ({ name, cwd, command }) => {
            const terminal = vscode.window.createTerminal({ name, cwd })
            terminal.show()
            terminal.sendText(command)
        },
        showThreads: async ({ threads: next }) => threads.show(next),
        openUrl: async ({ url }) => {
            await vscode.env.openExternal(vscode.Uri.parse(url))
        },
    }
}
