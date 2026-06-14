import { existsSync, readFileSync } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Which bundled artifact buckets to install into a harness home. Mirrors
 * the `installArtifacts` flags on a `Harness` descriptor — `installSkills`
 * is driven entirely off these so "add a harness = add one descriptor"
 * holds: the descriptor's flags decide what lands in its home.
 */
export interface InstallSkillsArtifacts {
    agents: boolean
    commands: boolean
    skills: boolean
}

export interface InstallSkillsOptions {
    /**
     * Path to the global harness config directory that receives the
     * enabled `commands/`, `agents/`, and/or `skills/` buckets. Defaults
     * to `~/.claude` for backward compatibility with callers that don't
     * pass a home.
     */
    home?: string
    /**
     * @deprecated Use `home`. Retained as an alias so existing callers
     * (and tests) that pass `claudeHome` keep compiling. `home` wins when
     * both are supplied.
     */
    claudeHome?: string
    /**
     * Which buckets to install into `home`, driven by the harness
     * descriptor's `installArtifacts` flags. Defaults to all three
     * enabled (the historical Claude behavior) when omitted.
     */
    artifacts?: InstallSkillsArtifacts
    /**
     * Root directory containing the bundled `.claude/agents/` and
     * `.claude/commands/` trees. Defaults to the umbrella's bundled
     * artifacts at `<luca-pkg-root>/dist/claude/.claude/`.
     *
     * Two-root design (F-2): the luca-tools compiler emits commands +
     * agents under `<dist/claude>/.claude/` and skills under
     * `<dist/claude>/skills/`. install-skills accepts both roots
     * independently so a caller can override them separately if needed
     * (rare — defaults resolve via `resolveBundledArtifacts()`).
     */
    claudeArtifactsRoot?: string
    /**
     * Root directory containing the bundled `<name>/SKILL.md` skill
     * tree. Defaults to `<luca-pkg-root>/dist/claude/skills/`.
     */
    skillsRoot?: string
    log?: (msg: string) => void
}

/**
 * The bundled artifact names luca ships and installs into the global
 * Claude scope. Used by `luca doctor` to recognise stray per-repo copies.
 */
export interface BundledArtifacts {
    /** Slash-command file names (e.g. `lu.md`). */
    commands: string[]
    /** Sub-agent file names (e.g. `luca-executor.md`). */
    agents: string[]
    /** Skill directory names (e.g. `luca-init`). */
    skills: string[]
}

/** The default global Claude config directory: `~/.claude`. */
export function defaultClaudeHome(): string {
    return join(homedir(), '.claude')
}

/** The default global Antigravity config directory: `~/.gemini/antigravity-cli`. */
export function defaultAntigravityHome(): string {
    return join(homedir(), '.gemini', 'antigravity-cli')
}

/**
 * Copy bundled luca artifacts into ONE harness's *global* config home,
 * driven by that harness's `installArtifacts` flags:
 *
 *   - `<artifacts>/.claude/commands/*.md`       → <home>/commands/   (if artifacts.commands)
 *   - `<artifacts>/.claude/agents/*.md`         → <home>/agents/     (if artifacts.agents)
 *   - `<artifacts>/skills/<name>/SKILL.md`      → <home>/skills/     (if artifacts.skills)
 *
 * The descriptor's flags are the single source of truth for what a
 * harness receives. Reproducing the historical defaults:
 *   - Claude       `{ agents, commands, skills }` → commands + agents + skills
 *   - Antigravity  `{ agents, skills }` (no commands) → agents + skills
 *
 * Installing globally — rather than per-repo — means one luca CLI version
 * owns a single canonical skill set across every project. Repos stay
 * clean: only `.luca/` planning files are written per-project. Stray
 * per-repo copies left by older luca versions are removed by
 * `luca doctor --fix`.
 *
 * Always overwrites luca's own files of the same name (the bundled
 * versions are canonical) but preserves unrelated user-authored files in
 * those directories.
 *
 * Designed to be called once per active harness from `luca init` Step 4,
 * idempotent on re-run.
 *
 * F-2: source roots default to the @alecsibilia/luca umbrella's bundled
 * `dist/claude/` tree. When `luca` is installed globally via npm, the
 * compiled artifacts ship inside the tarball (built at publish time
 * via the umbrella's `build:done` hook in `build.config.ts`). When
 * running from a dev tree (no `dist/claude/` present), the resolver
 * returns null and `installSkills` skips with a clear message instead
 * of failing.
 */
