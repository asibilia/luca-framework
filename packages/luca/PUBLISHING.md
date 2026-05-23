# Publishing `@alecsibilia/luca`

This package is the umbrella distribution of Luca — at build time it inlines
three private workspace packages (`luca-cli`, `luca-core`, `luca-tools`) and
compiles the Claude Code artifact tree (skills, commands, agents, hooks,
`settings.json`) into `dist/claude/`. The resulting tarball is a single
self-contained npm publish unit.

> NPM publish itself is **a manual user step**. The driver only produces the
> verified tarball and walks the operator through the publish command — it
> never runs `npm publish` or `bun publish` itself.

## Versioning lineage

| Lineage                            | Versions                | Status                         |
| ---------------------------------- | ----------------------- | ------------------------------ |
| `@alecsibilia/luca-framework`      | `≤ 12.0.0-alpha.16`     | Legacy — deprecate once `luca` ships stable |
| `@alecsibilia/luca`                | `13.0.0-alpha.0` and up | Active — this package          |

The major bump (12 → 13) marks the migration to the umbrella layout +
restored functionality from the v13 hand-rewrite. Alpha tag stays until
Phase G parity verification passes and the user has run the bundle in
anger against a real project.

## Pre-publish checklist

Run from `packages/luca/`.

### 1. Type check (all four packages)

```bash
bunx --bun tsc -p packages/luca-tools/tsconfig.json
bunx --bun tsc -p packages/luca-core/tsconfig.json
bunx --bun tsc -p packages/luca-cli/tsconfig.json
bunx --bun tsc -p packages/luca/tsconfig.json
```

All four must exit `0`. Tests are intentionally absent (no-tests rule);
verification is type-checking only.

### 2. Clean rebuild the umbrella

```bash
# from repo root — package-scoped (NEVER `bun run build:all`; that crashes
# Claude Code)
bun run --filter @alecsibilia/luca build
```

Expected output (approximate):

```
ℹ Building luca
ℹ Cleaning dist directory: ./dist
✔ Build succeeded for luca
  dist/index.mjs (total size: ~2.7 kB, exports: LUCA_VERSION, runInit, runMain)

Σ Total dist size (byte size): ~265 kB
[luca] compiled artifacts → packages/luca/dist/claude
  (agents:10 subagents:8 commands:17 skills:40 hooks:6 rules:0)
```

Required artifacts in `dist/`:

- `dist/index.mjs` — inlined CLI/core/tools bundle.
- `dist/index.d.{ts,mts}` — TS declarations.
- `dist/chunks/*.mjs` — lazy-loaded subcommand chunks (one per top-level CLI command).
- `dist/shared/*.mjs` — shared rollup chunks.
- `dist/claude/.claude/{agents,commands,settings.json}` — Claude Code definitions.
- `dist/claude/skills/<name>/SKILL.md` — 40 skills.
- `bin/luca.js` — entry script (lives in `bin/`, not `dist/`; both ship via the `files` field).

### 3. Pack the tarball — **`bun pm pack`, not `npm pack`**

```bash
cd packages/luca
bun pm pack
```

> `npm pack` is **misleading** here because npm does not resolve `catalog:`
> workspace references. `bun pm pack` correctly resolves `catalog:` and
> `workspace:*` refs into concrete semver ranges before assembling the
> tarball.

Expected output (approximate):

```
alecsibilia-luca-13.0.0-alpha.0.tgz
Total files: 122
Shasum: <sha1>
Integrity: sha512-…
Unpacked size: 0.86MB
Packed size: 245.20KB
```

### 4. Verify tarball contents

```bash
# List top of tarball
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | head -20

# Confirm the bin is included
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | grep "bin/luca.js"

# Confirm dist/claude/ is populated (40 skills + 17 commands + 18 agents)
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | grep -c "^package/dist/claude/skills/"   # 40
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | grep -c "^package/dist/claude/.claude/commands/"  # 17
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | grep -c "^package/dist/claude/.claude/agents/"  # 18

# Confirm forbidden content is absent
tar -tzf alecsibilia-luca-13.0.0-alpha.0.tgz | grep -E "package/src|node_modules|tsconfig|build\.config" || echo "OK: no source/build files"

# Confirm catalog: and workspace:* are RESOLVED in the published package.json
tar -xzf alecsibilia-luca-13.0.0-alpha.0.tgz -O package/package.json | grep -E '"catalog:|"workspace:' && echo "FAIL: unresolved refs in tarball" || echo "OK: all refs resolved"
```

