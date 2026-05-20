import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface InstallSkillsOptions {
    /** Project root where .claude/{commands,agents}/ live. */
    cwd: string
    /**
     * Path to the luca-framework's bundled skills/ directory. Defaults to the
     * package's own `skills/` (resolved from this file's location).
     */
    skillsSource?: string
    log?: (msg: string) => void
}

/**
 * Copy bundled luca skills (slash commands + subagents) into the project's
 * .claude/ directory. Always overwrites files of the same name (the bundled
 * versions are the canonical source) but preserves user-authored files that
 * the install set doesn't touch.
 *
 * Designed to be called from `luca init` Step 4, idempotent on re-run.
 */
export async function installSkills(
    opts: InstallSkillsOptions,
): Promise<void> {
    const log = opts.log ?? (() => {})
    const skillsSource = opts.skillsSource ?? resolveDefaultSkillsSource()

    if (!existsSync(skillsSource)) {
        log(
            `  skip:  skills source not found at ${skillsSource} (running from a non-bundled dev tree?)`,
        )
        return
    }

    await copyDir({
        from: join(skillsSource, 'commands'),
        to: join(opts.cwd, '.claude/commands'),
        log,
        label: 'command',
    })

    await copyDir({
        from: join(skillsSource, 'agents'),
        to: join(opts.cwd, '.claude/agents'),
        log,
        label: 'agent',
    })
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
        await copyFile(
            join(args.from, entry.name),
            join(args.to, entry.name),
        )
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
 */
function resolveDefaultSkillsSource(): string {
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
    return ''
}
