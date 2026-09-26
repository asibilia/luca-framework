# @alecsibilia/luca

Luca turns a spec on GitHub Issues into a reviewed pull request. A run takes the spec's tickets through the engine, plain code that picks every next step, while Claude agents write the tests and the code and a fresh reviewer checks each ticket. The board shows the run live in Paseo.

```bash
bun add -g @alecsibilia/luca
```

The package has two commands:

- `luca`: sets up this computer (`luca init`) and a repo (`luca setup`).
- `luca-run`: the engine. The board starts it when you type `/luca-run <spec>` in Paseo.

## What's in the package

This is the one package that goes to npm. It's TypeScript source with no build and no bundle, because the engine only runs on Bun. At pack time it copies in:

| Folder | What it is |
| ------ | ---------- |
| `engine/` | The engine's source, from [`packages/engine/src`](../engine/src). Both bins point into it. |
| `board/` | The board plugin's folder, from [`packages/board`](../board): `paseo-plugin.json`, its entry points, its client, server, and shared code, and its own `package.json`, so Paseo can install it as a folder source. |
| `LICENSE` | The repo's license. |

Test files and test helpers stay out. The engine and the board stay private workspace packages, and this package lists every package they import at runtime as its own dependency.

## Pack it

Pack it with Bun, from this folder:

```bash
bun pm pack
```

`bun pm pack` runs the `prepack` script ([`scripts/copy-sources.ts`](scripts/copy-sources.ts)), which copies the engine and the board in, then packs, then runs `postpack`, which removes the copies again.

`bun pm pack` leaves out every `bunfig.toml` by default, even one named in `files`. The engine needs its own `cli/bunfig.toml`, because the board starts it with `--config` pointing there. So the script writes an `.npmignore` into `engine/` that puts it back.

It must be packed with Bun. The manifest uses the workspace's `catalog:` and `workspace:` versions, and `bun pm pack` turns them into real versions in the packed `package.json`. A plain `npm pack` ships them unchanged, and an install from that tarball fails. Publish the tarball Bun made:

```bash
npm publish <tarball> --tag alpha
```

npm does the publishing because Bun can't publish over npm's trusted publishing (OIDC) yet.

## License

Apache License 2.0. See [LICENSE](https://github.com/asibilia/luca-framework/blob/main/LICENSE).