export async function installSkills(opts: InstallSkillsOptions): Promise<void> {
    const log = opts.log ?? (() => {})
    const home = opts.home ?? opts.claudeHome ?? defaultClaudeHome()
    // Default to all-on so legacy callers (and the historical Claude home)
    // behave exactly as before when no descriptor flags are supplied.
    const artifacts = opts.artifacts ?? {
        agents: true,
        commands: true,
        skills: true,
    }

    const resolved = resolveBundledArtifacts({
        claudeArtifactsRoot: opts.claudeArtifactsRoot,
        skillsRoot: opts.skillsRoot,
    })

    if (resolved === null) {
        log(
            '  skip:  bundled artifacts not found — could not locate the @alecsibilia/luca package root (running from a non-bundled dev tree?)'
        )
        return
    }

    const { claudeArtifactsRoot, skillsRoot } = resolved

    if (!existsSync(claudeArtifactsRoot)) {
        log(
            `  skip:  bundled artifacts not found at ${claudeArtifactsRoot} (running from a non-bundled dev tree? did the umbrella build run?)`
        )
        return
    }

    if (artifacts.commands) {
        await copyDir({
            from: join(claudeArtifactsRoot, 'commands'),
            to: join(home, 'commands'),
            log,
            label: 'command',
        })
    }

    if (artifacts.agents) {
        await copyDir({
            from: join(claudeArtifactsRoot, 'agents'),
            to: join(home, 'agents'),
            log,
            label: 'agent',
        })
    }

    if (artifacts.skills) {
        await copySkillTree({
            from: skillsRoot,
            to: join(home, 'skills'),
            log,
        })
    }
}

/**
 * Enumerate the bundled artifact names luca ships.
 *
 * `luca doctor` uses this to recognise stray copies wrongly installed into
 * a repo's local `.claude/` directory by an older `luca init`.
 *
 * Returns `null` when the bundled source cannot be located (e.g. running
 * from a non-bundled dev tree), so callers can skip rather than guess.
 */
export async function listBundledArtifacts(
    opts: {
        claudeArtifactsRoot?: string
        skillsRoot?: string
    } = {}
): Promise<BundledArtifacts | null> {
    const resolved = resolveBundledArtifacts({
        claudeArtifactsRoot: opts.claudeArtifactsRoot,
        skillsRoot: opts.skillsRoot,
    })
    if (resolved === null) return null

    const { claudeArtifactsRoot, skillsRoot } = resolved
    if (!existsSync(claudeArtifactsRoot)) return null

    return {
        commands: await listEntries(
            join(claudeArtifactsRoot, 'commands'),
            'file',
            '.md'
        ),
        agents: await listEntries(
            join(claudeArtifactsRoot, 'agents'),
            'file',
            '.md'
        ),
        skills: await listEntries(skillsRoot, 'dir'),
    }
}

/**
 * Resolve the two source roots (`.claude/` artifacts + `skills/`)
 * inside the @alecsibilia/luca umbrella's bundled `dist/claude/`
 * directory.
 *
 * Resolution priority:
 *   1. Explicit overrides passed by the caller.
 *   2. Walk up from `import.meta.url` looking for the umbrella's
 *      `package.json` (name === '@alecsibilia/luca'). When running
 *      from `bin/luca.js` after a `bun install`, this finds
 *      `<node_modules>/@alecsibilia/luca/`; the bundled artifacts are
 *      at `<pkg>/dist/claude/`.
 *   3. Returns `null` if the package root can't be located — the
 *      caller (`installSkills`) reports a clear skip message.
 *
 * Two-root rationale: the luca-tools compiler emits commands + agents
 * under `<outputRoot>/.claude/` and skills under `<outputRoot>/skills/`.
 * Passing one combined "source root" would only match three of those
 * four buckets. The cleanest fix is to surface BOTH roots explicitly,
 * derived from the same `<dist/claude>` parent.
 */
function resolveBundledArtifacts(overrides: {
    claudeArtifactsRoot?: string
    skillsRoot?: string
}): { claudeArtifactsRoot: string; skillsRoot: string } | null {
    if (
        overrides.claudeArtifactsRoot !== undefined &&
        overrides.skillsRoot !== undefined
    ) {
        return {
            claudeArtifactsRoot: overrides.claudeArtifactsRoot,
            skillsRoot: overrides.skillsRoot,
        }
    }
    const distClaude = findUmbrellaDistClaude()
    if (distClaude === null) return null
    return {
        claudeArtifactsRoot:
            overrides.claudeArtifactsRoot ?? join(distClaude, '.claude'),
        skillsRoot: overrides.skillsRoot ?? join(distClaude, 'skills'),
    }
}

/**
 * Walk up from this module's location looking for the umbrella's
 * `package.json` (name === '@alecsibilia/luca'). Returns
 * `<pkg-root>/dist/claude` on success, `null` if no umbrella package
 * is found within 20 levels.
 *
 * Works whether install-skills.ts is invoked from:
 *   (a) The published umbrella: `<node_modules>/@alecsibilia/luca/
 *       dist/chunks/install-skills.<hash>.mjs` — walking up finds
 *       `<node_modules>/@alecsibilia/luca/package.json`.
 *   (b) A dev tree: `packages/luca-cli/src/init/helpers/
 *       install-skills.ts` — walking up finds `luca-cli/package.json`
 *       (NOT the umbrella). The function then keeps walking and
 *       finds `packages/luca/package.json` further up. In a dev tree
 *       `packages/luca/dist/claude/` is present iff the umbrella has
 *       been built locally; otherwise the caller skips.
 *   (c) The umbrella's own dev tree: walking up directly finds
 *       `packages/luca/package.json`.
 */
