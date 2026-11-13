# Luca Walk

The VS Code extension the owner reviews a pull request in (spec #752). It reads the pull request's story, walks its stops in full-file diffs, and sends the owner's feedback as one GitHub review. It reviews from its own checkout of the pull request, under `~/.local/state/luca/walk` (`LUCA_WALK_DIR` overrides it), so your working copy is never touched.

## Install

1. Build the extension: `bun run package` in `packages/walk`. It writes `packages/walk/luca-walk.vsix`.
2. In VS Code, create a profile named `Luca Walk` whose Settings and Keyboard Shortcuts use the Default profile.
3. Install the extension in that profile:

   ```sh
   code --profile "Luca Walk" --install-extension packages/walk/luca-walk.vsix
   ```

4. Open it: `code --profile "Luca Walk"`.

Every command is under `Luca Walk:` in the command palette. There are no default key bindings: bind your own in the `Luca Walk` profile.

## Workspace Trust

Luca Walk works in VS Code's Restricted Mode, so it never needs you to trust a pull request's code. Each pull request opens as its own folder, and VS Code asks whether to trust it. Keep a checkout of someone else's pull request in Restricted Mode: trusting it lets that pull request's `.vscode/tasks.json`, workspace settings and other extensions run its author's code. Never trust the `checkouts` folder itself (`~/.local/state/luca/walk/checkouts`), because that trusts every pull request opened under it.

"Write the story" works by where the pull request is:

- **In your repo** (its owner is your own GitHub account), it starts `claude` inside the pull request's checkout. That checkout holds the pull request's `.claude/settings.json` hooks, `.mcp.json` and `CLAUDE.md`, which `claude` can load, and hooks run commands. On someone else's pull request in your repo, read those files' changes in the diff first.
- **In a repo that isn't yours** (an organization's, someone else's, or any repo when `gh` can't say who is signed in), it never starts `claude`. The Summary panel shows a command to copy instead (`Copy the command`, or the `Write the story` command, puts it on the clipboard). It starts `claude` in a new empty folder (`cd "$(mktemp -d)"`), so no `.claude/`, `.mcp.json` or `CLAUDE.md` of the pull request is loaded, and asks `/luca-pr-prep` for the private home and to read the code from the checkout with `git -C`. Run it in a terminal, then press `Reload the story`.

## Repos that aren't yours

A `Not your repo` badge in the status bar says when the open pull request's repo isn't yours. There, `Send the review` changes no labels (on your own pull request every verdict goes as a plain comment review), and the review record is not posted in the review's text: it is kept on this computer only, under `reviewed/` in Luca Walk's folder, and each send in progress is kept under `sending/` (the last 20 sends), so a retried send, or a send from a second window still holding the same comments, is never posted twice. On anyone else's pull request, `Just comments` comes first in the verdict list, and `Signed off` or `Changes wanted` asks you to confirm before it approves or requests changes on GitHub.

Everywhere, a story posted as comments is used only when you wrote those comments, and a comment shows as `luca-pr-address` only when it holds the agent's marker and you wrote it.

## How it is built

- `src/walk-app.ts` holds every rule. It never imports `vscode`: it talks to VS Code through a `WalkHost` (`src/walk-host.ts`).
- `src/extension.ts` and `src/vscode-host.ts` are the wiring, and the only files that import `vscode`.
- It runs in VS Code's Node, so its code uses Node's modules, never a `Bun.` API. Tests run with `bun test`, through the fake host in `src/testing/`.
