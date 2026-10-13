import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

/** Claude Code's transcripts: `$CLAUDE_PROJECTS_DIR`, else `~/.claude/projects`. */
export const projectsDir = (): string =>
    process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects')

/** Claude Code's folder name for a path: every character but letters and digits becomes `-`. */
export const projectSlug = ({ path }: { path: string }): string =>
    path.replace(/[^A-Za-z0-9]/g, '-')

const jsonlUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            return entry.name === 'memory' ? [] : jsonlUnder(path)
        }
        return entry.name.endsWith('.jsonl') ? [path] : []
    })

/**
 * Every transcript of every session that ran in `root` or below it: the
 * coordinator, its subagents, and any `claude -p` it started there. Matched
 * on the root's real path, since Claude Code names folders after it.
 */
export const transcriptFiles = ({
    root,
    projects_dir,
}: {
    root: string
    projects_dir: string
}): string[] => {
    if (!existsSync(projects_dir)) return []
    const slug = projectSlug({ path: realpathSync(root) })
    const folders = readdirSync(projects_dir).filter(
        (name) => name === slug || name.startsWith(`${slug}-`)
    )
    return folders.flatMap((name) => jsonlUnder(join(projects_dir, name)))
}

const UsageSchema = z.object({
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
    cache_creation_input_tokens: z.number().default(0),
    cache_read_input_tokens: z.number().default(0),
})
export type Usage = z.infer<typeof UsageSchema>

export const ZERO_USAGE: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
}

const UsageLineSchema = z.object({
    message: z.object({ id: z.string(), usage: UsageSchema }),
})

const parseLine = (line: string): unknown => {
    try {
        return JSON.parse(line)
    } catch {
        return null
    }
}

/**
 * Token use across transcripts. Claude Code writes a model message on
 * several lines, each with the whole message's usage, so each message id
 * counts once.
 */
export const sumUsage = ({ files }: { files: string[] }): Usage => {
    const by_id = new Map<string, Usage>()
    for (const file of files) {
        for (const text of readFileSync(file, 'utf8').split('\n')) {
            if (!text.includes('"usage"')) continue
            const parsed = UsageLineSchema.safeParse(parseLine(text))
            if (parsed.success) {
                by_id.set(parsed.data.message.id, parsed.data.message.usage)
            }
        }
    }
    return [...by_id.values()].reduce(
        (sum, usage) => ({
            input_tokens: sum.input_tokens + usage.input_tokens,
            output_tokens: sum.output_tokens + usage.output_tokens,
            cache_creation_input_tokens:
                sum.cache_creation_input_tokens +
                usage.cache_creation_input_tokens,
            cache_read_input_tokens:
                sum.cache_read_input_tokens + usage.cache_read_input_tokens,
        }),
        ZERO_USAGE
    )
}

/**
 * One number to compare cost by, in input-token units. For the same model,
 * Anthropic prices a cache write at 1.25×, a cache read at 0.1×, and output
 * at 5× an input token.
 */
export const costUnits = ({ usage }: { usage: Usage }): number =>
    Math.round(
        usage.input_tokens +
            1.25 * usage.cache_creation_input_tokens +
            0.1 * usage.cache_read_input_tokens +
            5 * usage.output_tokens
    )

/** The coordinator's own transcript: it may read the withheld notes. */
export const coordinatorFile = ({
    ws,
    session_id,
    projects_dir,
}: {
    ws: string
    session_id: string
    projects_dir: string
}): string =>
    join(
        projects_dir,
        projectSlug({ path: realpathSync(ws) }),
        `${session_id}.jsonl`
    )

/** The transcripts, other than the coordinator's, that contain `marker`: a reviewer that saw withheld notes. */
export const leakedFiles = ({
    files,
    marker,
    coordinator_file,
}: {
    files: string[]
    marker: string
    coordinator_file: string
}): string[] =>
    files.filter(
        (file) =>
            file !== coordinator_file &&
            readFileSync(file, 'utf8').includes(marker)
    )