function findUmbrellaDistClaude(): string | null {
    let dir = dirname(fileURLToPath(import.meta.url))
    // Bound the walk so we don't run forever in odd environments.
    for (let i = 0; i < 20; i += 1) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca') {
                    return join(dir, 'dist', 'claude')
                }
            } catch {
                // ignore malformed package.json, keep walking
            }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    // Dev-tree fallback: when running directly from the luca-cli
    // workspace (e.g. `bun packages/luca-cli/src/commands/init.ts`),
    // walking up from luca-cli never crosses into the umbrella. Probe
    // the monorepo layout explicitly as a last resort.
    dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 20; i += 1) {
        const candidate = join(dir, 'packages', 'luca', 'package.json')
        if (existsSync(candidate)) {
            try {
                const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca') {
                    return join(dir, 'packages', 'luca', 'dist', 'claude')
                }
            } catch {
                // ignore malformed package.json, keep walking
            }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return null
}

/**
 * Resolve the bundled `<luca-pkg>/dist/claude/.claude/` directory.
 *
 * Companion to `resolveBundledArtifacts()` — that function returns the
 * roots for skills + agents + commands; this one returns the root for
 * the `<luca-pkg>/dist/claude/.claude/` directory itself, which is where
 * the hook handlers and bundled settings.json live.
 *
 * Returns null if the umbrella package root can't be located (e.g.
 * running from a non-bundled dev tree). Used by `install-hooks.ts`.
 */
export function resolveBundledArtifactsForHooks(): string | null {
    const distClaude = findUmbrellaDistClaude()
    if (distClaude === null) return null
    return join(distClaude, '.claude')
}

/** List the names of files (with `ext`) or directories directly under `dir`. */
async function listEntries(
    dir: string,
    kind: 'file' | 'dir',
    ext?: string
): Promise<string[]> {
    if (!existsSync(dir)) return []
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
        .filter((e) => (kind === 'file' ? e.isFile() : e.isDirectory()))
        .filter((e) => (ext ? e.name.endsWith(ext) : true))
        .map((e) => e.name)
}

/**
 * Copy a tree of `<name>/SKILL.md` skill directories. Each bundled skill
 * is a directory containing a SKILL.md (and possibly supporting files);
 * the whole directory is mirrored into <claudeHome>/skills/<name>/.
 */
async function copySkillTree(args: {
    from: string
    to: string
    log: (msg: string) => void
}): Promise<void> {
    if (!existsSync(args.from)) {
        args.log(`  skip:  skills source missing (${args.from})`)
        return
    }
    const entries = await readdir(args.from, { withFileTypes: true })
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillFrom = join(args.from, entry.name)
        const skillTo = join(args.to, entry.name)
        // Clear any stale non-directory entry (e.g. a dangling symlink left
        // by an older dev install) squatting the target path. mkdir with
        // `recursive: true` is idempotent for real directories but throws
        // EEXIST when the path is a symlink/file, so we must remove it first.
        await clearNonDirTarget(skillTo)
        await mkdir(skillTo, { recursive: true })
        const files = await readdir(skillFrom, { withFileTypes: true })
        for (const file of files) {
            if (!file.isFile()) continue
            const fileTo = join(skillTo, file.name)
            // Drop a pre-existing symlink so we materialize a real file
            // rather than writing through the link to its (stale) target.
            await clearSymlink(fileTo)
            await copyFile(join(skillFrom, file.name), fileTo)
            args.log(`  write: ${fileTo}`)
        }
    }
}

/**
 * Remove a path if it exists and is NOT a real directory (i.e. a symlink
 * or file). No-op when the path is absent or already a directory. Used to
 * sanitize install targets that older dev setups left as dangling symlinks
 * into the repo's former `dist/claude/` tree.
 */
async function clearNonDirTarget(p: string): Promise<void> {
    try {
        const st = await lstat(p)
        if (!st.isDirectory()) await rm(p, { force: true })
    } catch {
        // ENOENT — nothing to clear.
    }
}

/** Remove a path only if it is a symbolic link; otherwise leave it. */
async function clearSymlink(p: string): Promise<void> {
    try {
        const st = await lstat(p)
        if (st.isSymbolicLink()) await rm(p, { force: true })
    } catch {
        // ENOENT — nothing to clear.
    }
}

async function copyDir(args: {
    from: string
    to: string
    log: (msg: string) => void
    label: string
}): Promise<void> {
    if (!existsSync(args.from)) {
        args.log(`  skip:  ${args.label}s source missing (${args.from})`)
        return
    }
    await clearNonDirTarget(args.to)
    await mkdir(args.to, { recursive: true })
    const entries = await readdir(args.from, { withFileTypes: true })
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        const dest = join(args.to, entry.name)
        await clearSymlink(dest)
        await copyFile(join(args.from, entry.name), dest)
        args.log(`  write: ${dest}`)
    }
}