### 5. Offline smoke test the tarball

```bash
SMOKE_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
tar -xzf /path/to/alecsibilia-luca-13.0.0-alpha.0.tgz
ls -la package/
ls -l package/bin/luca.js   # confirm executable bit (-rwxr-xr-x)
bun package/bin/luca.js --help
# Will print --help OR error on missing npm deps — both are acceptable here;
# we are only verifying the bin is executable + the entry point resolves.
rm -rf "$SMOKE_DIR"
```

### 6. Delete the local tarball before committing

The repo's `.gitignore` excludes `*.tgz`, but double-check the working tree:

```bash
rm -f packages/luca/*.tgz
git status -s packages/luca/
```

## Publish (USER STEP — manual)

Once the pre-publish checklist is green, **the user** runs the publish
command. The driver agent does **not** run this.

```bash
cd packages/luca

# alpha publish — uses the `alpha` dist-tag instead of `latest`
npm publish --access public --tag alpha

# OR equivalent with bun:
bun publish --access public --tag alpha
```

For an eventual stable release, drop the `--tag alpha` flag:

```bash
cd packages/luca
npm publish --access public        # promotes to dist-tag "latest"
```

`publishConfig.access` is already `"public"` in `package.json`, but the
explicit `--access public` flag prevents npm's "first publish under scope"
hiccup.

## Post-publish verification

After the publish completes, verify the published artifact from the npm
registry (not from local):

```bash
# Confirm the version is live
npm view @alecsibilia/luca@13.0.0-alpha.0 version

# Confirm the published files match what `bun pm pack` produced
npm view @alecsibilia/luca@13.0.0-alpha.0 dist

# Inspect published metadata
npm view @alecsibilia/luca@13.0.0-alpha.0

# Test install in a throwaway dir
mkdir -p /tmp/luca-smoke-postpub && cd /tmp/luca-smoke-postpub
bun init -y
bun add -g @alecsibilia/luca@13.0.0-alpha.0
luca --help
```

## Tag promotion flow (alpha → beta → stable)

```bash
# Promote an alpha to beta (re-publish with new tag)
cd packages/luca
# 1. Bump version in package.json (e.g. 13.0.0-alpha.3 → 13.0.0-beta.0)
# 2. Rebuild + repack + republish:
bun run build
npm publish --access public --tag beta

# Promote beta to stable
# 1. Bump version (e.g. 13.0.0-beta.2 → 13.0.0)
# 2. Re-publish without an explicit tag (defaults to `latest`):
bun run build
npm publish --access public
```

## Deprecation flow

To deprecate a published alpha (e.g. when a critical bug is discovered and
a newer alpha supersedes it):

```bash
npm deprecate @alecsibilia/luca@13.0.0-alpha.0 \
  "Deprecated — upgrade to @alecsibilia/luca@13.0.0-alpha.1 or later."
```

To deprecate the legacy `@alecsibilia/luca-framework` lineage once Luca v13
hits stable:

```bash
npm deprecate "@alecsibilia/luca-framework@<=12.0.0-alpha.16" \
  "Renamed to @alecsibilia/luca. Install @alecsibilia/luca instead."
```

## Troubleshooting

### `bun pm pack` produces a tarball with unresolved `catalog:` or `workspace:*` refs

This indicates the umbrella build did not run (or `unbuild` skipped the
inline step). Re-run:

```bash
cd packages/luca && bun run build
```

If `dist/index.mjs` references `workspace:*` siblings (e.g. you can grep
`workspace:` in the dist output), the unbuild config (`build.config.ts`)
is misconfigured — the inline-dependencies step is the gatekeeper.

### `dist/claude/` is missing after build

The `build:done` hook in `build.config.ts` calls
`@alecsibilia/luca-tools`'s `compile()` against the `ARTIFACTS` manifest.
If that hook fails silently or throws, `dist/claude/` will be absent.
Re-run the build with verbose output:

```bash
cd packages/luca && bun run build --verbose
```

### `luca init` (post-install) cannot find bundled artifacts

`packages/luca-cli/src/init/helpers/install-skills.ts` walks up from
`import.meta.url` looking for the umbrella's `package.json`. Failure
modes:

1. Installed via global npm — the umbrella tarball must contain
   `dist/claude/`. If absent, the umbrella was published without
   building first. Re-publish.
2. Dev tree — if the umbrella has not been built locally, `dist/claude/`
   won't exist. Run `bun run --filter @alecsibilia/luca build` first.
