/**
 * Link bundled assets (slash commands, skills) into the project's
 * `.mastracode/` directory at startup.
 *
 * **Why symlinks instead of copies?**
 *
 * The harness (mastracode) scans hardcoded paths like `.mastracode/commands/`
 * and `.mastracode/skills/` to discover slash commands and skills. We want
 * users' repos to stay clean — globally-installed luca should expose its
 * bundled assets *without* polluting their working tree with framework
 * files. So instead of copying ~60 files into the user's repo on every
 * fresh `cwd`, we create a single symlink per asset type pointing at the
 * package's bundled directory:
 *
 *   `<cwd>/.mastracode/commands  →  <pkg>/commands`
 *   `<cwd>/.mastracode/skills    →  <pkg>/skills`
 *
 * Updates are automatic — `npm update -g @alecsibilia/luca-framework`
 * changes the link target. Total footprint in user repo: 2 symlinks.
 *
 * **Rules deliberately omitted:** `rules-loader.ts` already falls back to
 * `<pkg>/rules/` when `.mastracode/rules/` doesn't exist, so rules require
 * no install step at all.
 *
 * **Windows note:** Directory symlinks normally require Developer Mode
 * or admin privileges, but `fs.symlinkSync(target, path, 'junction')`
 * creates an NTFS junction point that works without elevation. We pass
 * `'junction'` on Windows and `'dir'` elsewhere.
 *
 * **Migration:** If a previous luca version installed real (non-symlink)
 * directories at `.mastracode/{commands,skills}/`, we replace them with
 * symlinks on next launch. Pre-existing user files in those dirs would
 * be lost — but the only thing that ever lived there was framework
 * files, so this is safe.
 *
 * Each function accepts an optional `assetsRoot` override for testing.
 * In production the root is resolved from `import.meta.url` — two levels
 * up from `src/integration/` lands at the package root, where `commands/`
 * and `skills/` live as siblings to `src/`.
 */
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the bundled-assets root (the package directory containing
 * `commands/`, `skills/`, `rules/`). Computed from `import.meta.url`;
 * safe to call repeatedly.
 */
function defaultAssetsRoot(): string {
    // src/integration → src → package root (where commands/, skills/ live)
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/**
 * Symlink type for `fs.symlinkSync`. On Windows, `'junction'` creates an
 * NTFS reparse point that doesn't require admin/Developer Mode. Elsewhere,
 * `'dir'` is the standard directory symlink type.
 */
const SYMLINK_TYPE: 'junction' | 'dir' =
    process.platform === 'win32' ? 'junction' : 'dir'

/**
 * Link a bundled asset directory into `<cwd>/.mastracode/<assetName>/`.
 *
 * Behavior:
 * - If the target doesn't exist: create symlink.
 * - If the target is already a symlink (any target): leave it. The next
 *   `npm update` will repoint it via the package's new install path.
 *   Re-pointing on every launch would cause unnecessary inode churn.
 * - If the target is a real directory or file (legacy install or user-
 *   placed content): remove it and symlink in its place. Framework
 *   files are the only things that ever lived at this path, so this is
 *   safe.
 *
 * @param assetName - Subdirectory name in both source and target
 *   (e.g. `'commands'`, `'skills'`).
 * @param assetsRoot - Optional override for the directory containing the
 *   bundled `<assetName>/` folder. Defaults to the package root resolved
 *   from `import.meta.url`. Primarily intended for tests.
 */
function linkAssetDir(assetName: string, assetsRoot?: string): void {
    const bundledDir = join(assetsRoot ?? defaultAssetsRoot(), assetName)

    if (!existsSync(bundledDir)) {
        console.warn(
            `[luca] bundled ${assetName} not found at ${bundledDir} — skipping link`
        )
        return
    }

    const mastracodeDir = join(process.cwd(), '.mastracode')
    if (!existsSync(mastracodeDir)) {
        mkdirSync(mastracodeDir, { recursive: true })
    }

    const targetPath = join(mastracodeDir, assetName)

    // Use lstatSync so we don't follow the symlink — we want to know if
    // the path itself is a link, not what it points at.
    let stat: ReturnType<typeof lstatSync> | undefined
    try {
        stat = lstatSync(targetPath)
    } catch {
        // ENOENT — target doesn't exist, will be created below.
    }

    if (stat) {
        if (stat.isSymbolicLink()) {
            // Already a symlink — leave it. Re-pointing on every launch
            // is unnecessary churn; package updates change the link
            // target via filesystem path, not via the link node itself.
            return
        }
        // Real dir or file from a legacy install — remove it before
        // creating the symlink.
        rmSync(targetPath, { recursive: true, force: true })
    }

    try {
        symlinkSync(bundledDir, targetPath, SYMLINK_TYPE)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
            `[luca] failed to symlink ${assetName} (${bundledDir} → ${targetPath}): ${message}`
        )
    }
}

/**
 * Symlink bundled slash commands into `.mastracode/commands/`.
 *
 * @param assetsRoot - Test-only override; see {@link linkAssetDir}.
 */
export function installSlashCommands(assetsRoot?: string): void {
    linkAssetDir('commands', assetsRoot)
}

/**
 * Symlink bundled skills into `.mastracode/skills/`.
 *
 * @param assetsRoot - Test-only override; see {@link linkAssetDir}.
 */
export function installSkills(assetsRoot?: string): void {
    linkAssetDir('skills', assetsRoot)
}
