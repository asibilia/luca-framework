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

## How it is built

- `src/walk-app.ts` holds every rule. It never imports `vscode`: it talks to VS Code through a `WalkHost` (`src/walk-host.ts`).
- `src/extension.ts` and `src/vscode-host.ts` are the wiring, and the only files that import `vscode`.
- It runs in VS Code's Node, so its code uses Node's modules, never a `Bun.` API. Tests run with `bun test`, through the fake host in `src/testing/`.
