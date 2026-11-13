import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { githubRemoteUrl, walkDir } from './pull-request-ref'
import { realGh, realGit } from './run-command'
import { createVscodeHost } from './vscode-host'
import { createWalkApp, WALK_COMMANDS, type WalkApp } from './walk-app'
import { BASE_SCHEME } from './walk-uris'

import { storiesDir } from '../../engine/src/story/story-store'

/**
 * Luca Walk's entry point (#752, section 2): wiring only. It builds the
 * real host, `gh` and `git`, makes the app, registers every command, and
 * passes VS Code's events in.
 */

export const activate = (context: vscode.ExtensionContext): void => {
    let app: WalkApp | null = null
    const host = createVscodeHost({
        context,
        onPanelMessage: (event) => {
            void app?.panelMessage(event)
        },
        onStopPicked: (picked) => {
            void app?.stopPicked(picked)
        },
        draft_events: {
            onDraftAdded: (added) => {
                void app?.draftCommentAdded(added)
            },
            onDraftEdited: (edited) => {
                void app?.draftEdited(edited)
            },
            onDraftDeleted: (deleted) => {
                void app?.draftDeleted(deleted)
            },
        },
    })
    const env = process.env
    const made = createWalkApp({
        host,
        gh: realGh,
        git: realGit,
        walk_dir: walkDir({ home: homedir(), env }),
        stories_dir: storiesDir({ home: homedir(), env }),
        remote_url: githubRemoteUrl,
    })
    app = made
    for (const command of WALK_COMMANDS) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, (...args: unknown[]) =>
                made.run({ command, args })
            )
        )
    }
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, {
            provideTextDocumentContent: (uri) =>
                made.baseDocumentText({ uri: uri.toString() }),
        }),
        vscode.window.onDidChangeTextEditorSelection(
            ({ textEditor, selections }) => {
                const [selection] = selections
                if (selection === undefined) return
                void made.cursorMoved({
                    uri: textEditor.document.uri.toString(),
                    line: selection.active.line + 1,
                })
            }
        )
    )
    void made.activated()
}

export const deactivate = (): void => {}
