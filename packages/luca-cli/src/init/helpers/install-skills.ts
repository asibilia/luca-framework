import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface InstallSkillsOptions {
    /**
     * Path to the global Claude config directory that receives
     * `commands/`, `agents/`, and `skills/`. Defaults to `~/.claude`.
     */
    claudeHome?: string
    /**
     * Path to the luca-framework's bundled skills/ directory. Defaults to the
     * package's own `skills/` (resolved from this file's location).
     */
    skillsSource?: string
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

/**
 * Copy bundled luca skills into the *global* Claude config directory:
 *   - commands/*.md          → ~/.claude/commands/ (slash commands)
 *   - agents/*.md            → ~/.claude/agents/   (subagents)
 *   - skills/<name>/SKILL.md → ~/.claude/skills/   (auto-triggerable skills)
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
 * Designed to be called from `luca init`, idempotent on re-run.
 */
export async function installSkills(opts: InstallSkillsOptions): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeHome = opts.claudeHome ?? defaultClaudeHome()
    const skillsSource = opts.skillsSource ?? resolveDefaultSkillsSource()

    if (!skillsSource || !existsSync(skillsSource)) {
        log(
            skillsSource
                ? `  skip:  skills source not found at ${skillsSource} (running from a non-bundled dev tree?)`
                : '  skip:  could not locate the luca-framework package root — skills not installed (running from a non-bundled dev tree?)'
        )
        return
    }

    await copyDir({
        from: join(skillsSource, 'commands'),
        to: join(claudeHome, 'commands'),
        log,
        label: 'command',
    })

    await copyDir({
        from: join(skillsSource, 'agents'),
        to: join(claudeHome, 'agents'),
        log,
        label: 'agent',
    })

    await copySkillTree({
        from: join(skillsSource, 'skills'),
        to: join(claudeHome, 'skills'),
        log,
    })
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
    skillsSource?: string
): Promise<BundledArtifacts | null> {
    const source = skillsSource ?? resolveDefaultSkillsSource()
    if (!source || !existsSync(source)) return null

    return {
        commands: await listEntries(join(source, 'commands'), 'file', '.md'),
        agents: await listEntries(join(source, 'agents'), 'file', '.md'),
        skills: await listEntries(join(source, 'skills'), 'dir'),
    }
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
        await mkdir(skillTo, { recursive: true })
        const files = await readdir(skillFrom, { withFileTypes: true })
        for (const file of files) {
            if (!file.isFile()) continue
            await copyFile(join(skillFrom, file.name), join(skillTo, file.name))
            args.log(`  write: ${join(skillTo, file.name)}`)
        }
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
    await mkdir(args.to, { recursive: true })
    const entries = await readdir(args.from, { withFileTypes: true })
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        await copyFile(join(args.from, entry.name), join(args.to, entry.name))
        args.log(`  write: ${join(args.to, entry.name)}`)
    }
}

/**
 * Resolve the bundled `skills/` directory from this file's location.
 *
 * Works both in workspace dev (where this file lives at packages/
 * luca-framework/src/init/helpers/) and inside the published tarball
 * (where the bundled dist/index.mjs lives at node_modules/@alecsibilia/
 * luca-framework/dist/). In both cases, walking up from import.meta.url
 * eventually finds the luca-framework package.json, and `skills/` is
 * a sibling of that file.
 *
 * Returns `null` (not an empty string) when the package root can't be
 * located, so the caller can guard explicitly rather than relying on
 * `existsSync('')`/`join('', …)` quirks.
 */
function resolveDefaultSkillsSource(): string | null {
    let dir = dirname(fileURLToPath(import.meta.url))
    // Bound the walk so we don't run forever in odd environments.
    for (let i = 0; i < 20; i += 1) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca-framework') {
                    return join(dir, 'skills')
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
